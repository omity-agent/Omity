import { realpath, stat } from "node:fs/promises";
import type { FileLinkAction } from "../../fileLinks/types";
import { dirname } from "node:path";
import { once } from "node:events";
import { spawn } from "node:child_process";

interface Launcher {
  args: string[];
  command: string;
}
export async function activateFileLink(path: string, action: FileLinkAction) {
  const target = await existingTarget(path);
  const launcher = fileLinkLauncher(target.path, action);
  await startLauncher(launcher);
  return target.path;
}
export function fileLinkLauncher(
  path: string,
  action: FileLinkAction,
  platform = process.platform,
): Launcher {
  if (action === "open") {
    if (platform === "win32") {
      return { args: ["url.dll,FileProtocolHandler", path], command: "rundll32.exe" };
    }
    return platform === "darwin"
      ? { args: [path], command: "open" }
      : { args: [path], command: "xdg-open" };
  }
  if (platform === "win32") {
    return { args: [`/select,${path}`], command: "explorer.exe" };
  }
  if (platform === "darwin") {
    return { args: ["-R", path], command: "open" };
  }
  return { args: [dirname(path)], command: "xdg-open" };
}
async function existingTarget(path: string) {
  const resolved = await realpath(path);
  const metadata = await stat(resolved);
  if (!metadata.isDirectory() && !metadata.isFile()) {
    throw new Error(`路径不是文件或目录：${resolved}`);
  }
  return {
    path: resolved,
  };
}
async function startLauncher(launcher: Launcher) {
  const child = spawn(launcher.command, launcher.args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  await once(child, "spawn");
  child.unref();
}
