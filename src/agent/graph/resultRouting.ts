import { Command, type LangGraphRunnableConfig, messagesStateReducer } from "@langchain/langgraph";
import type { HookPlan, HookState } from "../../hooks/plan";
import { BaseMessage } from "@langchain/core/messages";
import type { createHookNode } from "../../hooks/graph/node";
import { hookNode } from "../../hooks/graph/commands";
import { localize } from "../../i18n/server";

interface ResultUpdate {
  hookPlan: HookPlan | null;
  messages: BaseMessage[];
}
export function createResultRouter(runHooks: ReturnType<typeof createHookNode>, hasHooks: boolean) {
  return async (state: HookState, update: ResultUpdate, config: LangGraphRunnableConfig) => {
    // Keep a separate final-response boundary so inputs appended during execution can be accepted.
    if (hasHooks || update.hookPlan?.kind !== "tools") {
      return new Command({ goto: hookNode, update: { ...update } });
    }
    const transition = await runHooks(
      {
        ...state,
        ...update,
        messages: messagesStateReducer(state.messages, update.messages),
      },
      config,
    );
    if (!transition.update || Array.isArray(transition.update)) {
      throw new Error(localize("agent:graph.invalidHookUpdate"));
    }
    const messages = transition.update.messages ?? [];
    if (!Array.isArray(messages) || !messages.every((message) => BaseMessage.isInstance(message))) {
      throw new Error(localize("agent:graph.invalidHookMessages"));
    }
    return new Command({
      goto: transition.goto,
      update: {
        ...update,
        ...transition.update,
        messages: [...update.messages, ...messages],
      },
    });
  };
}
