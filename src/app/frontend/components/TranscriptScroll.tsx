import {
  type ReactNode,
  type RefObject,
  type UIEventHandler,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { css, cx } from "styled-system/css";
import type { TimelineMessage } from "../../timeline";
import { scroll } from "../design";

const followBottomThreshold = 48,
  transcriptViewport = css({ containerType: "size" }),
  transcriptContent = css({ display: "flow-root", minH: "full", minW: 0 });
type ScrollViewport = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;
function isNearBottom(element: ScrollViewport) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= followBottomThreshold;
}
export class FollowBottomController {
  private following = true;
  align(element: ScrollViewport) {
    if (this.following) {
      element.scrollTop = element.scrollHeight;
    }
  }
  reset() {
    this.following = true;
  }
  update(element: ScrollViewport) {
    this.following = isNearBottom(element);
  }
}
export function useFollowBottom<T extends HTMLElement>({
  contentRef,
  enabled = true,
  ref,
  resetKey,
  version,
}: {
  contentRef?: RefObject<Element | null>;
  enabled?: boolean;
  ref: RefObject<T | null>;
  resetKey?: unknown;
  version: unknown;
}) {
  const controllerRef = useRef<FollowBottomController>(null),
    resetRef = useRef(resetKey),
    versionRef = useRef(version);
  useLayoutEffect(() => {
    versionRef.current = version;
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
  }, [enabled, ref, resetKey, version]);
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
    return () => {
      observer.disconnect();
    };
  }, [contentRef, enabled, ref]);
  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    controllerRef.current?.update(event.currentTarget);
  }, []);
  return onScroll;
}
export function TranscriptScroll({
  activeId,
  children,
  view,
}: {
  activeId: string;
  children: ReactNode;
  view: TimelineMessage[];
}) {
  const scrollRef = useRef<HTMLElement>(null),
    contentRef = useRef<HTMLDivElement>(null),
    onScroll = useFollowBottom({
      contentRef,
      ref: scrollRef,
      resetKey: activeId,
      version: view,
    });
  return (
    <section className={cx(scroll, transcriptViewport)} ref={scrollRef} onScroll={onScroll}>
      <div className={transcriptContent} ref={contentRef}>
        {children}
      </div>
    </section>
  );
}
