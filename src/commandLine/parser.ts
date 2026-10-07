import { argument, command, constant, flag, option } from "@optique/core/primitives";
import { integer, string } from "@optique/core/valueparser";
import { message, text } from "@optique/core/message";
import { multiple, optional } from "@optique/core/modifiers";
import { object, or, seq } from "@optique/core/constructs";
import type { HostMode } from "../types";
import type { InferValue } from "@optique/core";
import { localize } from "../i18n/server";

type HostAction = HostMode["kind"] | "delete";
const sessionId = argument(string({ metavar: "SESSION_ID", pattern: /\S/u }), {
    description: localized("cli:help.sessionIdExample", { value0: "123" }),
  }),
  profile = optional(
    option("--profile", string({ metavar: "PROFILE", pattern: /\S/u }), {
      description: localized("cli:help.profilePriority"),
    }),
  ),
  appCommand = command(
    "app",
    object({
      action: constant("app"),
      host: optional(
        option("--host", string({ metavar: "HOST" }), {
          description: localized("cli:help.hostAddressOverride"),
        }),
      ),
      port: optional(
        option("--port", integer({ metavar: "PORT", min: 0 }), {
          description: localized("cli:help.portOverride", { value0: "0" }),
        }),
      ),
    }),
    { brief: localized("cli:help.startApp") },
  ),
  hostCommand = command(
    "host",
    or(
      hostCreateAction("new", localize("cli:help.createHost")),
      hostAction("load", localize("cli:help.loadHost")),
      hostAction("delete", localize("cli:help.deleteHost")),
      hostCreateAction("overwrite", localize("cli:help.overwriteHost")),
    ),
    { brief: localized("cli:help.manageHost") },
  ),
  clientCommand = command(
    "client",
    or(
      command(
        "append",
        seq(
          sessionId,
          multiple(
            argument(string({ metavar: "TEXT", pattern: /\S/u }), {
              description: localized("cli:help.messageContent"),
            }),
            { min: 1 },
          ),
        ).map(([parsedSessionId, parsedMessage]) => ({
          action: "append" as const,
          message: parsedMessage,
          sessionId: parsedSessionId,
        })),
        { brief: localized("cli:help.appendMessage") },
      ),
      clientControl("pause", localize("cli:help.pauseSession")),
      command(
        "resume",
        object({
          action: constant("resume"),
          sessionId,
          step: optional(
            flag("--step", {
              description: localized("cli:help.singleStep"),
            }),
          ),
        }),
        { brief: localized("cli:help.resumeSession") },
      ),
      clientControl("cancel", localize("cli:help.cancelHost")),
    ),
    { brief: localized("cli:help.manageClient") },
  );
export const cliParser = or(appCommand, hostCommand, clientCommand);
export type CliCommand = InferValue<typeof cliParser>;
function hostAction<const T extends HostAction>(action: T, brief: string) {
  return command(
    action,
    object({
      action: constant(action),
      sessionId,
    }),
    { brief: message`${text(brief)}` },
  );
}
function hostCreateAction<const T extends Extract<HostAction, "new" | "overwrite">>(
  action: T,
  brief: string,
) {
  return command(
    action,
    object({
      action: constant(action),
      profile,
      sessionId,
    }),
    { brief: message`${text(brief)}` },
  );
}
function clientControl<const T extends "pause" | "cancel">(action: T, brief: string) {
  return command(
    action,
    object({
      action: constant(action),
      sessionId,
    }),
    { brief: message`${text(brief)}` },
  );
}
function localized(key: string, options?: Parameters<typeof localize>[1]) {
  return message`${text(localize(key, options))}`;
}
