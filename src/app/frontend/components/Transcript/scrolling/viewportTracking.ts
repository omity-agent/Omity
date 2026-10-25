import { type RefObject, useCallback, useEffectEvent, useLayoutEffect, useRef } from "react";
import type { VirtualizerHandle } from "virtua";

import { localize } from "../../../i18n";
import { ReadingAnchor } from "./ReadingAnchor";

export function useTranscriptScroll({
  contentRef,
  handleRef,
  onLayout,
  scrollRef,
}: {
  contentRef: RefObject<HTMLDivElement | null>;
  handleRef: RefObject<VirtualizerHandle | null>;
  onLayout: (handle: VirtualizerHandle) => void;
  scrollRef: RefObject<HTMLElement | null>;
}) {
  const details = useRef(new Set<HTMLDivElement>()),
    observerRef = useRef<ResizeObserver | null>(null),
    scheduleRef = useRef<(() => void) | null>(null),
    notify = useEffectEvent(onLayout);
  useLayoutEffect(() => {
    const element = scrollRef.current,
      content = contentRef.current,
      handle = handleRef.current;
    if (!element || !content || !handle) {
      throw new Error(localize("frontend:transcript.scrollContainerMissing"));
    }
    let disposed = false,
      frame: number | undefined;
    const layout = new ReadingAnchor(element, content, handle, details.current, () =>
        notify(handle),
      ),
      resize = () => {
        notify(handle);
        layout.stabilize();
      },
      schedule = () => {
        frame ??= requestAnimationFrame(() => {
          frame = undefined;
          resize();
        });
      },
      scroll = () => {
        schedule();
        const { changed, userIntent } = layout.scroll();
        if (!changed || !userIntent) {
          return;
        }
        // Virtua's scroll observer may run after this listener.
        queueMicrotask(() => {
          if (!disposed) {
            layout.capture();
            notify(handle);
          }
        });
      },
      observer = new ResizeObserver(() => {
        resize();
        schedule();
      }),
      mutations = new MutationObserver((records) => {
        if (records.some((record) => record.target !== content)) {
          layout.stabilize();
          schedule();
        }
      }),
      stopFollowing = layout.observe();
    observerRef.current = observer;
    scheduleRef.current = schedule;
    for (const detail of details.current) {
      observer.observe(detail);
    }
    observer.observe(content);
    observer.observe(element);
    // Nested virtualizers can change height after this frame's resize delivery.
    mutations.observe(content, {
      attributeFilter: ["style", "hidden"],
      childList: true,
      subtree: true,
    });
    element.addEventListener("scroll", scroll, { passive: true });
    resize();
    return () => {
      disposed = true;
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
      mutations.disconnect();
      stopFollowing();
      layout.release();
      observerRef.current = null;
      scheduleRef.current = null;
      element.removeEventListener("scroll", scroll);
    };
  }, [contentRef, handleRef, scrollRef]);
  const registerDetail = useCallback((element: HTMLDivElement) => {
      details.current.add(element);
      observerRef.current?.observe(element);
      return () => {
        details.current.delete(element);
        observerRef.current?.unobserve(element);
      };
    }, []),
    onResize = useCallback(() => scheduleRef.current?.(), []);
  return { onResize, registerDetail };
}
