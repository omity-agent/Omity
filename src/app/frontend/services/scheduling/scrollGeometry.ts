import { type Virtualizer, elementScroll } from "@tanstack/react-virtual";

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
