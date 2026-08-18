/// <reference lib="webworker" />
import { type HighlightResult, highlightCode } from "./markup";

export interface HighlightRequest {
  code: string;
  id: number;
  language?: string;
}
export type HighlightResponse =
  | { id: number; result: HighlightResult }
  | { error: string; id: number };
self.addEventListener("message", (event: MessageEvent<HighlightRequest>) => {
  const { code, id, language } = event.data;
  try {
    self.postMessage({ id, result: highlightCode(code, language) } satisfies HighlightResponse, []);
  } catch (error) {
    self.postMessage(
      {
        error: error instanceof Error ? error.message : String(error),
        id,
      } satisfies HighlightResponse,
      [],
    );
  }
});
