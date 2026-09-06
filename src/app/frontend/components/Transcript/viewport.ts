import { type Rect, type Virtualizer, observeElementRect } from "@tanstack/react-virtual";

export function observePinnedViewport(
  instance: Virtualizer<HTMLElement, Element>,
  onRectChange: (rect: Rect) => void,
) {
  let frame: number | undefined;
  const stop = observeElementRect(instance, (rect) => {
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
      frame = undefined;
    }
    const previousHeight = instance.scrollRect?.height,
      offset = instance.scrollOffset,
      following =
        previousHeight !== undefined &&
        offset !== null &&
        instance.getTotalSize() - offset - previousHeight <= instance.options.scrollEndThreshold;
    onRectChange(rect);
    if (following && previousHeight !== rect.height) {
      frame = requestAnimationFrame(() => {
        frame = undefined;
        if (instance.scrollOffset === offset || instance.scrollDirection !== "backward") {
          instance.scrollToEnd();
        }
      });
    }
  });
  return () => {
    stop?.();
    if (frame !== undefined) {
      cancelAnimationFrame(frame);
    }
  };
}
