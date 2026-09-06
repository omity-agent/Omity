import {
  type ReactNode,
  type RefObject,
  type UIEventHandler,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { css, cx } from "styled-system/css";
import { scroll } from "../design";

const followBottomThreshold = 48,
  transcriptViewport = css({ containerType: "size", overflowAnchor: "none" }),
  transcriptContent = css({ display: "flow-root", minH: "full", minW: 0 });
type ScrollViewport = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;
function isNearBottom(element: ScrollViewport) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= followBottomThreshold;
}
export class FollowBottomController {
  private following = true;
  private previousTop?: number;
  align(element: ScrollViewport) {
    if (this.following) {
      element.scrollTop = Math.max(0, element.scrollHeight - element.clientHeight);
    }
    this.previousTop = element.scrollTop;
  }
  reset() {
    this.following = true;
    this.previousTop = undefined;
  }
  update(element: ScrollViewport) {
    const maximumTop = Math.max(0, element.scrollHeight - element.clientHeight),
      previousTop = Math.min(this.previousTop ?? maximumTop, maximumTop);
    if (isNearBottom(element)) {
      this.following = true;
    } else if (element.scrollTop < previousTop - 1) {
      this.following = false;
    }
    this.previousTop = element.scrollTop;
  }
}
export function useFollowBottom<T extends HTMLElement>({
  contentRef,
  enabled = true,
  ref,
  resetKey,
}: {
  contentRef?: RefObject<Element | null>;
  enabled?: boolean;
  ref: RefObject<T | null>;
  resetKey?: unknown;
}) {
  const controllerRef = useRef<FollowBottomController>(null),
    resetRef = useRef(resetKey);
  useLayoutEffect(() => {
    let controller = controllerRef.current;
    if (!controller) {
      controller = new FollowBottomController();
      controllerRef.current = controller;
    }
    if (!Object.is(resetRef.current, resetKey)) {
      resetRef.current = resetKey;
      controller.reset();
    }
    const element = ref.current;
    if (enabled && element) {
      controller.align(element);
    }
  });
  useLayoutEffect(() => {
    const element = ref.current,
      content = contentRef?.current ?? element?.firstElementChild,
      controller = controllerRef.current;
    if (!enabled || !element || !content || !controller) {
      return undefined;
    }
    const observer = new ResizeObserver(() => {
      controller.align(element);
    });
    observer.observe(content);
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, [contentRef, enabled, ref]);
  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    if (event.target !== event.currentTarget) {
      return;
    }
    controllerRef.current?.update(event.currentTarget);
  }, []);
  return onScroll;
}
export function TranscriptScroll({
  activeId,
  children,
}: {
  activeId: string;
  children: ReactNode;
}) {
  const scrollRef = useRef<HTMLElement>(null),
    contentRef = useRef<HTMLDivElement>(null),
    onScroll = useFollowBottom({
      contentRef,
      ref: scrollRef,
      resetKey: activeId,
    });
  return (
    <section className={cx(scroll, transcriptViewport)} ref={scrollRef} onScroll={onScroll}>
      <div className={transcriptContent} ref={contentRef}>
        {children}
      </div>
    </section>
  );
}
