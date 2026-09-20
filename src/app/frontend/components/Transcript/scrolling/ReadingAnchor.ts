import { FollowBottomController } from "../followBottom";
import type { VirtualizerHandle } from "virtua";

interface FooterSnapshot {
  bottom: number;
  element: HTMLElement;
  height: number;
}
type Geometry = Pick<VirtualizerHandle, "getItemSize" | "scrollSize">;
export class ReadingAnchor {
  private readonly following = new FollowBottomController();
  private footers: FooterSnapshot[] = [];
  private pending?: FooterSnapshot;
  private previousTop: number;
  constructor(
    private readonly viewport: HTMLElement,
    private readonly content: HTMLElement,
    private readonly geometry: Geometry,
    private readonly details: Iterable<HTMLElement>,
    private readonly onLayout: () => void,
  ) {
    this.previousTop = viewport.scrollTop;
  }
  capture() {
    const bounds = this.viewport.getBoundingClientRect(),
      footers: FooterSnapshot[] = [];
    for (const element of this.details) {
      const { bottom, height, top } = element.getBoundingClientRect();
      if (top < bounds.bottom && bottom > bounds.top) {
        footers.push({ bottom: bottom - bounds.top, element, height });
      }
    }
    this.previousTop = this.viewport.scrollTop;
    this.footers = footers.toSorted((left, right) => left.bottom - right.bottom);
  }
  stabilize() {
    const { content, viewport } = this;
    if (!this.pending && viewport.scrollTop !== this.previousTop) {
      this.following.update(viewport);
    }
    this.pending ??= this.footers.findLast(
      ({ element, height }) =>
        element.isConnected && element.getBoundingClientRect().height !== height,
    );
    content.style.translate = "";
    if (this.pending?.element.isConnected) {
      const { element, bottom } = this.pending,
        row = element.closest<HTMLElement>("[data-transcript-index]");
      if (!row) {
        throw new Error("详情卡片缺少虚拟行");
      }
      const measureDelta = () =>
        element.getBoundingClientRect().bottom - viewport.getBoundingClientRect().top - bottom;
      if (!this.isMeasured(row)) {
        // Keep the visual anchor without scrolling through an outdated size cache.
        content.style.translate = `0 ${(-measureDelta()).toString()}px`;
        return;
      }
      // Settling copy overlays can clamp scrollTop, so measure the remaining delta afterwards.
      this.onLayout();
      if (this.following.isFollowing) {
        this.following.align(viewport);
      } else {
        const delta = measureDelta();
        if (delta !== 0) {
          viewport.scrollTop += delta;
        }
      }
    } else {
      this.following.align(viewport);
    }
    this.pending = undefined;
    this.capture();
  }
  scroll() {
    if (this.viewport.scrollTop === this.previousTop) {
      return false;
    }
    this.following.update(this.viewport);
    this.release();
    return true;
  }
  release() {
    this.pending = undefined;
    this.content.style.translate = "";
  }
  private isMeasured(row: HTMLElement) {
    return (
      this.geometry.getItemSize(Number(row.dataset["transcriptIndex"])) ===
        row.getBoundingClientRect().height &&
      this.geometry.scrollSize ===
        Math.max(this.content.getBoundingClientRect().height, this.viewport.clientHeight)
    );
  }
}
