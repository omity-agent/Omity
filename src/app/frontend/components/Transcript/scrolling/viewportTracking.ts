import { type DetailFooter, captureDetailFooters, detailScrollAdjustment } from "./detailFooters";
import { type RefObject, useEffectEvent, useLayoutEffect } from "react";
import { FollowBottomController } from "../followBottom";
import type { VirtualizerHandle } from "virtua";
import type { segmentTranscript } from "../segments";

export function useTranscriptScroll({
  contentRef,
  handleRef,
  onLayout,
  scrollRef,
  segments,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  handleRef: RefObject<VirtualizerHandle | null>;
  onLayout: (handle: VirtualizerHandle) => void;
  scrollRef: RefObject<HTMLElement | null>;
  segments: ReturnType<typeof segmentTranscript>;
}) {
  const capture = useEffectEvent((handle: VirtualizerHandle, element: HTMLElement) =>
      captureDetailFooters(handle, segments, element.scrollTop, element.clientHeight),
    ),
    adjustment = useEffectEvent((footers: DetailFooter[], handle: VirtualizerHandle, top: number) =>
      detailScrollAdjustment(footers, handle, segments, top),
    ),
    notify = useEffectEvent(onLayout);
  useLayoutEffect(() => {
    const element = scrollRef.current,
      content = contentRef.current,
      handle = handleRef.current;
    if (!element || !content || !handle) {
      throw new Error("对话列表缺少滚动容器");
    }
    const following = new FollowBottomController();
    let footers: DetailFooter[] = [],
      previousTop = element.scrollTop,
      compensationTarget: number | undefined,
      disposed = false;
    const snapshot = () => {
        const compensated =
            compensationTarget !== undefined &&
            Math.abs(element.scrollTop - compensationTarget) < 1,
          current = capture(handle, element);
        if (compensated) {
          for (const footer of current) {
            const previous = footers.find(({ key }) => key === footer.key);
            if (previous) {
              footer.bottom = previous.bottom;
            }
          }
        }
        compensationTarget = undefined;
        previousTop = element.scrollTop;
        footers = current;
        notify(handle);
      },
      resize = () => {
        if (following.isFollowing) {
          following.align(element);
        } else {
          const delta = adjustment(footers, handle, element.scrollTop);
          if (delta !== 0) {
            compensationTarget = element.scrollTop + delta;
            handle.scrollTo(compensationTarget);
            notify(handle);
            return;
          }
        }
        snapshot();
      },
      scroll = () => {
        if (element.scrollTop === previousTop) {
          return;
        }
        following.update(element);
        // Virtua's scroll observer may run after this listener.
        queueMicrotask(() => {
          if (!disposed) {
            snapshot();
          }
        });
      },
      observer = new ResizeObserver(resize);
    observer.observe(content);
    observer.observe(element);
    element.addEventListener("scroll", scroll, { passive: true });
    resize();
    return () => {
      disposed = true;
      observer.disconnect();
      element.removeEventListener("scroll", scroll);
    };
  }, [contentRef, handleRef, scrollRef]);
}
