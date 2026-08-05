import { argument, command, constant, option } from "@optique/core/primitives";
import { integer, string } from "@optique/core/valueparser";
import { message, text } from "@optique/core/message";
import { multiple, optional } from "@optique/core/modifiers";
import { object, or, seq } from "@optique/core/constructs";
import type { HostMode } from "../types";
import type { InferValue } from "@optique/core";

type HostAction = HostMode["kind"] | "delete";
const sessionId = argument(string({ metavar: "SESSION_ID", pattern: /\S/u }), {
  description: message`会话 ID，例如 ${"123"}。`,
});
const profile = optional(
  option("--profile", string({ metavar: "PROFILE", pattern: /\S/u }), {
    description: message`选择一个优先级高于 profile.yaml 默认配置的 Profile。`,
  }),
);
const appCommand = command(
  "app",
  object({
    action: constant("app"),
    host: optional(
      option("--host", string({ metavar: "HOST" }), {
        description: message`覆盖配置文件中的监听地址。`,
      }),
    ),
    port: optional(
      option("--port", integer({ metavar: "PORT", min: 0 }), {
        description: message`覆盖配置文件中的监听端口，${"0"} 表示自动选择。`,
      }),
    ),
  }),
  { brief: message`启动 WebUI。` },
);
const hostCommand = command(
  "host",
  or(
    hostCreateAction("new", "新建并启动 Host 会话。"),
    hostAction("load", "加载并启动 Host 会话。"),
    hostAction("delete", "删除 Host 会话。"),
    hostCreateAction("overwrite", "删除后重新新建并启动 Host 会话。"),
  ),
  { brief: message`管理 Host 会话。` },
);
const clientCommand = command(
  "client",
  or(
    command(
      "append",
      seq(
        sessionId,
        multiple(
          argument(string({ metavar: "TEXT", pattern: /\S/u }), {
            description: message`要发送的消息内容。`,
          }),
          { min: 1 },
        ),
      ).map(([parsedSessionId, parsedMessage]) => ({
        action: "append" as const,
        message: parsedMessage,
        sessionId: parsedSessionId,
      })),
      { brief: message`向会话发送一条消息。` },
    ),
    clientControl("pause", "请求暂停会话。"),
    clientControl("resume", "请求继续会话。"),
    clientControl("cancel", "请求关闭 Host。"),
  ),
  { brief: message`向 Host 会话发送消息或控制指令。` },
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
function clientControl<const T extends "pause" | "resume" | "cancel">(action: T, brief: string) {
  return command(
    action,
    object({
      action: constant(action),
      sessionId,
    }),
    { brief: message`${text(brief)}` },
  );
}
