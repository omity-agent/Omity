import { defaultBuiltIns, writeToolboxConfiguration } from "../../../support/builtins";
import { expect, test } from "bun:test";
import { liveApplication } from "../liveApplication";
import { resolve } from "node:path";
import { submissionForm } from "../../../../src/app/attachments/submission";

test.each(["freeformToolInputs", "toolDescriptionOverrides"] as const)(
  "enabled MCP validates original tool names in %s",
  async (field) => {
    await using app = await liveApplication();
    writeToolboxConfiguration(app.root, {
      mcpServers: {
        active: {
          args: [resolve(import.meta.dir, "argumentServer.ts"), "original"],
          command: process.execPath,
          [field]:
            field === "freeformToolInputs" ? ["renamed_tool"] : { renamed_tool: "absent.md" },
        },
      },
      toolNameOverrides: { active__original: "renamed_tool" },
    });
    const response = await fetch(`${app.url}/api/sessions`, {
      body: submissionForm({ history: [], message: "hello", workspace: app.root }, []),
      method: "POST",
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      error: {
        code: "MCP_LOAD_FAILED",
        details: {
          failures: expect.arrayContaining([
            expect.objectContaining({
              error: expect.objectContaining({
                message: expect.stringContaining("不存在的工具：renamed_tool"),
              }),
              server: "active",
              stage: "customization",
            }),
          ]),
        },
      },
    });
    expect(app.requests).toHaveLength(0);
  },
  15_000,
);
test("all disabled MCP customizations and unavailable global renames are ignored with no tools loaded", async () => {
  await using app = await liveApplication();
  writeToolboxConfiguration(app.root, {
    mcpServers: {
      inactive: {
        command: `\${OMITY_INACTIVE_COMMAND}`,
        freeformToolInputs: ["unavailable"],
        prefixToolNameWithServerName: false,
        toolDescriptionOverrides: { unavailable: `\${OMITY_INACTIVE_DESCRIPTION}` },
      },
    },
    toolNameOverrides: { unavailable: "ignored_alias" },
    toolboxes: Object.fromEntries(
      Object.entries(defaultBuiltIns()).map(([name, configuration]) => [
        name,
        { ...configuration, enabled: false },
      ]),
    ),
  });
  const response = await fetch(`${app.url}/api/sessions`, {
    body: submissionForm(
      {
        history: [],
        mcpOverrides: { inactive: false },
        message: "hello",
        workspace: app.root,
      },
      [],
    ),
    method: "POST",
  });
  expect(response.status).toBe(200);
});
