import { afterEach, expect, test } from "bun:test";
import { readFileSync, readdirSync, rmSync } from "node:fs";
import { ToolMessage } from "@langchain/core/messages";
import { countTokens } from "../../src/runtime/tokenizer";
import { join } from "node:path";
import { redirectLargeToolOutput } from "../../src/runtime/largeOutput";
import { resolveSessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { userDataDirectory } from "../../src/infrastructure/configuration/settings/files";

afterEach(() => {
  for (const sessionId of ["demo", "demo-session"]) {
    rmSync(resolveSessionPaths(sessionId).dir, { force: true, recursive: true });
  }
});
test("normalizes MCP text content before size handling", async () => {
  const short = "短输出",
    shortMessage = new ToolMessage({
      content: JSON.stringify({ content: [{ text: short, type: "text" }] }),
      id: "short-message",
      metadata: { source: "mcp" },
      response_metadata: { requestId: "request-1" },
      tool_call_id: "call-0",
    }),
    original = "结构化长输出 ".repeat(100),
    message = new ToolMessage({
      content: JSON.stringify({
        content: [{ text: original, type: "text" }],
        structuredContent: { ignored: true },
      }),
      name: "demo_tool",
      tool_call_id: "call-1",
    }),
    normalized = await redirectLargeToolOutput(shortMessage, {
      maxTokens: countTokens(short),
      sessionId: "demo-session",
    }),
    redirected = await redirectLargeToolOutput(message, {
      maxTokens: 1,
      sessionId: "demo-session",
    }),
    outputPath = onlyOutputPath("demo-session");
  expect(normalized.content).toBe(short);
  expect(normalized).toMatchObject({
    id: "short-message",
    metadata: { source: "mcp" },
    response_metadata: { requestId: "request-1" },
    tool_call_id: "call-0",
  });
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.name).toBe("demo_tool");
});
test("accepts hook call IDs when writing large output", async () => {
  const outputId = "omity-hook:session/thread:tool",
    original = "long hook output",
    redirected = await redirectLargeToolOutput(
      new ToolMessage({ content: original, tool_call_id: outputId }),
      {
        maxTokens: 1,
        sessionId: "demo-session",
      },
    ),
    outputPath = onlyOutputPath("demo-session");
  expect(readFileSync(outputPath, "utf8")).toBe(original);
  expect(redirected.content).toContain(outputPath);
});
test("uses compact URL-safe large output file names", async () => {
  await redirectLargeToolOutput(new ToolMessage({ content: "long output", tool_call_id: "call" }), {
    maxTokens: 1,
    sessionId: "demo-session",
  });
  const names = readdirSync(join(resolveSessionPaths("demo-session").dir, "large_output"));
  expect(names).toHaveLength(1);
  expect(names[0]).toMatch(/^[0-9a-z]{8}\.txt$/);
});
test("keeps MCP images outside the text size limit", async () => {
  const imageData = "A".repeat(1024 * 1024),
    imageMessage = new ToolMessage({
      content: JSON.stringify({
        content: [{ data: imageData, mimeType: "image/png", type: "image" }],
      }),
      tool_call_id: "call-2",
    }),
    errorMessage = new ToolMessage({
      content: JSON.stringify({
        content: [{ text: "MCP 工具报错".repeat(100), type: "text" }],
        isError: true,
      }),
      tool_call_id: "call-3",
    }),
    imageRedirected = await redirectLargeToolOutput(imageMessage, {
      maxTokens: 1,
      sessionId: "demo",
    }),
    errorRedirected = await redirectLargeToolOutput(errorMessage, {
      maxTokens: 1,
      sessionId: "demo",
    });
  expect(imageRedirected.content).toEqual([
    { data: imageData, mimeType: "image/png", type: "image" },
  ]);
  expect(errorRedirected).toBe(errorMessage);
});
test("redirects mixed output text without removing its image", async () => {
  const text = "long text ".repeat(100),
    image = {
      data: "A".repeat(1024 * 1024),
      mime_type: "image/png",
      source_type: "base64",
      type: "image",
    },
    redirected = await redirectLargeToolOutput(
      new ToolMessage({
        content: [{ text, type: "text" }, image],
        tool_call_id: "call-4",
      }),
      {
        maxTokens: 1,
        sessionId: "demo",
      },
    );
  expect(redirected.content).toEqual([
    { text: expect.stringContaining("工具输出过长"), type: "text" },
    image,
  ]);
});
function onlyOutputPath(sessionId: string) {
  const directory = join(userDataDirectory(), "sessions", sessionId, "large_output"),
    [name] = readdirSync(directory);
  return join(directory, name ?? "");
}
