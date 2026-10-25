import { openaiCredentials } from "@openai-oauth/local";

import { installNetworking } from "../../../src/infrastructure/network/installNetworking";
import { testSettings } from "../../support/settings";
import { createOAuthFile, createTestJwt } from "../openai/authSessionFixture";

const closeNetworking = installNetworking();
try {
  using auth = await createOAuthFile({
    accessToken: createTestJwt({ exp: 1 }),
    refreshToken: "test-refresh-token",
  });
  const { buildAiModel } = await import("../../../src/agent/model/provider"),
    { createCodexConnection } = await import("../../../src/infrastructure/openai/oauthConnection"),
    { createResponsesWebsocketFetch } = await import("../../../src/agent/model/responsesWebsocket"),
    { McpClientPool } = await import("../../../src/infrastructure/mcp/client/pool"),
    { Logger } = await import("../../../src/infrastructure/logging/logger"),
    settings = testSettings();
  settings.model.baseURL = "http://model.invalid";
  const result = await buildAiModel(settings).doGenerate({
      prompt: [{ content: [{ text: "test proxy", type: "text" }], role: "user" }],
    }),
    connection = createCodexConnection({
      codexVersion: "0.154.4",
      credentials: openaiCredentials({
        authFilePath: auth.path,
        fetch: globalThis.fetch,
        tokenUrl: "http://auth.invalid/token",
      }),
    }),
    response = await createResponsesWebsocketFetch(connection.websocket)(
      "http://codex.invalid/responses",
      {
        body: JSON.stringify({ input: [], model: "test" }),
        method: "POST",
      },
    ),
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
    const client = await pool.getClient("fixture"),
      tools = await client.listTools();
    console.log(JSON.stringify({ codex: await response.text(), model: result.content, tools }));
  } finally {
    await pool.close();
  }
} finally {
  await closeNetworking();
}
