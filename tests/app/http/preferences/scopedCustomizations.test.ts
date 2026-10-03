import { expect, test } from "bun:test";
import { join, resolve } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
import { AgentDatabase } from "../../../../src/infrastructure/database/agentDatabase";
import { AskUserRuntime } from "../../../../src/infrastructure/toolbox/runtime";
import { createAppMcp } from "../../../../src/app/runtime/resources/toolPool";
import { createSettingsContext } from "../../../../src/infrastructure/configuration/settings/context";
import { liveApplication } from "../liveApplication";
import { readDefinitionRecord } from "../../../../src/infrastructure/database/records/session/metadata";
import { sessionPaths } from "../../../../src/infrastructure/configuration/sessionPaths";
import { submissionForm } from "../../../../src/app/attachments/submission";
import { writeToolboxConfiguration } from "../../../support/builtins";
import { z } from "zod";

const sessionResponse = z.object({ session: z.object({ id: z.string() }) });
test.each([true, false])(
  "MCP-owned original-name customizations survive server selection and snapshot restoration (prefix: %s)",
  async (prefixToolNameWithServerName) => {
    await using app = await liveApplication("responses-sse");
    const sourceName = prefixToolNameWithServerName ? "active__original" : "original",
      workspace = join(app.root, "workspace"),
      profileDirectory = join(app.root, "home", "settings", "profiles", "custom"),
      server = {
        args: [resolve(import.meta.dir, "argumentServer.ts"), "original"],
        command: process.execPath,
        freeformToolInputs: ["original"],
        prefixToolNameWithServerName,
        toolDescriptionOverrides: { original: "settings/prompts/original.md" },
      },
      configuration = {
        mcpServers: {
          active: server,
          inactive: {
            command: `\${OMITY_INACTIVE_COMMAND}`,
            freeformToolInputs: ["unavailable"],
            prefixToolNameWithServerName,
            toolDescriptionOverrides: { unavailable: `\${OMITY_INACTIVE_DESCRIPTION}` },
          },
        },
        toolNameOverrides: {
          [sourceName]: "renamed_tool",
          missing_source: "unused_alias",
        },
      };
    mkdirSync(workspace);
    mkdirSync(join(profileDirectory, "prompts"), { recursive: true });
    writeFileSync(join(app.root, "settings", "prompts", "original.md"), "base description");
    writeFileSync(join(profileDirectory, "prompts", "override.md"), "profile description");
    writeFileSync(
      join(profileDirectory, "toolbox.yaml"),
      "mcpServers:\n  active:\n    toolDescriptionOverrides:\n      original: prompts/override.md\n",
    );
    writeToolboxConfiguration(app.root, configuration);
    const overrides = { active: true, inactive: false },
      created = await fetch(`${app.url}/api/sessions`, {
        body: submissionForm(
          { history: [], mcpOverrides: overrides, message: "hello", profile: "custom", workspace },
          [],
        ),
        method: "POST",
      });
    expect(created.status).toBe(200);
    const { session } = sessionResponse.parse(await created.json()),
      database = new AgentDatabase(sessionPaths(session.id).dbPath),
      restoredMcp = createAppMcp(
        app.root,
        "error",
        createSettingsContext(app.root),
        new AskUserRuntime(() => undefined),
      );
    try {
      const deadline = Date.now() + 5000;
      while (
        !app.controller.transcript(session.id).queue.every(({ status }) => status === "done")
      ) {
        const failure = app.controller.sessions().find(({ id }) => id === session.id)?.error;
        if (failure) {
          throw new Error(failure.message, { cause: failure });
        }
        if (Date.now() >= deadline) {
          throw new Error("会话未在期限内完成");
        }
        await app.controller.events.wait(session.id, 25);
      }
      expect(app.requests).toHaveLength(1);
      expect(app.requests[0]).toMatchObject({
        tools: expect.arrayContaining([
          expect.objectContaining({
            description: "profile description",
            name: "renamed_tool",
            type: "custom",
          }),
        ]),
      });
      const definition = readDefinitionRecord(database.db, session.id),
        tool = definition.prefix.tools.tools.find(({ name }) => name === "renamed_tool");
      expect(tool).toMatchObject({ description: "profile description", freeform: true });
      expect(definition.prefix.tools.serverOverrides).toEqual(overrides);
      writeFileSync(
        join(profileDirectory, "toolbox.yaml"),
        "mcpServers:\n  active:\n    freeformToolInputs: [unavailable]\n    toolDescriptionOverrides: { unavailable: absent.md }\n",
      );
      const restored = await restoredMcp.loadSession(
        session.id,
        database.profiles(session.id),
        definition.prefix.tools,
        workspace,
      );
      expect(Object.keys(restored.configuration.mcpServers)).toEqual(["active"]);
      expect(restored.freeformToolParameters.get("renamed_tool")).toBe("input");
      expect(restored.tools.map(({ name }) => name)).toContain("ask_user__open_ended");
      expect(restored.tools.map(({ name }) => name)).not.toContain("unused_alias");
    } finally {
      await restoredMcp.close();
      database.close();
    }
  },
  15_000,
);
