import {
  type DisplayEvent,
  type DisplayMessage,
  type DisplayQueue,
  type ReasoningTranslation,
  type TimelineMessage,
  buildTimeline,
} from "../../../timeline";
import type { Control } from "../../../../types";
import type { FileLinkUnit } from "../../../../fileLinks/types";
import { replaceEqualDeep } from "@tanstack/react-query";

export interface TranscriptSnapshot {
  control: Control;
  queue: DisplayQueue[];
  messages: DisplayMessage[];
  events: DisplayEvent[];
  eventCursor: number;
  fileLinks: FileLinkUnit[];
  reasoningTranslations: ReasoningTranslation[];
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
    reasoningTranslations: [],
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
  const replay = current?.events.filter((event) => event.id > snapshot.eventCursor) ?? [],
    events = mergeEvents(snapshot.events, replay),
    replayLinks = replay.flatMap((event) => event.fileLinks ?? []);
  return buildTranscript(
    {
      ...snapshot,
      eventCursor: Math.max(snapshot.eventCursor, current?.eventCursor ?? 0),
      events,
      fileLinks: mergeFileLinks(snapshot.fileLinks, replayLinks),
    },
    current,
    snapshot.eventCursor,
  );
}
export function appendTranscriptEvents(current: TranscriptData, incoming: DisplayEvent[]) {
  const accepted = incoming.filter((event) => event.id > current.snapshotCursor),
    events = appendOrMergeEvents(current.events, accepted, current.eventCursor);
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
    current,
    current.snapshotCursor,
  );
}
export function rebuildTranscript(
  current: TranscriptData,
  changes: Partial<Pick<TranscriptData, "queue" | "messages" | "events" | "reasoningTranslations">>,
) {
  return buildTranscript({ ...current, ...changes }, current, current.snapshotCursor);
}
export function withoutOptimistic(current: TranscriptData, key: string): TranscriptData {
  return { ...current, view: current.view.filter((item) => item.key !== key) };
}
function buildTranscript(
  snapshot: TranscriptSnapshot,
  current: TranscriptData | undefined,
  snapshotCursor: number,
): TranscriptData {
  const view = buildTimeline(
    snapshot.messages,
    snapshot.queue,
    snapshot.events,
    optimisticMessages(current),
    snapshot.fileLinks,
    snapshot.reasoningTranslations,
  );
  return {
    ...snapshot,
    snapshotCursor,
    view: current ? replaceEqualDeep(current.view, view) : view,
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
function appendOrMergeEvents(
  current: DisplayEvent[],
  incoming: DisplayEvent[],
  eventCursor: number,
) {
  const unique = [...new Map(incoming.map((event) => [event.id, event])).values()].toSorted(
    (left, right) => left.id - right.id,
  );
  return unique.every((event) => event.id > eventCursor)
    ? [...current, ...unique]
    : mergeEvents(current, unique);
}
function optimisticMessages(current?: TranscriptData) {
  return current?.view.filter((item) => item.optimistic === true) ?? [];
}
