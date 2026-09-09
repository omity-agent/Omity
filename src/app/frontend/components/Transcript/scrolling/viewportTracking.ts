import { type RefObject, useCallback, useEffectEvent, useLayoutEffect, useRef } from "react";
import { ReadingAnchor } from "./ReadingAnchor";
import type { VirtualizerHandle } from "virtua";

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
    notify = useEffectEvent(onLayout);
  useLayoutEffect(() => {
    const element = scrollRef.current,
      content = contentRef.current,
      handle = handleRef.current;
    if (!element || !content || !handle) {
      throw new Error("对话列表缺少滚动容器");
    }
    let disposed = false;
    const layout = new ReadingAnchor(element, content, handle, details.current, () =>
        notify(handle),
      ),
      resize = () => {
        notify(handle);
        layout.stabilize();
      },
      scroll = () => {
        if (!layout.scroll()) {
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
      observer = new ResizeObserver(resize),
      mutations = new MutationObserver((records) => {
        if (records.some((record) => record.target !== content)) {
          layout.stabilize();
        }
      });
    observerRef.current = observer;
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
      observer.disconnect();
      mutations.disconnect();
      layout.release();
      observerRef.current = null;
      element.removeEventListener("scroll", scroll);
    };
  }, [contentRef, handleRef, scrollRef]);
  return useCallback((element: HTMLDivElement) => {
    details.current.add(element);
    observerRef.current?.observe(element);
    return () => {
      details.current.delete(element);
      observerRef.current?.unobserve(element);
    };
  }, []);
}
