import { type AiStreamEvent, streamAiModel } from "../../../src/agent/model/request";
import { HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../../support/database";
import { echoDefinition, geminiApis, geminiWire } from "./endpointFixture";
import { replyStream, toolStream } from "./exchangeSamples";
import { aiModelTools } from "../../../src/agent/model/tools";
import { toModelMessages } from "../../../src/agent/aiMessages";

afterEach(cleanupDatabaseDirs);
test.each([...geminiApis])(
  "%s streams reasoning and tools, persists signatures, and continues with multimodal results",
  async (api) => {
    await using wire = geminiWire(api, [toolStream(api), replyStream(api)]);
    using db = makeDb();
    const user = new HumanMessage("Echo hello"),
      events: string[] = [],
      options = {
        sessionId: "gemini",
        settings: wire.settings,
        tools: aiModelTools([echoDefinition], api),
        write: ({ part }: AiStreamEvent) => {
          events.push(part.type);
        },
      },
      response = await streamAiModel({ ...options, messages: [user] });
    expect(response.tool_calls).toEqual([
      { args: { text: "hello" }, id: "echo-call", name: "echo", type: "tool_call" },
    ]);
    expect(events).toEqual(
      expect.arrayContaining(["reasoning-delta", "tool-input-delta", "tool-call"]),
    );
    expect(response.usage_metadata).toMatchObject({
      input_token_details: { cache_read: 3 },
      input_tokens: 10,
      output_tokens: 7,
      total_tokens: 17,
    });
    db.createSession("gemini", workspace);
    await db.syncHistory("gemini", [user, response]);
    const restored = required(db.history("gemini").at(-1)),
      result = await streamAiModel({
        ...options,
        messages: [
          user,
          restored,
          new ToolMessage({
            content: [
              { text: "hello", type: "text" },
              { data: "aGVsbG8=", mimeType: "image/png", type: "image" },
            ],
            name: "echo",
            tool_call_id: "echo-call",
          }),
        ],
      });
    expect(toModelMessages([restored], api)).toEqual(toModelMessages([response], api));
    expect(result.text).toBe("Finished");
    expect(events).toContain("text-delta");
    const request = required(wire.requests[1]);
    expect(request.headers.get("x-goog-api-key")).toBe("gemini-test-key");
    expect(request.body).not.toHaveProperty("tool_choice");
    if (api === "interactions") {
      expect(request.path).toBe("/v1beta/interactions");
      expect(request.body).toMatchObject({
        generation_config: {
          thinking_level: "high",
          thinking_summaries: "auto",
          tool_choice: "auto",
        },
        input: expect.arrayContaining([
          {
            signature: "reasoning-signature",
            summary: [{ text: "Need a tool", type: "text" }],
            type: "thought",
          },
          {
            arguments: { text: "hello" },
            id: "echo-call",
            name: "echo",
            signature: "tool-signature",
            type: "function_call",
          },
          {
            content: [
              {
                call_id: "echo-call",
                name: "echo",
                result: [
                  { text: "hello", type: "text" },
                  { data: "aGVsbG8=", mime_type: "image/png", type: "image" },
                ],
                type: "function_result",
              },
            ],
            type: "user_input",
          },
        ]),
        store: false,
        system_instruction: "test",
      });
      expect(request.body).not.toHaveProperty("previous_interaction_id");
    } else {
      expect(request.path).toBe("/v1beta/models/gemini-3-flash-preview:streamGenerateContent");
      expect(request.body).toMatchObject({
        contents: expect.arrayContaining([
          {
            parts: [
              { text: "Need a tool", thought: true, thoughtSignature: "reasoning-signature" },
              {
                functionCall: { args: { text: "hello" }, id: "echo-call", name: "echo" },
                thoughtSignature: "tool-signature",
              },
            ],
            role: "model",
          },
          {
            parts: [
              {
                functionResponse: {
                  id: "echo-call",
                  name: "echo",
                  parts: [{ inlineData: { data: "aGVsbG8=", mimeType: "image/png" } }],
                  response: { content: "hello", name: "echo" },
                },
              },
            ],
            role: "user",
          },
        ]),
        generationConfig: { thinkingConfig: { includeThoughts: true, thinkingLevel: "high" } },
        systemInstruction: { parts: [{ text: "test" }] },
        toolConfig: { functionCallingConfig: { mode: "AUTO" } },
      });
    }
  },
);
