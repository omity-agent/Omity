import { type AskUserRequest, createAskUserTools } from "./askUser";

export interface BuiltInToolOptions {
  askUser?: (request: AskUserRequest, sessionId: string, signal?: AbortSignal) => Promise<unknown>;
}
export function loadBuiltInTools(askUserEnabled: boolean, options: BuiltInToolOptions) {
  if (!askUserEnabled) {
    return [];
  }
  return createAskUserTools((request, config) =>
    options.askUser
      ? options.askUser(request, requireSessionId(config), config.signal)
      : Promise.reject(new Error("ask_user 工具没有可用的用户交互通道")),
  );
}
function requireSessionId(config: { configurable?: Record<string, unknown> }) {
  const sessionId = config.configurable?.["sessionId"];
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("ask_user 工具缺少会话 ID");
  }
  return sessionId;
}
