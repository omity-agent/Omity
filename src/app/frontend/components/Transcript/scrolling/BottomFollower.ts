import { observeScrollIntent } from "./scrollIntent";
import { transcriptWindow } from "../../../../../../settings/rendering";

type ScrollViewport = Pick<HTMLElement, "clientHeight" | "scrollHeight" | "scrollTop">;
export class BottomFollower {
  private direction = 0;
  private dragging = false;
  private following = true;
  private previousTop = 0;
  get isFollowing() {
    return this.following;
  }
  align(element: ScrollViewport) {
    if (!this.following) {
      return;
    }
    const maximumTop = Math.max(0, element.scrollHeight - element.clientHeight);
    if (element.scrollTop !== maximumTop) {
      element.scrollTop = maximumTop;
    }
    this.previousTop = element.scrollTop;
  }
  update(element: ScrollViewport) {
    const { scrollTop, scrollHeight, clientHeight } = element;
    if (this.dragging && scrollTop !== this.previousTop) {
      this.direction = Math.sign(scrollTop - this.previousTop);
      this.following = false;
    }
    if (
      this.direction > 0 &&
      scrollHeight - clientHeight - scrollTop <= transcriptWindow.followThreshold
    ) {
      this.following = true;
    }
    this.previousTop = scrollTop;
  }
  observe(element: HTMLElement) {
    this.previousTop = element.scrollTop;
    return observeScrollIntent(
      element,
      (delta) => {
        this.direction = Math.sign(delta);
        if (delta < 0) {
          this.following = false;
        }
        this.update(element);
      },
      (active) => {
        if (active) {
          this.direction = 0;
          this.following = false;
        }
        this.dragging = active;
        this.update(element);
      },
    );
  }
}
