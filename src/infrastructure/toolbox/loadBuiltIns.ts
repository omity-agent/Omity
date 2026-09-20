import { type AskUserRequest, createAskUserTools } from "./askUser";
import type { BuiltInPreferences } from "./metadata";
import { createTitleTool } from "./validateTitle";

export interface BuiltInToolOptions {
  askUser?: (request: AskUserRequest, sessionId: string, signal?: AbortSignal) => Promise<unknown>;
}
export function loadBuiltInTools(settings: BuiltInPreferences, options: BuiltInToolOptions) {
  const tools = createAskUserTools(settings, (request, config) =>
    options.askUser
      ? options.askUser(request, requireSessionId(config), config.signal)
      : Promise.reject(new Error("ask_user 工具没有可用的用户交互通道")),
  );
  if (settings.update_title?.enabled) {
    tools.push(createTitleTool(settings.update_title));
  }
  for (const preferences of Object.values(settings)) {
    const tool = tools.find(({ name }) => name === preferences.name);
    if (tool && preferences.defer_loading) {
      tool.extras = { ...tool.extras, defer_loading: true };
    }
  }
  return tools;
}
function requireSessionId(config: { configurable?: Record<string, unknown> }) {
  const sessionId = config.configurable?.["sessionId"];
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error("ask_user 工具缺少会话 ID");
  }
  return sessionId;
}
