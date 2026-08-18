type ScheduleFrame = (callback: FrameRequestCallback) => number;
type CancelFrame = (handle: number) => void;

export class FrameBatcher<T> {
  private frame?: number;
  private items: T[] = [];
  constructor(
    private readonly flush: (items: T[]) => void,
    private readonly schedule: ScheduleFrame = requestAnimationFrame,
    private readonly cancelFrame: CancelFrame = cancelAnimationFrame,
  ) {}
  add(item: T) {
    this.items.push(item);
    if (this.frame !== undefined) {
      return;
    }
    this.frame = this.schedule(() => {
      this.frame = undefined;
      const { items } = this;
      this.items = [];
      if (items.length > 0) {
        this.flush(items);
      }
    });
  }
  cancel() {
    if (this.frame !== undefined) {
      this.cancelFrame(this.frame);
      this.frame = undefined;
    }
    this.items = [];
  }
}
