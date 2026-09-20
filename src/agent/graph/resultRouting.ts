import { Command, type LangGraphRunnableConfig, messagesStateReducer } from "@langchain/langgraph";
import type { HookPlan, HookState } from "../../hooks/plan";
import { BaseMessage } from "@langchain/core/messages";
import type { createHookNode } from "../../hooks/graph/node";
import { hookNode } from "../../hooks/graph/commands";

interface ResultUpdate {
  hookPlan: HookPlan | null;
  messages: BaseMessage[];
}
export function createResultRouter(runHooks: ReturnType<typeof createHookNode>, hasHooks: boolean) {
  return async (state: HookState, update: ResultUpdate, config: LangGraphRunnableConfig) => {
    // 最终回复保留独立边界，以接纳运行期间追加的用户输入。
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
      throw new Error("Hook 状态转换必须返回字段更新");
    }
    const messages = transition.update.messages ?? [];
    if (!Array.isArray(messages) || !messages.every((message) => BaseMessage.isInstance(message))) {
      throw new Error("Hook 状态转换返回了无效消息");
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
