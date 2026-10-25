function ownsScroll(viewport: HTMLElement, target: EventTarget | null, delta: number) {
  const canScroll = (element: HTMLElement) =>
    delta < 0
      ? element.scrollTop > 0
      : element.scrollTop < element.scrollHeight - element.clientHeight;
  let element = target instanceof Element ? target : null;
  while (element && element !== viewport) {
    if (element instanceof HTMLElement && element.scrollHeight > element.clientHeight) {
      const style = getComputedStyle(element);
      if (style.overflowY === "auto" || style.overflowY === "scroll") {
        if (canScroll(element) || style.overscrollBehaviorY !== "auto") {
          return false;
        }
      }
    }
    element = element.parentElement;
  }
  return element === viewport && viewport.scrollHeight > viewport.clientHeight;
}
function isScrollbarPointer(viewport: HTMLElement, event: PointerEvent | MouseEvent) {
  if (event.target !== viewport) {
    return false;
  }
  const bounds = viewport.getBoundingClientRect(),
    scrollbarWidth = Math.max(viewport.offsetWidth - viewport.clientWidth, 16);
  return (
    event.clientX >= bounds.right - scrollbarWidth &&
    event.clientY >= bounds.top &&
    event.clientY < bounds.bottom
  );
}
export function observeScrollIntent(
  viewport: HTMLElement,
  onDirection: (delta: number) => void,
  onDrag: (active: boolean) => void,
) {
  let dragging = false,
    touchY: number | undefined;
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
    beginDrag = (event: PointerEvent | MouseEvent) => {
      if (
        !dragging &&
        viewport.scrollHeight > viewport.clientHeight &&
        isScrollbarPointer(viewport, event)
      ) {
        dragging = true;
        onDrag(true);
      }
    },
    pointerUp = () => {
      if (dragging) {
        dragging = false;
        onDrag(false);
      }
    };
  viewport.addEventListener("wheel", wheel, { passive: true });
  viewport.addEventListener("touchstart", touchStart, { passive: true });
  viewport.addEventListener("touchmove", touchMove, { passive: true });
  viewport.addEventListener("keydown", keyDown);
  viewport.addEventListener("mousedown", beginDrag);
  viewport.addEventListener("pointerdown", beginDrag);
  document.addEventListener("pointerup", pointerUp);
  document.addEventListener("pointercancel", pointerUp);
  document.addEventListener("mouseup", pointerUp);
  return () => {
    viewport.removeEventListener("wheel", wheel);
    viewport.removeEventListener("touchstart", touchStart);
    viewport.removeEventListener("touchmove", touchMove);
    viewport.removeEventListener("keydown", keyDown);
    viewport.removeEventListener("mousedown", beginDrag);
    viewport.removeEventListener("pointerdown", beginDrag);
    document.removeEventListener("pointerup", pointerUp);
    document.removeEventListener("pointercancel", pointerUp);
    document.removeEventListener("mouseup", pointerUp);
  };
}
