import { appendSessionMessage, setSessionControl } from "../client";
import type { CliCommand } from "./parser";
import type { HostMode } from "../types";
import { deleteHostSession } from "../storedSessions";
import { localize } from "../i18n/server";
import { openBrowser } from "../app/launch";
import { runHost } from "../host";
import { startAppServer } from "../app/server";

export async function executeCommand(command: CliCommand, root = process.cwd()) {
  switch (command.action) {
    case "app": {
      await startAppServer({
        host: command.host,
        onReady: (url) => {
          console.log(localize("cli:output.webStarted", { value0: url }));
          openBrowser(url);
        },
        port: command.port,
        root,
      });
      return;
    }
    case "delete": {
      deleteHostSession(command.sessionId);
      console.log(localize("cli:output.sessionDeleted", { value0: command.sessionId }));
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
      console.log(
        localize("cli:output.messageSent", {
          value0: command.sessionId,
          value1: result.inputId.toString(),
        }),
      );
      return;
    }
    case "pause":
    case "resume":
    case "cancel": {
      const control =
        command.action === "resume" ? (command.step ? "step" : "running") : command.action;
      setSessionControl(command.sessionId, control);
      const instruction = control === "step" ? "resume --step" : command.action;
      console.log(
        localize("cli:output.controlSent", {
          value0: instruction,
          value1: command.sessionId,
        }),
      );
      return;
    }
  }
}
