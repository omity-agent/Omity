import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  type TimelineMessage,
  buildTimeline,
} from "../../../timeline";
import type { Control } from "../../../../types";
import type { FileLinkUnit } from "../../../../fileLinks/types";

export interface TranscriptSnapshot {
  control: Control;
  queue: DisplayQueue[];
  messages: DisplayMessage[];
  events: DisplayEvent[];
  eventCursor: number;
  fileLinks: FileLinkUnit[];
  transcriptRevision: number;
}
export interface TranscriptData extends TranscriptSnapshot {
  snapshotCursor: number;
  view: TimelineMessage[];
}
export function emptyTranscriptData(): TranscriptData {
  return {
    control: "running",
    eventCursor: 0,
    events: [],
    fileLinks: [],
    messages: [],
    queue: [],
    snapshotCursor: 0,
    transcriptRevision: 0,
    view: [],
  };
}
export function reconcileTranscript(
  snapshot: TranscriptSnapshot,
  current?: TranscriptData,
): TranscriptData {
  if (
    current &&
    (snapshot.transcriptRevision < current.transcriptRevision ||
      snapshot.eventCursor < current.snapshotCursor)
  ) {
    return current;
  }
  const replay = current?.events.filter((event) => event.id > snapshot.eventCursor) ?? [];
  const events = mergeEvents(snapshot.events, replay);
  const replayLinks = replay.flatMap((event) => event.fileLinks ?? []);
  return buildTranscript(
    {
      ...snapshot,
      eventCursor: Math.max(snapshot.eventCursor, current?.eventCursor ?? 0),
      events,
      fileLinks: mergeFileLinks(snapshot.fileLinks, replayLinks),
    },
    optimisticMessages(current),
    snapshot.eventCursor,
  );
}
export function appendTranscriptEvents(current: TranscriptData, incoming: DisplayEvent[]) {
  const accepted = incoming.filter((event) => event.id > current.snapshotCursor);
  const events = mergeEvents(current.events, accepted);
  if (events.length === current.events.length) {
    return current;
  }
  return buildTranscript(
    {
      ...current,
      eventCursor: Math.max(current.eventCursor, ...accepted.map((event) => event.id)),
      events,
      fileLinks: mergeFileLinks(
        current.fileLinks,
        accepted.flatMap((event) => event.fileLinks ?? []),
      ),
    },
    optimisticMessages(current),
    current.snapshotCursor,
  );
}
export function rebuildTranscript(
  current: TranscriptData,
  changes: Partial<Pick<TranscriptData, "queue" | "messages" | "events">>,
) {
  return buildTranscript(
    { ...current, ...changes },
    optimisticMessages(current),
    current.snapshotCursor,
  );
}
export function withoutOptimistic(current: TranscriptData, key: string): TranscriptData {
  return { ...current, view: current.view.filter((item) => item.key !== key) };
}
function buildTranscript(
  snapshot: TranscriptSnapshot,
  optimistic: TimelineMessage[],
  snapshotCursor: number,
): TranscriptData {
  return {
    ...snapshot,
    snapshotCursor,
    view: buildTimeline(
      snapshot.messages,
      snapshot.queue,
      snapshot.events,
      optimistic,
      snapshot.fileLinks,
    ),
  };
}
function mergeFileLinks(left: FileLinkUnit[], right: FileLinkUnit[]) {
  return [
    ...new Map(
      [...left, ...right].map((unit) => [
        `${unit.ownerId}\0${unit.surface}\0${unit.unitIndex.toString()}`,
        unit,
      ]),
    ).values(),
  ];
}
function mergeEvents(left: DisplayEvent[], right: DisplayEvent[]) {
  return [...new Map([...left, ...right].map((event) => [event.id, event])).values()].toSorted(
    (a, b) => a.id - b.id,
  );
}
function optimisticMessages(current?: TranscriptData) {
  return current?.view.filter((item) => item.optimistic === true) ?? [];
}
