import { AccessService } from "../../../src/app/access/service";
import { AppController } from "../../../src/app/controller";
import { type Socket } from "node:net";
import { closeAppResources } from "../../../src/app/runtime/shutdown";
import { createApi } from "../../../src/app/http/handler";
import { createServer } from "node:http";
import { createTestDirectory } from "../../support/artifacts";
import { getRequestListener } from "@hono/node-server";
import { join } from "node:path";
import { loadSettings } from "../../../src/infrastructure/configuration/settings/load";
import { once } from "node:events";
import { requestListenerOptions } from "../../../settings/networking";
import { rmSync } from "node:fs";
import { writeTestConfiguration } from "../../support/configuration";

export async function liveApplication(adapter: "completions" | "responses-sse" = "completions") {
  const root = createTestDirectory("http-workflow"),
    modelName = adapter === "responses-sse" ? "gpt-6.1-sol" : "test",
    previousHome = process.env["OMITY_HOME"],
    previousKey = process.env["TEST_KEY"],
    requests: unknown[] = [],
    model = Bun.serve({
      async fetch(request) {
        requests.push(await request.json());
        if (adapter === "responses-sse") {
          return responsesReply(modelName);
        }
        const frame = {
            choices: [{ delta: { content: "workflow answer" }, finish_reason: null, index: 0 }],
            created: 1,
            id: "workflow-reply",
            model: modelName,
            object: "chat.completion.chunk",
          },
          ending = { ...frame, choices: [{ delta: {}, finish_reason: "stop", index: 0 }] };
        return new Response(
          `${[frame, ending]
            .map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`)
            .join("")}data: [DONE]\n\n`,
          { headers: { "content-type": "text/event-stream" } },
        );
      },
      hostname: "127.0.0.1",
      port: 0,
    });
  process.env["OMITY_HOME"] = join(root, "home");
  process.env["TEST_KEY"] = "local-workflow";
  writeTestConfiguration(root, {
    agentYaml: `recursionLimit: 50
prompts: [system.md]
toolOutput: { maxTokens: 8192 }
toolExecution: { parallel: true }
skills: { enabled: false, directory: ~/.agents/skills, skillEnabled: {} }
`,
    modelYaml: `adapter: ${adapter}
model: ${modelName}
apiKeyEnv: TEST_KEY
baseURL: ${new URL("/v1", model.url).href}
maxConcurrentRequests: 1
temperature: ${adapter === "responses-sse" ? "null" : "0"}
reasoning_effort: ${adapter === "responses-sse" ? "medium" : "null"}
raceIntervalMs: 1000
retryDelayMs: 1000
`,
  });
  const controller = new AppController(root),
    access = new AccessService(loadSettings(root)),
    server = createServer(
      getRequestListener(createApi(controller, access).fetch, requestListenerOptions),
    ),
    connections = new Set<Socket>();
  server.on("connection", (socket) => {
    connections.add(socket);
    socket.once("close", () => connections.delete(socket));
  });
  const listening = once(server, "listening");
  server.listen(0, "127.0.0.1");
  await listening;
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("HTTP 集成夹具未监听端口");
  }
  return {
    controller,
    requests,
    root,
    url: `http://127.0.0.1:${address.port.toString()}`,
    async [Symbol.asyncDispose]() {
      try {
        await closeAppResources(
          {
            access,
            controller,
            releaseLock: () => undefined,
            server: { connections, instance: server },
          },
          { error: console.error, info: () => undefined },
          "SIGTERM",
        );
      } finally {
        await model.stop(true);
        if (previousHome === undefined) {
          delete process.env["OMITY_HOME"];
        } else {
          process.env["OMITY_HOME"] = previousHome;
        }
        if (previousKey === undefined) {
          delete process.env["TEST_KEY"];
        } else {
          process.env["TEST_KEY"] = previousKey;
        }
        rmSync(root, { force: true, recursive: true });
      }
    },
  };
}
function responsesReply(model: string) {
  const message = {
      content: [{ annotations: [], text: "workflow answer", type: "output_text" }],
      id: "workflow-message",
      role: "assistant",
      type: "message",
    },
    events = [
      {
        response: { created_at: 1, id: "workflow-response", model },
        type: "response.created",
      },
      {
        item: { ...message, content: [] },
        output_index: 0,
        type: "response.output_item.added",
      },
      {
        content_index: 0,
        delta: "workflow answer",
        item_id: message.id,
        output_index: 0,
        type: "response.output_text.delta",
      },
      { item: message, output_index: 0, type: "response.output_item.done" },
      {
        response: { usage: { input_tokens: 1, output_tokens: 1 } },
        type: "response.completed",
      },
    ];
  return new Response(
    events.map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`).join(""),
    { headers: { "content-type": "text/event-stream" } },
  );
}
