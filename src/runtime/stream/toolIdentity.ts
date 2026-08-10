export interface ToolStreamIdentityState {
  calls: Map<number, ToolStreamIdentity>;
  messageId?: string;
}
interface ToolStreamIdentity {
  candidateId?: string;
  formalId?: string;
  partId: string;
}
export function createToolStreamIdentityState(): ToolStreamIdentityState {
  return { calls: new Map() };
}
export function recordToolCallDelta(
  state: ToolStreamIdentityState,
  messageId: string,
  index: number,
  partId: string,
  idDelta?: string,
) {
  if (state.messageId !== messageId) {
    state.calls.clear();
    state.messageId = messageId;
  }
  let call = state.calls.get(index);
  if (!call) {
    call = { partId };
    state.calls.set(index, call);
  } else if (call.partId !== partId) {
    throw new Error(`工具流索引 ${index.toString()} 绑定了多个分片`);
  }
  call.candidateId = appendDelta(call.candidateId, idDelta);
}
export function resolveToolCallPart(
  state: ToolStreamIdentityState,
  messageId: string,
  callId: string,
  recoveredIndex: number,
) {
  if (state.messageId === undefined && state.calls.size === 0) {
    return { messageId, partId: `tool-${recoveredIndex.toString()}` };
  }
  const confirmed = [...state.calls.values()].filter((call) => call.formalId === callId);
  if (confirmed.length > 1) {
    throw new Error(`正式工具调用 ID ${callId} 绑定了多个流身份`);
  }
  const [confirmedCall] = confirmed;
  if (confirmedCall) {
    return streamIdentity(state, confirmedCall.partId);
  }
  const exact = [...state.calls.values()].filter((call) => call.candidateId === callId),
    unbound = [...state.calls.values()].filter((call) => call.formalId === undefined),
    compatible = unbound.filter((call) => !call.candidateId || callId.startsWith(call.candidateId)),
    identified = compatible.filter((call) => call.candidateId !== undefined),
    candidates = exact.length > 0 ? exact : identified.length > 0 ? identified : compatible;
  if (candidates.length !== 1) {
    throw new Error(`无法确认工具调用 ${callId} 的唯一流身份`);
  }
  const [call] = candidates;
  if (!call) {
    throw new Error(`无法确认工具调用 ${callId} 的流身份`);
  }
  if (call.candidateId && !callId.startsWith(call.candidateId)) {
    throw new Error(`工具流身份绑定了不同的正式调用 ID：${call.candidateId}、${callId}`);
  }
  call.formalId = callId;
  return streamIdentity(state, call.partId);
}
function streamIdentity(state: ToolStreamIdentityState, partId: string) {
  if (!state.messageId) {
    throw new Error("工具流身份缺少消息 ID");
  }
  return { messageId: state.messageId, partId };
}
function appendDelta(current: string | undefined, incoming?: string) {
  const value = (current ?? "") + (incoming ?? "");
  return value || undefined;
}
