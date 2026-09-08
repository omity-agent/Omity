import type { VirtualizerHandle } from "virtua";
import type { segmentTranscript } from "../segments";

type Segments = ReturnType<typeof segmentTranscript>;
type Geometry = Pick<VirtualizerHandle, "findItemIndex" | "getItemOffset" | "getItemSize">;
export interface DetailFooter {
  bottom: number;
  index: number;
  key: string;
  size: number;
}
export function captureDetailFooters(
  handle: Geometry,
  segments: Segments,
  top: number,
  height: number,
): DetailFooter[] {
  const footers: DetailFooter[] = [],
    first = Math.max(0, handle.findItemIndex(top)),
    last = Math.min(segments.length - 1, handle.findItemIndex(top + height));
  for (let index = first; index <= last; index += 1) {
    const segment = segments[index]!,
      part = segment.partIndex === undefined ? undefined : segment.message.parts[segment.partIndex],
      start = handle.getItemOffset(index),
      size = handle.getItemSize(index);
    if (
      (part?.type === "reasoning" || part?.type === "tool") &&
      start < top + height &&
      start + size > top
    ) {
      footers.push({ bottom: start + size - top, index, key: segment.key, size });
    }
  }
  return footers;
}
export function detailScrollAdjustment(
  footers: DetailFooter[],
  handle: Geometry,
  segments: Segments,
  top: number,
) {
  const anchor = footers.findLast(
    ({ index, key, size }) => segments[index]?.key === key && handle.getItemSize(index) !== size,
  );
  return anchor
    ? handle.getItemOffset(anchor.index) + handle.getItemSize(anchor.index) - top - anchor.bottom
    : 0;
}
