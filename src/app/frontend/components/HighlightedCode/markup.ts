import hljs from "highlight.js/lib/common";

export interface HighlightResult {
  language?: string;
  lines: string[];
}
export function highlightCode(code: string, language?: string): HighlightResult {
  const normalized = normalizeLanguage(language),
    result =
      normalized && hljs.getLanguage(normalized)
        ? hljs.highlight(code, {
            ignoreIllegals: true,
            language: normalized,
          })
        : hljs.highlightAuto(code);
  return {
    ...(result.language ? { language: result.language } : {}),
    lines: splitHighlightedLines(result.value),
  };
}
export function splitHighlightedLines(html: string) {
  const lines: string[] = [],
    openTags: string[] = [];
  let current = "",
    cursor = 0;
  for (const match of html.matchAll(/<span\b[^>]*>|<\/span>|\n/giu)) {
    const [token] = match,
      { index } = match;
    current += html.slice(cursor, index);
    cursor = index + token.length;
    if (token === "\n") {
      lines.push(closeTags(current, openTags));
      current = openTags.join("");
    } else {
      current += token;
      if (token.startsWith("</")) {
        openTags.pop();
      } else {
        openTags.push(token);
      }
    }
  }
  lines.push(closeTags(current + html.slice(cursor), openTags));
  return lines;
}
function closeTags(value: string, openTags: string[]) {
  return (
    value +
    openTags
      .map(() => "</span>")
      .toReversed()
      .join("")
  );
}
function normalizeLanguage(language?: string) {
  return language
    ?.replace(/^language-/, "")
    .trim()
    .toLowerCase();
}
