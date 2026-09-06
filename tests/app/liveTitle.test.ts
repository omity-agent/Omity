import { afterEach, expect, test } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AppRegistry } from "../../src/app/registry";
import { AskUserRuntime } from "../../src/infrastructure/toolbox/runtime";
import { appOwner } from "../../src/infrastructure/process/ownership";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";
import { createControllerHosts } from "../../src/app/hostCoordination";
import { createSettingsContext } from "../../src/infrastructure/configuration/settings/context";
import { createTestDirectory } from "../support/artifacts";
import { join } from "node:path";
import { projectSession } from "../../src/app/sessionState";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";
import { testSettings } from "../support/settings";
import { writeToolboxConfiguration } from "../support/builtins";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
test("app-wired title tool broadcasts its persisted title and restores it after reopening", async () => {
  const root = createTestDirectory("title-broadcast"),
    home = process.env["OMITY_HOME"];
  roots.push(root);
  process.env["OMITY_HOME"] = join(root, "data");
  try {
    mkdirSync(join(root, "settings"));
    writeToolboxConfiguration(root);
    const id = "title-session",
      paths = sessionPaths(id),
      db = new AgentDatabase(paths.dbPath);
    db.createSession(id, root);
    db.close();
    const registry = new AppRegistry(),
      info = (sessionId: string) => projectSession(registry.require(sessionId), "idle", null),
      controller = createApiController({
        sessions: () => registry.list().map((session) => info(session.id)),
      }),
      hosts = createControllerHosts({
        askUser: new AskUserRuntime(),
        changed: (sessionId) => {
          registry.refresh(sessionId);
          controller.events.notifySession(info(sessionId));
        },
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
        tool = mcp.tools.find(({ name }) => name === "update_title")!;
      expect(
        await tool.invoke(
          { title: "实时更新标题" },
          {
            configurable: { sessionId: id },
          },
        ),
      ).toBe("ok");
      const frame = await reader.read(),
        changed = decoder.decode(frame.value);
      expect(changed).toContain("event: session\n");
      expect(changed).toContain('"title":"实时更新标题"');
      const sessionsResponse = await api.request("/api/sessions");
      expect(await sessionsResponse.json()).toMatchObject({
        sessions: [{ id, title: "实时更新标题" }],
      });
      expect(new AppRegistry().require(id).title).toBe("实时更新标题");
      abort.abort();
      await reader.cancel();
    } finally {
      abort.abort();
      await hosts.close();
    }
  } finally {
    if (home === undefined) {
      Reflect.deleteProperty(process.env, "OMITY_HOME");
    } else {
      process.env["OMITY_HOME"] = home;
    }
  }
});
