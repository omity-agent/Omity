import { type BaseMessage, type ToolCall, ToolMessage } from "@langchain/core/messages";
import type { LangGraphRunnableConfig } from "@langchain/langgraph";
import type { Settings } from "../types";
import type { StructuredToolInterface } from "@langchain/core/tools";
import type { ToolExecutions } from "./toolExecutions";
import { cancelledToolMessage } from "../runtime/toolOutput";
import { findMcpStdioUnavailable } from "../infrastructure/mcp/client/availability";
import { isPlainObject as isRecord } from "es-toolkit";
import { redirectLargeToolOutput } from "../runtime/largeOutput";
import { requireCallId } from "../hooks/plan";

interface ToolInvokerOptions {
  freeformToolParameters: ReadonlyMap<string, string>;
  sessionId: string;
  settings: Settings;
  toolExecutions?: ToolExecutions;
}
type ToolInvoker = (call: ToolCall, config: LangGraphRunnableConfig) => Promise<ToolMessage>;
export function createToolInvoker(
  tools: StructuredToolInterface[],
  options: ToolInvokerOptions,
): ToolInvoker {
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  return async (call, config) => {
    const callId = requireCallId(call),
      tool = byName.get(call.name);
    if (!tool) {
      throw new Error(`工具不存在：${call.name}`);
    }
    const execution = options.toolExecutions?.begin(callId, config.signal);
    try {
      execution?.signal.throwIfAborted();
      const raw = await tool.invoke(
          materializeFreeformInput(call, options.freeformToolParameters),
          {
            configurable: { ...config.configurable, sessionId: options.sessionId },
            signal: execution?.signal ?? config.signal,
            toolCall: call,
          },
        ),
        duration = execution?.cancellationDurationMs();
      execution?.complete();
      if (duration !== undefined) {
        return cancelledToolMessage(callId, duration, call.name);
      }
      return await normalizeOutput(raw, call, callId, options);
    } catch (error) {
      const duration = execution?.cancellationDurationMs();
      if (duration !== undefined) {
        return cancelledToolMessage(callId, duration, call.name);
      }
      if (config.signal?.aborted) {
        throw error;
      }
      const unavailable = findMcpStdioUnavailable(error);
      if (unavailable) {
        throw unavailable;
      }
      return toolMessage(
        error instanceof Error ? error.message || error.name : String(error),
        call,
        callId,
        "error",
      );
    } finally {
      execution?.complete();
    }
  };
}
function materializeFreeformInput(call: ToolCall, parameters: ReadonlyMap<string, string>) {
  const parameter = parameters.get(call.name),
    input = isRecord(call.args) ? call.args["input"] : undefined;
  return parameter && typeof input === "string" ? { [parameter]: input } : call.args;
}
async function normalizeOutput(
  value: unknown,
  call: ToolCall,
  callId: string,
  options: ToolInvokerOptions,
) {
  const message = ToolMessage.isInstance(value)
    ? value
    : toolMessage(messageContent(value), call, callId);
  return redirectLargeToolOutput(message, {
    maxTokens: options.settings.toolOutput.maxTokens,
    sessionId: options.sessionId,
  });
}
function toolMessage(
  content: BaseMessage["content"],
  call: ToolCall,
  callId: string,
  status?: "error",
) {
  return new ToolMessage({
    content,
    name: call.name,
    status,
    tool_call_id: callId,
  });
}
function messageContent(value: unknown): BaseMessage["content"] {
  if (typeof value === "string" || Array.isArray(value)) {
    return value;
  }
  return JSON.stringify(value);
}
