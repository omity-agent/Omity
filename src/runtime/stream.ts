import type { HostContext } from "./context";
import { createStreamPartState } from "./stream/parts";

export { incrementalSummary } from "./stream/debug";
export interface StreamLogState {
  aiToolIndexes: Map<string, number>;
  parts: ReturnType<typeof createStreamPartState>;
  seenFacts: Set<string>;
  seenStructures: Set<string>;
}
export function createStreamLogState(): StreamLogState {
  return {
    aiToolIndexes: new Map(),
    parts: createStreamPartState(),
    seenFacts: new Set(),
    seenStructures: new Set(),
  };
}
export function discardActiveStream(ctx: HostContext, state: StreamLogState, queueId: number) {
  ctx.db.discardQueueStream(queueId);
  ctx.observer?.changed?.(ctx.sessionId);
  state.aiToolIndexes.clear();
  state.parts = createStreamPartState();
}
export function completeActiveStream(state: StreamLogState) {
  state.aiToolIndexes.clear();
  state.parts = createStreamPartState();
}
