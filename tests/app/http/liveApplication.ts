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
import { rmSync } from "node:fs";
import { writeTestConfiguration } from "../../support/configuration";

export async function liveApplication() {
  const root = createTestDirectory("http-workflow"),
    previousHome = process.env["OMITY_HOME"],
    previousKey = process.env["TEST_KEY"],
    requests: unknown[] = [],
    model = Bun.serve({
      async fetch(request) {
        requests.push(await request.json());
        const frame = {
            choices: [{ delta: { content: "workflow answer" }, finish_reason: null, index: 0 }],
            created: 1,
            id: "workflow-reply",
            model: "test",
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
    modelYaml: `adapter: completions
model: test
apiKeyEnv: TEST_KEY
baseURL: ${new URL("/v1", model.url).href}
maxConcurrentRequests: 1
temperature: 0
raceIntervalMs: 1000
retryDelayMs: 1000
`,
  });
  const controller = new AppController(root),
    access = new AccessService(loadSettings(root)),
    server = createServer(
      getRequestListener(createApi(controller, access).fetch, { overrideGlobalObjects: false }),
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
