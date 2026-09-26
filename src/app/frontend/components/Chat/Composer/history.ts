export type HistoryDirection = "next" | "previous";
export class UserMessageHistory {
  private index: number | undefined;
  navigate(direction: HistoryDirection, current: string, messages: readonly string[]) {
    if (this.index === undefined && current !== "") {
      return undefined;
    }
    if (direction === "previous") {
      return this.previous(current, messages);
    }
    return this.next(current, messages);
  }
  reset() {
    this.index = undefined;
    this.origin = undefined;
  }
  isBrowsing() {
    return this.index !== undefined;
  }
  private origin: string | undefined;
  private previous(current: string, messages: readonly string[]) {
    if (messages.length === 0) {
      return current;
    }
    if (this.index === undefined) {
      this.origin = current;
      this.index = messages.length - 1;
    } else if (this.index > 0) {
      this.index -= 1;
    } else {
      return current;
    }
    return messages[this.index];
  }
  private next(current: string, messages: readonly string[]) {
    if (this.index === undefined) {
      return current;
    }
    if (this.index < messages.length - 1) {
      this.index += 1;
      return messages[this.index];
    }
    const origin = this.origin ?? "";
    this.reset();
    return origin;
  }
}
