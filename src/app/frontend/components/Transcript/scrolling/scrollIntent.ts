function ownsScroll(viewport: HTMLElement, target: EventTarget | null, delta: number) {
  let element = target instanceof Element ? target : null;
  while (element && element !== viewport) {
    if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight) {
      const style = getComputedStyle(element);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        const canScroll =
          delta < 0
            ? element.scrollTop > 0
            : element.scrollTop < element.scrollHeight - element.clientHeight;
        if (canScroll || style.overscrollBehaviorY !== "auto") {
          return false;
        }
      }
    }
    element = element.parentElement;
  }
  return element === viewport && viewport.scrollHeight > viewport.clientHeight;
}
export function observeScrollIntent(
  viewport: HTMLElement,
  onDirection: (delta: number) => void,
  onDrag: (active: boolean) => void,
) {
  let touchY: number | undefined;
  const document = viewport.ownerDocument,
    input = (event: Event, delta: number) => {
      if (delta !== 0 && ownsScroll(viewport, event.target, delta)) {
        onDirection(delta);
      }
    },
    wheel = (event: WheelEvent) => {
      if (!event.ctrlKey) {
        input(event, event.deltaY);
      }
    },
    touchStart = (event: TouchEvent) => {
      touchY = event.touches[0]?.clientY;
    },
    touchMove = (event: TouchEvent) => {
      const next = event.touches[0]?.clientY;
      if (next !== undefined && touchY !== undefined) {
        input(event, touchY - next);
      }
      touchY = next;
    },
    keyDown = (event: KeyboardEvent) => {
      const { target } = event;
      if (
        event.defaultPrevented ||
        (target instanceof HTMLElement &&
          (target.isContentEditable ||
            target.closest("input, textarea, select") ||
            (event.key === " " && target.closest("button, a[href], [role='button']"))))
      ) {
        return;
      }
      if (["ArrowUp", "PageUp", "Home"].includes(event.key)) {
        input(event, -1);
      } else if (["ArrowDown", "PageDown", "End", " "].includes(event.key)) {
        input(event, event.key === " " && event.shiftKey ? -1 : 1);
      }
    },
    pointerDown = (event: PointerEvent) => {
      if (event.target !== viewport || viewport.scrollHeight <= viewport.clientHeight) {
        return;
      }
      const left = viewport.getBoundingClientRect().left + viewport.clientLeft;
      if (event.clientX < left || event.clientX >= left + viewport.clientWidth) {
        onDrag(true);
      }
    },
    pointerUp = () => onDrag(false);
  viewport.addEventListener("wheel", wheel, { passive: true });
  viewport.addEventListener("touchstart", touchStart, { passive: true });
  viewport.addEventListener("touchmove", touchMove, { passive: true });
  viewport.addEventListener("keydown", keyDown);
  viewport.addEventListener("pointerdown", pointerDown);
  document.addEventListener("pointerup", pointerUp);
  document.addEventListener("pointercancel", pointerUp);
  return () => {
    viewport.removeEventListener("wheel", wheel);
    viewport.removeEventListener("touchstart", touchStart);
    viewport.removeEventListener("touchmove", touchMove);
    viewport.removeEventListener("keydown", keyDown);
    viewport.removeEventListener("pointerdown", pointerDown);
    document.removeEventListener("pointerup", pointerUp);
    document.removeEventListener("pointercancel", pointerUp);
  };
}
