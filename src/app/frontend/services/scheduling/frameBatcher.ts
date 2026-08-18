export class FrameBatcher<T> {
  private frame?: number;
  private items: T[] = [];
  constructor(private readonly flush: (items: T[]) => void) {}
  add(item: T) {
    this.items.push(item);
    if (this.frame !== undefined) {
      return;
    }
    this.frame = globalThis.requestAnimationFrame(() => {
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
      globalThis.cancelAnimationFrame(this.frame);
      this.frame = undefined;
    }
    this.items = [];
  }
}
