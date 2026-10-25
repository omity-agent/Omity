import { type RefObject, type UIEventHandler, useCallback, useLayoutEffect, useRef } from "react";

import { BottomFollower } from "./scrolling/BottomFollower";

export function useFollowBottom<T extends HTMLElement>({
  contentRef,
  enabled = true,
  ref,
}: {
  contentRef?: RefObject<Element | null>;
  enabled?: boolean;
  ref: RefObject<T | null>;
}) {
  const controllerRef = useRef<BottomFollower>(null),
    scheduleRef = useRef<(() => void) | null>(null);
  useLayoutEffect(() => {
    const element = ref.current,
      content = contentRef?.current ?? element?.firstElementChild;
    if (!enabled || !element || !content) {
      return undefined;
    }
    const controller = new BottomFollower(),
      stopObserving = controller.observe(element);
    let frame: number | undefined;
    const align = () => controller.align(element),
      schedule = () => {
        frame ??= requestAnimationFrame(() => {
          frame = undefined;
          align();
        });
      },
      observer = new ResizeObserver(() => {
        align();
        schedule();
      }),
      mutations = new MutationObserver(() => {
        align();
        schedule();
      });
    controllerRef.current = controller;
    scheduleRef.current = schedule;
    observer.observe(content);
    observer.observe(element);
    mutations.observe(content, {
      attributeFilter: ["style"],
      childList: true,
      subtree: true,
    });
    align();
    return () => {
      if (frame !== undefined) {
        cancelAnimationFrame(frame);
      }
      observer.disconnect();
      mutations.disconnect();
      stopObserving();
      controllerRef.current = null;
      scheduleRef.current = null;
    };
  }, [contentRef, enabled, ref]);
  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    controllerRef.current?.update(event.currentTarget);
    controllerRef.current?.align(event.currentTarget);
    scheduleRef.current?.();
  }, []);
  const onResize = useCallback(() => scheduleRef.current?.(), []);
  return { onResize, onScroll };
}
