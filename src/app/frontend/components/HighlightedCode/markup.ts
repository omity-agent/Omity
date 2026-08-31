import { type BundledLanguage, type Highlighter, bundledLanguages, createHighlighter } from "shiki";
import { syntaxTheme, syntaxThemeName } from "./theme";
import { Magika } from "magika";
import { ShikiStreamTokenizer } from "@shikijs/stream";
import type { ThemedToken } from "shiki/core";
import { escape as escapeHtml } from "es-toolkit";

export interface HighlightInput {
  code: string;
  language?: string;
  streamId: string;
}
export interface HighlightResult {
  language: string;
  lines: string[];
}
type LanguageDetector = (code: string) => Promise<string>;
type SyntaxLanguage = BundledLanguage | "text";
interface StreamState extends Omit<HighlightResult, "language"> {
  code: string;
  language: SyntaxLanguage;
  requestedLanguage?: string;
  tokenizer: ShikiStreamTokenizer;
}
const languageAliases: Record<string, BundledLanguage> = {
    autohotkey: "ahk",
    h: "c",
    hpp: "cpp",
    objectivec: "objective-c",
  },
  fontBold = 2,
  fontItalic = 1,
  fontStrikethrough = 8,
  fontUnderline = 4;
let detectorPromise: Promise<Magika> | undefined,
  highlighterPromise: Promise<Highlighter> | undefined;
export function createCodeHighlighter(detect: LanguageDetector = detectWithMagika) {
  const streams = new Map<string, StreamState>();
  return {
    async highlight(input: HighlightInput): Promise<HighlightResult> {
      const previous = streams.get(input.streamId),
        requestedLanguage = normalizeLanguage(input.language),
        language = await resolveLanguage(input.code, requestedLanguage, previous, detect);
      if (
        previous?.language === language &&
        previous.requestedLanguage === requestedLanguage &&
        input.code.startsWith(previous.code)
      ) {
        if (input.code !== previous.code) {
          await previous.tokenizer.enqueue(input.code.slice(previous.code.length));
          previous.code = input.code;
          previous.lines = tokenizerLines(previous.tokenizer);
        }
        return { language, lines: previous.lines };
      }
      const highlighter = await loadHighlighter(language),
        tokenizer = new ShikiStreamTokenizer({
          highlighter,
          lang: language,
          theme: syntaxThemeName,
        });
      await tokenizer.enqueue(input.code);
      const lines = tokenizerLines(tokenizer);
      streams.set(input.streamId, {
        code: input.code,
        language,
        lines,
        requestedLanguage,
        tokenizer,
      });
      return { language, lines };
    },
    release(streamId: string) {
      streams.delete(streamId);
    },
  };
}
async function resolveLanguage(
  code: string,
  requested: string | undefined,
  previous: StreamState | undefined,
  detect: LanguageDetector,
): Promise<SyntaxLanguage> {
  const explicit = shikiLanguage(requested);
  if (explicit) {
    return explicit;
  }
  if (
    previous &&
    previous.requestedLanguage === requested &&
    code.startsWith(previous.code) &&
    previous.code.trim()
  ) {
    return previous.language;
  }
  return code.trim() ? (shikiLanguage(await detect(code)) ?? "text") : "text";
}
function shikiLanguage(language?: string): SyntaxLanguage | undefined {
  if (!language) {
    return undefined;
  }
  if (["plain", "plaintext", "text", "txt", "txtascii", "txtutf16", "txtutf8"].includes(language)) {
    return "text";
  }
  if (isBundledLanguage(language)) {
    return language;
  }
  return languageAliases[language];
}
async function loadHighlighter(language: BundledLanguage | "text") {
  const highlighter = await (highlighterPromise ??= createHighlighter({
    langs: [],
    themes: [syntaxTheme],
  }));
  if (language !== "text" && !highlighter.getLoadedLanguages().includes(language)) {
    await highlighter.loadLanguage(language);
  }
  return highlighter;
}
async function detectWithMagika(code: string) {
  const modelBaseURL = new URL("/assets/magika/", globalThis.location.href),
    detector = await (detectorPromise ??= Magika.create({
      modelConfigURL: new URL("config.min.json", modelBaseURL).href,
      modelURL: new URL("model.json", modelBaseURL).href,
    })),
    result = await detector.identifyBytes(new TextEncoder().encode(code));
  return result.prediction.output.label;
}
function tokenizerLines(tokenizer: ShikiStreamTokenizer) {
  return tokenLines([...tokenizer.tokensStable, ...tokenizer.tokensUnstable]);
}
export function tokenLines(tokens: ThemedToken[]) {
  const lines = [""];
  for (const token of tokens) {
    const pieces = token.content.split("\n");
    for (const [index, piece] of pieces.entries()) {
      if (index > 0) {
        lines.push("");
      }
      lines[lines.length - 1] += tokenMarkup(piece, token);
    }
  }
  return lines;
}
function tokenMarkup(content: string, token: ThemedToken) {
  if (!content) {
    return "";
  }
  const fontStyle = token.fontStyle ?? 0,
    styles = token.color ? [`color:${token.color}`] : [],
    decoration = [];
  if (fontStyle > 0) {
    if (fontStyle & fontItalic) {
      styles.push("font-style:italic");
    }
    if (fontStyle & fontBold) {
      styles.push("font-weight:bold");
    }
    if (fontStyle & fontUnderline) {
      decoration.push("underline");
    }
    if (fontStyle & fontStrikethrough) {
      decoration.push("line-through");
    }
  }
  if (decoration.length > 0) {
    styles.push(`text-decoration:${decoration.join(" ")}`);
  }
  const escaped = escapeHtml(content);
  return styles.length > 0
    ? `<span style="${escapeHtml(styles.join(";"))}">${escaped}</span>`
    : escaped;
}
function normalizeLanguage(language?: string) {
  return language
    ?.replace(/^language-/, "")
    .trim()
    .toLowerCase();
}
function isBundledLanguage(language: string): language is BundledLanguage {
  return Object.hasOwn(bundledLanguages, language);
}
