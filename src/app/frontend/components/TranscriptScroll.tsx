import {
  type ReactNode,
  type RefObject,
  type UIEventHandler,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { css, cx } from "styled-system/css";
import type { TimelineMessage } from "../../timeline";
import { scroll } from "../design";

const followBottomThreshold = 48,
  transcriptViewport = css({ containerType: "size" });
function isNearBottom(element: HTMLElement) {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= followBottomThreshold;
}
export function useFollowBottom<T extends HTMLElement>({
  enabled = true,
  ref,
  resetKey,
  version,
}: {
  enabled?: boolean;
  ref: RefObject<T | null>;
  resetKey?: unknown;
  version: unknown;
}) {
  const followingRef = useRef(true);
  useEffect(() => {
    followingRef.current = true;
  }, [resetKey]);
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !followingRef.current) {
      return undefined;
    }
    const frame = requestAnimationFrame(() => {
      if (ref.current === element && followingRef.current) {
        element.scrollTop = Number.MAX_SAFE_INTEGER;
      }
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [enabled, ref, resetKey, version]);
  const onScroll = useCallback<UIEventHandler<T>>((event) => {
    followingRef.current = isNearBottom(event.currentTarget);
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
    onScroll = useFollowBottom({
      ref: scrollRef,
      resetKey: activeId,
      version: view,
    });
  return (
    <section className={cx(scroll, transcriptViewport)} ref={scrollRef} onScroll={onScroll}>
      {children}
    </section>
  );
}
