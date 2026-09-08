import type { HostContext } from "./context";
import { createStreamPartState } from "./stream/parts";

export { incrementalSummary } from "./stream/debug";
export interface StreamLogState {
  aiToolIndexes: Map<string, number>;
  modelResponding: boolean;
  parts: ReturnType<typeof createStreamPartState>;
  seenFacts: Set<string>;
  seenStructures: Set<string>;
}
export function createStreamLogState(): StreamLogState {
  return {
    aiToolIndexes: new Map(),
    modelResponding: false,
    parts: createStreamPartState(),
    seenFacts: new Set(),
    seenStructures: new Set(),
  };
}
export function discardActiveStream(ctx: HostContext, state: StreamLogState, queueId: number) {
  ctx.db.discardQueueStream(queueId);
  ctx.observer?.changed?.(ctx.sessionId);
  completeActiveStream(state);
}
export function completeActiveStream(state: StreamLogState) {
  state.aiToolIndexes.clear();
  state.modelResponding = false;
  state.parts = createStreamPartState();
}
