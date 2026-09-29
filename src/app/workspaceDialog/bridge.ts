import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import folderDialog from "../../../settings/folderDialog.json";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { text } from "node:stream/consumers";
import { z } from "zod";

export const workspaceDialogArgument = "--internal-pick-workspace";
const selectionSchema = z.string().min(1).nullable(),
  exitSchema = z.tuple([z.number().nullable(), z.string().nullable()]);
export async function pickWorkspaceDirectory(
  [executable, ...args] = dialogCommand(),
  diagnostic: (line: string) => void = writeDiagnostic,
) {
  const child = spawn(executable, args, {
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  try {
    const [closed, output] = await Promise.all([
        once(child, "close"),
        text(child.stdout),
        forwardDiagnostics(child.stderr, diagnostic),
      ]),
      [status, signal] = exitSchema.parse(closed);
    if (status !== 0) {
      throw new Error(`${folderDialog.failureMessage} (${String(status ?? signal)})`);
    }
    return selectionSchema.parse(JSON.parse(output));
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill();
    }
  }
}
function dialogCommand(): [string, ...string[]] {
  const entrypoint = Bun.isStandaloneExecutable
    ? []
    : [fileURLToPath(new URL("../../cli.ts", import.meta.url))];
  return [process.execPath, ...entrypoint, workspaceDialogArgument];
}
async function forwardDiagnostics(
  stderr: NodeJS.ReadableStream,
  diagnostic: (line: string) => void,
) {
  const lines = createInterface({
    crlfDelay: Infinity,
    input: stderr,
  });
  for await (const line of lines) {
    if (line !== folderDialog.ignoredWarning) {
      diagnostic(`${line}\n`);
    }
  }
}
function writeDiagnostic(line: string) {
  process.stderr.write(line);
}
