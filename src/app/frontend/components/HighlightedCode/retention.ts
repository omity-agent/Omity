import type { HighlightedCodeResult } from "./scheduler";

export function retainedLineMarkup({
  appendOnly,
  current,
  highlight,
  index,
}: {
  appendOnly: boolean;
  current: string;
  highlight?: HighlightedCodeResult;
  index: number;
}) {
  const source = highlight?.sourceLines[index],
    markup = highlight?.lines[index];
  if (source === undefined || markup === undefined) {
    return undefined;
  }
  if (source === current) {
    return markup;
  }
  if (appendOnly && current.startsWith(source)) {
    return markup + escapeHtml(current.slice(source.length));
  }
  return undefined;
}
function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
