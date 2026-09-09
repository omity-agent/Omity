import { type RefObject, type UIEventHandler, useCallback, useLayoutEffect, useRef } from "react";
import { transcriptWindow } from "../../../../../settings/rendering";

type ScrollViewport = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;
export class FollowBottomController {
  private following = true;
  private previousTop?: number;
  get isFollowing() {
    return this.following;
  }
  align(element: ScrollViewport) {
    if (!this.following) {
      return;
    }
    const maximumTop = Math.max(0, element.scrollHeight - element.clientHeight);
    this.previousTop = maximumTop;
    if (element.scrollTop !== maximumTop) {
      element.scrollTop = maximumTop;
    }
  }
  reset() {
    this.following = true;
    this.previousTop = undefined;
  }
  update(element: ScrollViewport) {
    const { scrollHeight, scrollTop, clientHeight } = element,
      maximumTop = Math.max(0, scrollHeight - clientHeight),
      previousTop = Math.min(this.previousTop ?? maximumTop, maximumTop);
    if (scrollTop < previousTop) {
      this.following = false;
    } else if (
      scrollTop > previousTop &&
      maximumTop - scrollTop <= transcriptWindow.followThreshold
    ) {
      this.following = true;
    }
    this.previousTop = scrollTop;
  }
}
export function useFollowBottom<T extends HTMLElement>({
  contentRef,
  enabled = true,
  ref,
}: {
  contentRef?: RefObject<Element | null>;
  enabled?: boolean;
  ref: RefObject<T | null>;
}) {
  const controllerRef = useRef<FollowBottomController>(null);
  useLayoutEffect(() => {
    const element = ref.current,
      content = contentRef?.current ?? element?.firstElementChild;
    if (!enabled || !element || !content) {
      return undefined;
    }
    const controller = new FollowBottomController();
    controllerRef.current = controller;
    const observer = new ResizeObserver(() => {
      controller.align(element);
    });
    observer.observe(content);
    observer.observe(element);
    return () => {
      observer.disconnect();
      controllerRef.current = null;
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
