import { type AskUserRequest, createAskUserTools } from "./askUser";
import type { BuiltInPreferences } from "./metadata";
import { createTitleTool } from "./validateTitle";
import { localize } from "../../i18n/server";

export interface BuiltInToolOptions {
  askUser?: (request: AskUserRequest, sessionId: string, signal?: AbortSignal) => Promise<unknown>;
}
export function loadBuiltInTools(settings: BuiltInPreferences, options: BuiltInToolOptions) {
  const tools = createAskUserTools(settings, (request, config) =>
    options.askUser
      ? options.askUser(request, requireSessionId(config), config.signal)
      : Promise.reject(new Error(localize("toolbox:askUser.channelUnavailable"))),
  );
  if (settings.update_title?.enabled) {
    tools.push(createTitleTool(settings.update_title));
  }
  for (const preferences of Object.values<BuiltInPreferences[keyof BuiltInPreferences]>(settings)) {
    if (preferences?.defer_loading) {
      const tool = tools.find(({ name }) => name === preferences.name);
      if (tool) {
        tool.extras = { ...tool.extras, defer_loading: true };
      }
    }
  }
  return tools;
}
function requireSessionId(config: { configurable?: Record<string, unknown> }) {
  const sessionId = config.configurable?.["sessionId"];
  if (typeof sessionId !== "string" || sessionId.length === 0) {
    throw new Error(localize("toolbox:askUser.sessionIdMissing"));
  }
  return sessionId;
}
