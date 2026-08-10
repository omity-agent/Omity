import { afterEach, expect, test } from "bun:test";
import {
  normalizeMcpServers,
  parseMcpConfiguration,
  readMcpConfiguration,
} from "../../src/infrastructure/mcp/config";
import {
  normalizeMcpToolNameOverrides,
  renameMcpTools,
} from "../../src/infrastructure/mcp/toolOverrides";
import { rmSync, writeFileSync } from "node:fs";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";

const savedEnv = new Map<string, string | undefined>();
afterEach(() => {
  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      Reflect.deleteProperty(process.env, key);
    } else {
      process.env[key] = value;
    }
  }
  savedEnv.clear();
});
function setEnv(key: string, value: string) {
  if (!savedEnv.has(key)) {
    savedEnv.set(key, process.env[key]);
  }
  process.env[key] = value;
}
test("mcp config expands env placeholders recursively", () => {
  setEnv("MCP_API_KEY", "secret");
  setEnv("MCP_TOKEN", "token");
  const directory = createTestDirectory("mcp");
  const path = join(directory, "toolbox.yaml");
  try {
    writeFileSync(
      path,
      `mcpServers:
  search:
    command: npx
    args: ["server", "--key=\${MCP_API_KEY}"]
    env:
      API_KEY: "\${MCP_API_KEY}"
    headers:
      Authorization: "Bearer \${MCP_TOKEN}"
`,
    );
    expect(readMcpConfiguration(path).mcpServers).toEqual({
      search: {
        args: ["server", "--key=secret"],
        command: "npx",
        env: {
          API_KEY: "secret",
        },
        headers: {
          Authorization: "Bearer token",
        },
        stderr: "pipe",
      },
    });
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test("mcp config reports missing env placeholders", () => {
  const directory = createTestDirectory("mcp");
  const path = join(directory, "toolbox.yaml");
  try {
    writeFileSync(path, `mcpServers: { test: { command: "\${MISSING_MCP_KEY}" } }\n`);
    expect(() => readMcpConfiguration(path)).toThrow(
      `${path}.mcpServers.test.command 引用了未设置的环境变量 MISSING_MCP_KEY`,
    );
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test("mcp config rejects session placeholders", () => {
  const directory = createTestDirectory("mcp");
  const path = join(directory, "toolbox.yaml");
  try {
    writeFileSync(path, `mcpServers: { test: { command: "\${session}" } }\n`);
    expect(() => readMcpConfiguration(path)).toThrow(`会话占位符 \${session} 没有可用值`);
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test("mcp config rejects unknown top-level fields", () => {
  const directory = createTestDirectory("mcp");
  const path = join(directory, "toolbox.yaml");
  try {
    writeFileSync(path, "mcpServers: {}\nunknown: true\n");
    expect(() => readMcpConfiguration(path)).toThrow("Unrecognized key");
  } finally {
    rmSync(directory, { recursive: true });
  }
});
test("mcp stdio config fills omitted args and captures stderr", () => {
  expect(
    normalizeMcpServers({
      noisy: {
        args: ["--serve"],
        command: "server.exe",
        extension: { enabled: true },
        stderr: "inherit",
        transport: "stdio",
      },
      omitted: {
        command: "server.exe",
        transport: "stdio",
      },
    }),
  ).toEqual({
    noisy: {
      args: ["--serve"],
      command: "server.exe",
      extension: { enabled: true },
      stderr: "pipe",
      transport: "stdio",
    },
    omitted: {
      args: [],
      command: "server.exe",
      stderr: "pipe",
      transport: "stdio",
    },
  });
});
test("mcp stdio config rejects non-array args", () => {
  expect(() =>
    normalizeMcpServers({
      invalid: { args: null, command: "server.exe" },
    }),
  ).toThrow();
});
test("mcp stdio config validates its restart policy", () => {
  expect(() =>
    parseMcpConfiguration(
      { stdio: { restart: { delayMs: 1000, maxAttempts: 0 } } },
      "toolbox.yaml",
    ),
  ).toThrow();
});
test("mcp config rejects renaming a tool to agent", () => {
  expect(() => normalizeMcpToolNameOverrides({ web__search: "agent" })).toThrow(
    "MCP 工具重命名配置 settings/toolbox.yaml.toolNameOverrides.web__search 不能命名为 agent",
  );
});
test("mcp tool name overrides rename loaded tools", () => {
  const tools = toolNames(["web__search", "web__crawl"]);
  expect(
    renameMcpTools(tools, {
      web__search: "search",
    }).map((tool) => tool.name),
  ).toEqual(["search", "web__crawl"]);
});
test("mcp tool name overrides report missing source tools", () => {
  expect(() =>
    renameMcpTools(toolNames(["web__search"]), {
      web__missing: "missing",
    }),
  ).toThrow("MCP 工具重命名配置引用了不存在的工具：web__missing");
});
test("mcp tool name overrides report renamed conflicts", () => {
  expect(() =>
    renameMcpTools(toolNames(["web__search", "web__crawl"]), {
      web__search: "web__crawl",
    }),
  ).toThrow("MCP 工具重命名后名称冲突：web__crawl");
});
function toolNames(names: string[]) {
  return names.map(
    (name) =>
      new DynamicStructuredTool({
        description: "test tool",
        func: () => Promise.resolve("ok"),
        name,
        schema: {
          additionalProperties: false,
          properties: {},
          type: "object" as const,
        },
      }),
  );
}
