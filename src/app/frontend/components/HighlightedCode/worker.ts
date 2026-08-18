/// <reference lib="webworker" />
import { type HighlightInput, type HighlightResult, createCodeHighlighter } from "./markup";

export type HighlightRequest =
  | ({ id: number; kind: "highlight" } & HighlightInput)
  | { id: number; kind: "release"; streamId: string };
export type HighlightResponse =
  | { id: number; kind: "release" }
  | { id: number; kind: "highlight"; result: HighlightResult }
  | { error: string; id: number };
const highlighter = createCodeHighlighter();
self.addEventListener("message", async (event: MessageEvent<HighlightRequest>) => {
  const { id } = event.data;
  try {
    if (event.data.kind === "release") {
      highlighter.release(event.data.streamId);
      self.postMessage({ id, kind: "release" } satisfies HighlightResponse, []);
      return;
    }
    const { code, language, streamId } = event.data,
      result = await highlighter.highlight({ code, language, streamId });
    self.postMessage({ id, kind: "highlight", result } satisfies HighlightResponse, []);
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
