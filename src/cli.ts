#!/usr/bin/env bun
// oxlint-disable-next-line import/no-unassigned-import -- Initialize Reflect metadata before loading WebAuthn dependencies.
import "reflect-metadata";
import { message, text } from "@optique/core/message";
import { run } from "@optique/run";

import { workspaceDialogArgument } from "./app/workspaceDialog/bridge";
import { cliParser } from "./commandLine/parser";
import { localize } from "./i18n/server";
import { loadUserEnvironment } from "./infrastructure/configuration/settings/files";
import { installNetworking } from "./infrastructure/network/installNetworking";

async function main() {
  loadUserEnvironment();
  const command = run(cliParser, {
      brief: message`${text(localize("cli:brief"))}`,
      completion: "both",
      help: "both",
      programName: "omity",
    }),
    closeNetworking = installNetworking();
  try {
    const { executeCommand } = await import("./commandLine/execute");
    await executeCommand(command);
  } finally {
    await closeNetworking();
  }
}
if (process.argv[2] === workspaceDialogArgument) {
  const { showNativeFolderDialog } = await import("./app/workspaceDialog/nativeFolder");
  await showNativeFolderDialog();
} else {
  await main();
}
