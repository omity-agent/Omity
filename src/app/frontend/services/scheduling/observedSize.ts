import type { Virtualizer } from "@tanstack/react-virtual";

export function measureObservedItem<T extends HTMLElement>(
  element: Element,
  entry: ResizeObserverEntry | undefined,
  instance: Virtualizer<T, Element>,
) {
  if (entry) {
    const [size] = entry.borderBoxSize;
    if (!size) {
      throw new Error("布局观察器未提供边框尺寸");
    }
    return size.blockSize;
  }
  const index = instance.indexFromElement(element),
    key = instance.options.getItemKey(index);
  return instance.itemSizeCache.get(key) ?? instance.options.estimateSize(index);
}
