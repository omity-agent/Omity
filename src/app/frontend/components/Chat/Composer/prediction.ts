export class UserInputPrediction {
  private index: number | undefined;
  navigate(current: string, predictions: readonly string[]) {
    if (predictions.length === 0) {
      return undefined;
    }
    if (this.index === undefined) {
      this.index = 0;
    } else if (this.index < predictions.length - 1) {
      this.index += 1;
    } else {
      return current;
    }
    return predictions[this.index];
  }
  reset() {
    this.index = undefined;
  }
}
