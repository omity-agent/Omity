import type { AIMessage } from "@langchain/core/messages";

export function partitionToolResponse(
  original: AIMessage,
  callIds: readonly string[],
  includeResponse: boolean,
) {
  const selectedCallIds = new Set(callIds);
  return {
    additional_kwargs: partitionAdditionalKwargs(original, selectedCallIds, includeResponse),
    content: includeResponse ? original.content : "",
    response_metadata: partitionResponseMetadata(original, selectedCallIds, includeResponse),
    usage_metadata: includeResponse ? original.usage_metadata : undefined,
  };
}
function partitionAdditionalKwargs(
  original: AIMessage,
  selectedCallIds: Set<string>,
  includeResponse: boolean,
) {
  const allCallIds = toolCallIds(original);
  return Object.fromEntries(
    Object.entries(original.additional_kwargs).flatMap(([key, value]) => {
      if (Array.isArray(value)) {
        const partition = partitionCallItems(value, allCallIds, selectedCallIds, includeResponse);
        return partition ? [[key, partition]] : [];
      }
      if (!isRecord(value)) {
        return includeResponse ? [[key, value]] : [];
      }
      const partition = partitionCallRecord(value, allCallIds, selectedCallIds, includeResponse);
      return partition ? [[key, partition]] : [];
    }),
  );
}
function partitionResponseMetadata(
  original: AIMessage,
  selectedCallIds: Set<string>,
  includeResponse: boolean,
) {
  const metadata = includeResponse ? { ...original.response_metadata } : {};
  const { output } = original.response_metadata;
  if (Array.isArray(output)) {
    const partition = partitionCallItems(
      output,
      toolCallIds(original),
      selectedCallIds,
      includeResponse,
    );
    if (partition) {
      metadata["output"] = partition;
    } else {
      delete metadata["output"];
    }
  }
  return metadata;
}
function partitionCallItems(
  items: unknown[],
  allCallIds: Set<string>,
  selectedCallIds: Set<string>,
  includeResponse: boolean,
) {
  const scoped = items.filter((item) => {
    const callId = itemCallId(item, allCallIds);
    return callId !== undefined && selectedCallIds.has(callId);
  });
  const response = includeResponse
    ? items.filter((item) => itemCallId(item, allCallIds) === undefined)
    : [];
  const partition = [...response, ...scoped];
  return partition.length > 0 ? partition : undefined;
}
function partitionCallRecord(
  value: Record<string, unknown>,
  allCallIds: Set<string>,
  selectedCallIds: Set<string>,
  includeResponse: boolean,
) {
  if (!Object.keys(value).some((id) => allCallIds.has(id))) {
    return includeResponse ? value : undefined;
  }
  const partition = Object.fromEntries(
    Object.entries(value).filter(
      ([key]) => selectedCallIds.has(key) || (includeResponse && !allCallIds.has(key)),
    ),
  );
  return Object.keys(partition).length > 0 ? partition : undefined;
}
function itemCallId(item: unknown, allCallIds: Set<string>) {
  if (!isRecord(item)) {
    return undefined;
  }
  const callId = item["call_id"];
  if (typeof callId === "string" && allCallIds.has(callId)) {
    return callId;
  }
  return typeof item["id"] === "string" && allCallIds.has(item["id"]) ? item["id"] : undefined;
}
function toolCallIds(message: AIMessage) {
  return new Set(message.tool_calls?.flatMap((call) => (call.id ? [call.id] : [])));
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
