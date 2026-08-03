#!/usr/bin/env bun
import { cliParser } from "./commandLine/parser";
import { executeCommand } from "./commandLine/execute";
import { loadUserEnvironment } from "./infrastructure/configuration/settings/files";
import { message } from "@optique/core/message";
import { run } from "@optique/run";

loadUserEnvironment();
const command = run(cliParser, {
  brief: message`AI Agent 执行环境。`,
  completion: "both",
  help: "both",
  programName: "omity",
});
await executeCommand(command);
