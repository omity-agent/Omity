import { expect, test } from "bun:test";
import { createTestDirectory } from "../../support/artifacts";
import { join } from "node:path";
import { pickWorkspaceDirectory } from "../../../src/app/workspaceDialog/bridge";

const warning = "libpng warning: iCCP: known incorrect sRGB profile",
  selectedDirectory = ["F:", "工作目录", "example"].join("\\");
function launch(mode: string, diagnostics: string[]) {
  return pickWorkspaceDirectory(
    [process.execPath, `${import.meta.dir}/emittedDiagnostics.ts`, mode],
    (line) => {
      diagnostics.push(line);
    },
  );
}
test("folder selection filters only the exact native warning across stderr chunks", async () => {
  const diagnostics: string[] = [];
  expect(await launch("selected", diagnostics)).toBe(selectedDirectory);
  expect(diagnostics).toEqual([
    "其他诊断：中文路径\n",
    "libpng warning: different warning\n",
    `${warning} (additional context)\n`,
    `prefix: ${warning}\n`,
    "last diagnostic\n",
  ]);
});
test("cancellation returns null without forwarding repeated or unterminated warnings", async () => {
  const diagnostics: string[] = [];
  expect(await launch("cancelled", diagnostics)).toBeNull();
  expect(diagnostics).toEqual([]);
});
test("native process failures remain visible and reject the folder selection", async () => {
  const diagnostics: string[] = [];
  expect(launch("failed", diagnostics)).rejects.toThrow("7");
  expect(diagnostics).toEqual(["native dialog failure\n"]);
});
test("invalid folder results are rejected instead of being treated as cancellation", async () => {
  expect(launch("invalid", [])).rejects.toThrow();
});
test("compiled applications reopen their executable to isolate native diagnostics", async () => {
  const executable = join(createTestDirectory("folder-dialog"), "selection-probe.exe"),
    build = await Bun.build({
      compile: { outfile: executable },
      entrypoints: [`${import.meta.dir}/emittedDiagnostics.ts`],
      minify: true,
    });
  expect(build.success).toBe(true);
  const diagnostics: string[] = [],
    directory = await pickWorkspaceDirectory([executable, "roundtrip"], (line) => {
      diagnostics.push(line);
    });
  expect(directory).toBe(selectedDirectory);
  expect(diagnostics).toContain("其他诊断：中文路径\n");
  expect(diagnostics).toContain("libpng warning: different warning\n");
  expect(diagnostics).not.toContain(`${warning}\n`);
}, 30_000);
