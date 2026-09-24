import {
  Annotation,
  type BaseCheckpointSaver,
  END,
  type LangGraphRunnableConfig,
  MessagesAnnotation,
  START,
  StateGraph,
  getConfig,
  getWriter,
  task,
} from "@langchain/langgraph";
import { type BaseMessage, type ToolCall } from "@langchain/core/messages";
import { type HookPlan, agentPlan, toolPlan } from "../../hooks/plan";
import {
  type ModelToolDefinition,
  modelToolDefinitions,
} from "../../infrastructure/mcp/tools/definitions";
import { buildAiModel, modelApi } from "../model/provider";
import { hookNode, modelNode, toolsNode } from "../../hooks/graph/commands";
import { invokeToolBatch, pendingToolBatch } from "./toolBatch";
import { BunSqliteSaver } from "../../checkpointer/saver";
import type { Database } from "bun:sqlite";
import type { HookRuntime } from "../../hooks/runtime";
import type { HookToolOutput } from "../../hooks/storage/outputs";
import type { LanguageModel } from "ai";
import type { Settings } from "../../types";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolExecutions } from "../toolExecutions";
import { aiModelTools } from "../model/tools";
import { createHookNode } from "../../hooks/graph/node";
import { createResultRouter } from "./resultRouting";
import { createToolInvoker } from "../toolExecution";
import { streamAiModel } from "../model/request";

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
    model = options.model ?? buildAiModel(options.settings),
    definitions = options.toolDefinitions ?? modelToolDefinitions(options.tools, freeform),
    modelTools = aiModelTools(definitions, modelApi(options.settings)),
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
        model,
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
    routeResult = createResultRouter(
      runHooks,
      options.hooks.rules.some((rule) => rule.enable !== false),
    ),
    callModel = async (state: GraphState, config: LangGraphRunnableConfig) => {
      const response = await requestModel(state.messages);
      return routeResult(
        state,
        {
          hookPlan: response.tool_calls?.length
            ? toolPlan(response)
            : response.response_metadata["rawFinishReason"] === "pause_turn"
              ? null
              : agentPlan("after", [response.id!]),
          messages: [response],
        },
        config,
      );
    },
    callTool = async (state: GraphState, config: LangGraphRunnableConfig) =>
      routeResult(
        state,
        {
          hookPlan: state.hookPlan,
          messages: await invokeToolBatchTask(
            pendingToolBatch(state.messages, options.settings.toolExecution.parallel),
          ),
        },
        config,
      );
  return new StateGraph(AgentState)
    .addNode(hookNode, runHooks, { ends: [hookNode, modelNode, toolsNode, END] })
    .addNode(modelNode, callModel, { ends: [hookNode, toolsNode] })
    .addNode(toolsNode, callTool, { ends: [hookNode, modelNode, toolsNode] })
    .addEdge(START, hookNode)
    .compile({ checkpointer: options.checkpointer });
}
