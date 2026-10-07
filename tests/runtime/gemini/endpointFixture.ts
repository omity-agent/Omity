import type { ModelToolDefinition } from "../../../src/infrastructure/mcp/tools/definitions";
import { buildConfiguredAiModel } from "../../../src/agent/model/provider";
import { parseModelSettings } from "../../../src/infrastructure/configuration/settings/schema";
import { randomUUID } from "node:crypto";
import { testSettings } from "../../support/settings";
import { z } from "zod";

export const geminiApis = ["interactions", "generate-content"] as const;
export type GeminiApi = (typeof geminiApis)[number];
export const echoDefinition: ModelToolDefinition = {
  description: "Echo application text",
  freeform: false,
  inputSchema: {
    properties: { text: { type: "string" } },
    required: ["text"],
    type: "object",
  },
  name: "echo",
};
interface CapturedRequest {
  body: Record<string, unknown>;
  headers: Headers;
  path: string;
}
export function geminiWire(api: GeminiApi, responses: Response[] = []) {
  const requests: CapturedRequest[] = [],
    apiKeyEnv = `GEMINI_WIRE_${randomUUID()}`,
    server = Bun.serve({
      async fetch(request) {
        const response = responses[requests.length];
        requests.push({
          body: z.record(z.string(), z.unknown()).parse(await request.json()),
          headers: request.headers,
          path: new URL(request.url).pathname,
        });
        if (response) {
          return response.clone();
        }
        return Response.json(
          { error: { code: 400, message: "request captured", status: "INVALID_ARGUMENT" } },
          { status: 400 },
        );
      },
      hostname: "127.0.0.1",
      port: 0,
    }),
    settings = testSettings();
  process.env[apiKeyEnv] = "gemini-test-key";
  settings.model = parseModelSettings({
    ...settings.model,
    adapter: api,
    apiKeyEnv,
    baseURL: new URL("/v1beta", server.url).href,
    maxConcurrentRequests: 1,
    model: "gemini-3-flash-preview",
    raceIntervalMs: 60_000,
    reasoning_effort: "high",
  });
  try {
    const model = buildConfiguredAiModel(settings.model);
    return {
      model,
      requests,
      settings,
      async [Symbol.asyncDispose]() {
        delete process.env[apiKeyEnv];
        await server.stop(true);
      },
    };
  } catch (error) {
    delete process.env[apiKeyEnv];
    void server.stop(true);
    throw error;
  }
}
export function eventStream(events: Record<string, unknown>[]) {
  return new Response(events.map((event) => `data: ${JSON.stringify(event)}\n\n`).join(""), {
    headers: { "content-type": "text/event-stream" },
  });
}
