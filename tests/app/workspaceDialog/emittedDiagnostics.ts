import {
  pickWorkspaceDirectory,
  workspaceDialogArgument,
} from "../../../src/app/workspaceDialog/bridge";
import { writeSync } from "node:fs";

const warning = "libpng warning: iCCP: known incorrect sRGB profile",
  [mode] = process.argv.slice(2);
switch (mode) {
  case "roundtrip": {
    writeSync(1, JSON.stringify(await pickWorkspaceDirectory()));
    break;
  }
  case workspaceDialogArgument:
  case "selected": {
    writeSync(2, `${warning}\r`);
    await Bun.sleep(20);
    writeSync(2, "\nlibpng warning: iCCP: known incorrect ");
    await Bun.sleep(20);
    writeSync(2, "sRGB profile\n");
    const diagnostic = Buffer.from("其他诊断：中文路径\n");
    writeSync(2, diagnostic.subarray(0, 4));
    await Bun.sleep(20);
    writeSync(2, diagnostic.subarray(4));
    writeSync(2, "libpng warning: different warning\r\n");
    writeSync(2, `${warning} (additional context)\n`);
    writeSync(2, `prefix: ${warning}\n`);
    writeSync(2, "last diagnostic");
    writeSync(1, JSON.stringify(["F:", "工作目录", "example"].join("\\")));
    break;
  }
  case "cancelled": {
    writeSync(2, `${warning}\n`.repeat(2000));
    writeSync(2, warning);
    writeSync(1, "null");
    break;
  }
  case "failed": {
    writeSync(2, `${warning}\nnative dialog failure\n`);
    process.exitCode = 7;
    break;
  }
  case "invalid": {
    writeSync(1, '{"unexpected":true}');
    break;
  }
  default: {
    throw new Error(`Unknown fixture mode: ${mode}`);
  }
}
