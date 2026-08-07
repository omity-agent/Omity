import { appendSessionMessage, setSessionControl } from "../client";
import type { CliCommand } from "./parser";
import type { HostMode } from "../types";
import { deleteHostSession } from "../sessionStorage";
import { openBrowser } from "../app/launch";
import { runHost } from "../host";
import { startAppServer } from "../app/server";

export async function executeCommand(command: CliCommand, root = process.cwd()) {
  switch (command.action) {
    case "app": {
      await startAppServer({
        host: command.host,
        onReady: (url) => {
          console.log(`WebUI 已启动：${url}`);
          openBrowser(url);
        },
        port: command.port,
        root,
      });
      return;
    }
    case "delete": {
      deleteHostSession(command.sessionId);
      console.log(`已删除会话 ${command.sessionId}`);
      return;
    }
    case "new":
    case "load":
    case "overwrite": {
      await runHost(
        {
          kind: command.action,
          profile: "profile" in command ? command.profile : undefined,
          sessionId: command.sessionId,
        } satisfies HostMode,
        root,
      );
      return;
    }
    case "append": {
      const result = appendSessionMessage(command.sessionId, command.message.join(" "));
      console.log(`已发送到会话 ${command.sessionId}（queue=${result.queueId.toString()}）`);
      return;
    }
    case "pause":
    case "resume":
    case "cancel": {
      const control =
        command.action === "resume" ? (command.step ? "step" : "running") : command.action;
      setSessionControl(command.sessionId, control);
      const instruction = control === "step" ? "resume --step" : command.action;
      console.log(`已发送控制指令 ${instruction} 到会话 ${command.sessionId}`);
      return;
    }
  }
}
