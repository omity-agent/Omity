import { type DisplayEvent, type TimelineMessage, buildTimeline } from "../../../timeline";
import { keyBy, sortBy } from "es-toolkit";
import type { FileLinkUnit } from "../../../../fileLinks/types";
import type { TranscriptSnapshot } from "../../../timeline/contracts/records";
import { replaceEqualDeep } from "@tanstack/react-query";

export type { TranscriptSnapshot } from "../../../timeline/contracts/records";
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
    events = appendOrMergeEvents(current.events, accepted);
  if (events.length === current.events.length) {
    return current;
  }
  return buildTranscript(
    {
      ...current,
      eventCursor: Math.max(current.eventCursor, events.at(-1)?.id ?? 0),
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
  return Object.values(
    keyBy(
      [...left, ...right],
      (unit) => `${unit.ownerId}\0${unit.surface}\0${unit.unitIndex.toString()}`,
    ),
  );
}
function mergeEvents(left: DisplayEvent[], right: DisplayEvent[]) {
  return sortBy(Object.values(keyBy([...left, ...right], (event) => event.id)), [
    (event) => event.id,
  ]);
}
function appendOrMergeEvents(current: DisplayEvent[], incoming: DisplayEvent[]) {
  return incoming.every(
    (event, index) =>
      event.id > (index === 0 ? (current.at(-1)?.id ?? 0) : incoming[index - 1]!.id),
  )
    ? [...current, ...incoming]
    : mergeEvents(current, incoming);
}
function optimisticMessages(current?: TranscriptData) {
  return current?.view.filter((item) => item.optimistic === true) ?? [];
}
