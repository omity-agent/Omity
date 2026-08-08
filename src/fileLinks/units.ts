export interface TextUnit {
  end: number;
  nextOffset: number;
  start: number;
  text: string;
  unitIndex: number;
}
export function splitTextUnits(
  text: string,
  startOffset: number,
  startIndex: number,
  complete: boolean,
): TextUnit[] {
  const units: TextUnit[] = [];
  const newline = /\r\n|\r|\n/gu;
  newline.lastIndex = startOffset;
  let start = startOffset;
  let unitIndex = startIndex;
  for (;;) {
    const match = newline.exec(text);
    if (!match) {
      break;
    }
    units.push({
      end: match.index,
      nextOffset: match.index + match[0].length,
      start,
      text: text.slice(start, match.index),
      unitIndex,
    });
    start = match.index + match[0].length;
    unitIndex += 1;
  }
  if (complete && start < text.length) {
    units.push({
      end: text.length,
      nextOffset: text.length,
      start,
      text: text.slice(start),
      unitIndex,
    });
  }
  return units;
}
export function outputUnit(text: string): TextUnit {
  return {
    end: text.length,
    nextOffset: text.length,
    start: 0,
    text,
    unitIndex: 0,
  };
}
