import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  MessagesAnnotation,
  START,
  StateGraph,
  getConfig,
  getWriter,
  task,
} from "@langchain/langgraph";
import { type BaseMessage, type ToolCall } from "@langchain/core/messages";
import { type HookPlan, agentPlan, toolPlan } from "../../hooks/plan";
import { type ModelToolDefinition, modelToolDefinitions } from "../../infrastructure/mcp/snapshot";
import { hookNode, modelNode, toolsNode } from "../../hooks/graph/commands";
import { invokeToolBatch, pendingToolBatch } from "./toolBatch";
import { BunSqliteSaver } from "../../checkpointer";
import type { Database } from "bun:sqlite";
import type { HookRuntime } from "../../hooks/runtime";
import type { HookToolOutput } from "../../hooks/storage/outputs";
import type { LanguageModel } from "ai";
import type { Settings } from "../../types";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolExecutions } from "../toolExecutions";
import { aiModelTools } from "../aiTools";
import { createHookNode } from "../../hooks/graph/node";
import { createToolInvoker } from "../toolExecution";
import { streamAiModel } from "../aiAgent";

const AgentState = Annotation.Root({
  ...MessagesAnnotation.spec,
  hookPendingUserIds: Annotation<string[]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
  hookPlan: Annotation<HookPlan | null>({
    default: () => null,
    reducer: (_left, right) => right,
  }),
  hookToolOutputs: Annotation<HookToolOutput[]>({
    default: () => [],
    reducer: (_left, right) => right,
  }),
});
type GraphState = typeof AgentState.State;
interface GraphOptions {
  checkpointer?: BaseCheckpointSaver;
  freeformToolParameters?: ReadonlyMap<string, string>;
  hooks: HookRuntime;
  model?: LanguageModel;
  settings: Settings;
  toolDefinitions?: ModelToolDefinition[];
  toolExecutions?: ToolExecutions;
  tools: StructuredToolInterface[];
}
export function buildGraph(
  settings: Settings,
  tools: StructuredToolInterface[],
  toolDefinitions: ModelToolDefinition[],
  database: Database,
  hooks: HookRuntime,
  options: Pick<GraphOptions, "freeformToolParameters" | "toolExecutions"> = {},
) {
  const checkpointer = new BunSqliteSaver(database),
    graph = createAgentGraph({
      checkpointer,
      hooks,
      settings,
      toolDefinitions,
      tools,
      ...options,
    });
  return { checkpointer, graph };
}
export function createAgentGraph(options: GraphOptions) {
  const freeform = options.freeformToolParameters ?? new Map(),
    definitions = options.toolDefinitions ?? modelToolDefinitions(options.tools, freeform),
    modelTools = aiModelTools(definitions),
    invokeTool = createToolInvoker(options.tools, {
      freeformToolParameters: freeform,
      sessionId: options.hooks.sessionId,
      settings: options.settings,
      toolExecutions: options.toolExecutions,
    }),
    requestModel = task("request_model", (messages: BaseMessage[]) =>
      streamAiModel({
        freeformToolNames: new Set(freeform.keys()),
        messages,
        model: options.model,
        sessionId: options.hooks.sessionId,
        settings: options.settings,
        signal: getConfig().signal,
        tools: modelTools,
        write: getWriter(),
      }),
    ),
    invokeToolTask = task("invoke_tool", (call: ToolCall) => invokeTool(call, getConfig())),
    invokeToolBatchTask = task("invoke_tool_batch", (calls: ToolCall[]) => {
      const config = getConfig();
      return invokeToolBatch(calls, (call) => invokeTool(call, config));
    }),
    consumeHookTask = task("consume_hook_usage", (hookId: string, limit: number) => ({
      consumed: options.hooks.consume(hookId, limit),
    })),
    runHooks = createHookNode(
      options.hooks,
      async (hookId, limit) => {
        const result = await consumeHookTask(hookId, limit);
        return result.consumed;
      },
      (call) => Promise.resolve(invokeToolTask(call)),
      { parallelToolCalls: options.settings.toolExecution.parallel },
    ),
    callModel = async (state: GraphState) => {
      const response = await requestModel(state.messages);
      return {
        hookPlan: response.tool_calls?.length
          ? toolPlan(response)
          : agentPlan("after", [response.id!]),
        messages: [response],
      };
    },
    callTool = async (state: GraphState) => ({
      messages: await invokeToolBatchTask(
        pendingToolBatch(state.messages, options.settings.toolExecution.parallel),
      ),
    });
  return new StateGraph(AgentState)
    .addNode(hookNode, runHooks, { ends: [hookNode, modelNode, toolsNode, END] })
    .addNode(modelNode, callModel)
    .addNode(toolsNode, callTool)
    .addEdge(START, hookNode)
    .addEdge(modelNode, hookNode)
    .addEdge(toolsNode, hookNode)
    .compile({ checkpointer: options.checkpointer });
}
