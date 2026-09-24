#!/usr/bin/env bun
import { cliParser } from "./commandLine/parser";
import { installNetworking } from "./infrastructure/network/installNetworking";
import { loadUserEnvironment } from "./infrastructure/configuration/settings/files";
import { message } from "@optique/core/message";
import { run } from "@optique/run";

async function main() {
  loadUserEnvironment();
  const command = run(cliParser, {
      brief: message`AI Agent 执行环境。`,
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
await main();
