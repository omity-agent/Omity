import { type VirtualItem, type Virtualizer, elementScroll } from "@tanstack/react-virtual";

export function measureItemHeight(element: Element, entry: ResizeObserverEntry | undefined) {
  if (entry) {
    const [size] = entry.borderBoxSize;
    if (!size) {
      throw new Error("布局观察器未提供边框尺寸");
    }
    return size.blockSize;
  }
  return element.getBoundingClientRect().height;
}
export function scrollWithMeasuredExtent<T extends HTMLElement>(
  offset: number,
  options: Parameters<typeof elementScroll>[1],
  instance: Virtualizer<T, Element>,
) {
  const container = instance.scrollElement?.firstElementChild;
  if (container instanceof HTMLElement) {
    // Grow the scroll range before the browser can clamp the compensated offset.
    container.style.height = `${instance.getTotalSize().toString()}px`;
  }
  elementScroll(offset, options, instance);
}
export function shouldAnchorResize(
  item: VirtualItem,
  instance: Virtualizer<HTMLElement, Element>,
  anchorEnd: boolean,
) {
  const offset = (instance.scrollOffset ?? 0) + instance.scrollAdjustments;
  if (!instance.itemSizeCache.has(item.key)) {
    return item.start < offset;
  }
  if (anchorEnd && item.end > offset && item.start < offset + (instance.scrollRect?.height ?? 0)) {
    return true;
  }
  return item.end <= offset && instance.scrollDirection !== "backward";
}
