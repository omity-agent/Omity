/* oxlint-disable typescript/no-unsafe-type-assertion -- Only the DOM geometry and scrolling surface used by ReadingAnchor is modeled. */
import { ReadingAnchor } from "../../../../src/app/frontend/components/Transcript/scrolling/ReadingAnchor";

export function layoutFixture({ following = false } = {}) {
  const state = {
      cachedRow: 100,
      contentHeight: 2000,
      height: 100,
      rowTop: following ? 1800 : 500,
      scrollHeight: 2000,
      total: 2000,
    },
    viewport = {
      clientHeight: 600,
      getBoundingClientRect: () => ({ bottom: 650, height: 600, top: 50 }),
      get scrollHeight() {
        return state.scrollHeight;
      },
      scrollTop: following ? 1400 : 400,
    } as HTMLElement,
    content = {
      getBoundingClientRect: () => ({ height: state.contentHeight }),
      style: { translate: "" },
    } as HTMLElement,
    row = {
      dataset: { transcriptIndex: "1" },
      getBoundingClientRect: () => ({ height: state.height }),
    } as unknown as HTMLElement,
    detail = {
      closest: () => row,
      getBoundingClientRect() {
        const shift = Number.parseFloat(content.style.translate.split(" ")[1] ?? "0"),
          top = 50 + state.rowTop - viewport.scrollTop + shift;
        return { bottom: top + state.height, height: state.height, top };
      },
      isConnected: true,
    } as unknown as HTMLElement,
    details = new Set([detail]),
    geometry = {
      getItemSize: () => state.cachedRow,
      get scrollSize() {
        return state.total;
      },
    },
    layout = new ReadingAnchor(viewport, content, geometry, details, () => {
      state.scrollHeight = state.contentHeight;
      viewport.scrollTop = Math.min(
        viewport.scrollTop,
        Math.max(0, viewport.scrollHeight - viewport.clientHeight),
      );
    });
  if (!following) {
    viewport.scrollTop = 300;
    layout.scroll();
  }
  layout.capture();
  const settle = (height: number) => {
    state.height = height;
    state.cachedRow = height;
    state.total = 1900 + height;
    state.contentHeight = state.total;
    state.scrollHeight = state.total;
  };
  return { content, detail, details, layout, settle, state, viewport };
}
