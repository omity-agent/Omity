export interface ProbeUnit {
  end: number;
  key: string;
  start: number;
  text: string;
}
export type ProbeMode = "lines" | "output";
export function fileLinkProbeUnits(text: string, mode: ProbeMode, complete: boolean): ProbeUnit[] {
  if (mode === "output") {
    return [{ end: text.length, key: "output", start: 0, text }];
  }
  const units: ProbeUnit[] = [];
  const newline = /\r\n|\r|\n/gu;
  let start = 0;
  let line = 0;
  for (const match of text.matchAll(newline)) {
    const end = match.index;
    appendLine(units, text, start, end, line);
    start = end + match[0].length;
    line += 1;
  }
  if (complete && start < text.length) {
    appendLine(units, text, start, text.length, line);
  }
  return units;
}
function appendLine(units: ProbeUnit[], source: string, start: number, end: number, line: number) {
  if (start === end) {
    return;
  }
  units.push({
    end,
    key: `line-${line.toString()}`,
    start,
    text: source.slice(start, end),
  });
}
