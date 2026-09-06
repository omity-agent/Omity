import { afterEach, expect, test } from "bun:test";
import { defaultBuiltIns, writeToolboxConfiguration } from "../../support/builtins";
import { mkdirSync, rmSync } from "node:fs";
import { AgentDatabase } from "../../../src/infrastructure/database/agentDatabase";
import { AppRegistry } from "../../../src/app/registry";
import { AskUserRuntime } from "../../../src/infrastructure/toolbox/runtime";
import { MockLanguageModelV4 } from "ai/test";
import { agentFixture } from "../../runtime/support/agentFixture";
import { appOwner } from "../../../src/infrastructure/process/ownership";
import { createApi } from "../../../src/app/http/handler";
import { createApiController } from "../support/apiController";
import { createControllerHosts } from "../../../src/app/hostCoordination";
import { createSettingsContext } from "../../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { processQueue } from "../../../src/runtime/queue";
import { projectSession } from "../../../src/app/sessionState";
import { required } from "../../support/database";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { simulateReadableStream } from "ai";
import { testSettings } from "../../support/settings";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
test("runtime publishes a derived title after committing tool results and restores it after reopening", async () => {
  const root = createTestDirectory("title-broadcast"),
    home = process.env["OMITY_HOME"],
    titleSettings = defaultBuiltIns().update_title!,
    updatedTitle = "新".repeat(titleSettings.parameters.title.minLength);
  roots.push(root);
  process.env["OMITY_HOME"] = join(root, "data");
  try {
    mkdirSync(join(root, "settings"));
    writeToolboxConfiguration(root, { toolboxes: { update_title: { enabled: true } } });
    const id = "title-session",
      paths = sessionPaths(id),
      db = new AgentDatabase(paths.dbPath);
    db.createSession(id, root);
    const registry = new AppRegistry(),
      info = (sessionId: string) => projectSession(registry.require(sessionId), "idle", null),
      controller = createApiController({
        sessions: () => registry.list().map((session) => info(session.id)),
      }),
      changed = (sessionId: string) => {
        registry.refresh(sessionId);
        controller.events.notifySession(info(sessionId));
      },
      hosts = createControllerHosts({
        askUser: new AskUserRuntime(),
        changed,
        context: createSettingsContext(root, join(root, "user")),
        events: controller.events,
        owner: appOwner(),
        root,
        sessionInfo: info,
        settings: testSettings(),
      }),
      abort = new AbortController();
    try {
      const api = createApi(controller),
        response = await api.request("/api/events/state", { signal: abort.signal }),
        reader = response.body!.getReader(),
        decoder = new TextDecoder(),
        snapshot = await reader.read();
      expect(decoder.decode(snapshot.value)).toContain('"title":"title-session"');
      const mcp = await hosts.mcp.load([]),
        fixture = agentFixture({
          db,
          model: new MockLanguageModelV4({
            doStream: [modelResponse(titleSettings.name, updatedTitle), modelResponse()],
          }),
          sessionId: id,
          tools: mcp.tools,
        });
      fixture.context.observer = {
        changed,
        token: () => {},
      };
      try {
        db.appendUser(id, "请更新标题");
        await processQueue(fixture.context, required(db.nextQueue(id)));
      } finally {
        fixture.executions.close();
      }
      let frames = "";
      while (!frames.includes(`"title":${JSON.stringify(updatedTitle)}`)) {
        const frame = await reader.read();
        if (frame.done) {
          throw new Error("会话事件流在发布标题前结束");
        }
        frames += decoder.decode(frame.value);
      }
      expect(frames).toContain("event: session\n");
      const sessionsResponse = await api.request("/api/sessions");
      expect(await sessionsResponse.json()).toMatchObject({
        sessions: [{ id, title: updatedTitle }],
      });
      expect(new AppRegistry().require(id).title).toBe(updatedTitle);
      abort.abort();
      await reader.cancel();
    } finally {
      abort.abort();
      await hosts.close();
      db.close();
    }
  } finally {
    if (home === undefined) {
      Reflect.deleteProperty(process.env, "OMITY_HOME");
    } else {
      process.env["OMITY_HOME"] = home;
    }
  }
});
function modelResponse(name?: string, title?: string) {
  return {
    stream: simulateReadableStream({
      chunks: [
        ...(name
          ? [
              {
                input: JSON.stringify({ title }),
                toolCallId: "heading-call",
                toolName: name,
                type: "tool-call" as const,
              },
            ]
          : [
              { id: "answer", type: "text-start" as const },
              { delta: "已完成", id: "answer", type: "text-delta" as const },
              { id: "answer", type: "text-end" as const },
            ]),
        {
          finishReason: {
            raw: undefined,
            unified: name ? ("tool-calls" as const) : ("stop" as const),
          },
          type: "finish" as const,
          usage: {
            inputTokens: { cacheRead: 0, cacheWrite: 0, noCache: 1, total: 1 },
            outputTokens: { reasoning: 0, text: 1, total: 1 },
          },
        },
      ],
    }),
  };
}
