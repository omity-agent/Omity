export function fitSourceHeight(element: HTMLElement, targetHeight: number) {
  element.style.lineHeight = "1px";
  const visualLines = sourceVisualLines(element.getBoundingClientRect().height);
  element.style.lineHeight = `${(targetHeight / visualLines).toString()}px`;
}
export function observeSourceSpace(parent: HTMLElement, element: HTMLElement) {
  let { width, height } = parent.getBoundingClientRect();
  const observer = new ResizeObserver((entries) => {
    for (const entry of entries) {
      if (entry.contentRect.width !== width || entry.contentRect.height !== height) {
        ({ width, height } = entry.contentRect);
        fitSourceHeight(element, height);
      }
    }
  });
  observer.observe(parent);
  return () => observer.disconnect();
}
export function sourceVisualLines(measuredHeight: number) {
  return Math.max(1, Math.round(measuredHeight));
}
