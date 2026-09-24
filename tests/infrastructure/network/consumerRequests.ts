import { installNetworking } from "../../../src/infrastructure/network/installNetworking";
import { testSettings } from "../../support/settings";

const closeNetworking = installNetworking();
try {
  const { buildAiModel } = await import("../../../src/agent/model/provider"),
    { createCodexOAuthFetch } = await import("openai-codex-oauth"),
    { McpClientPool } = await import("../../../src/infrastructure/mcp/client/pool"),
    { Logger } = await import("../../../src/infrastructure/logging/logger"),
    settings = testSettings();
  settings.model.baseURL = "http://model.invalid";
  const result = await buildAiModel(settings).doGenerate({
      prompt: [{ content: [{ text: "test proxy", type: "text" }], role: "user" }],
    }),
    codex = createCodexOAuthFetch({
      baseURL: "http://codex.invalid",
      tokenUrl: "http://auth.invalid/token",
      tokens: {
        accessToken: "expired-test-token",
        accountId: "test-account",
        expiresAt: 1,
        refreshToken: "test-refresh-token",
      },
    }),
    response = await codex("http://codex.invalid/responses", {
      body: JSON.stringify({ input: [], model: "test" }),
      method: "POST",
    }),
    pool = new McpClientPool(
      {
        fixture: {
          automaticSSEFallback: false,
          reconnect: { enabled: false, maxAttempts: 0 },
          transport: "http",
          url: "http://tools.invalid/mcp",
        },
      },
      { delayMs: 1, maxAttempts: 0 },
      new Logger("error", true),
      process.cwd(),
    );
  try {
    const client = await pool.getClient("fixture");
    if (!client) {
      throw new Error("测试 MCP 客户端未创建");
    }
    const tools = await client.listTools();
    console.log(JSON.stringify({ codex: await response.text(), model: result.content, tools }));
  } finally {
    await pool.close();
  }
} finally {
  await closeNetworking();
}
