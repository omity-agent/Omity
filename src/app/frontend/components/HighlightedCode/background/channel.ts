import { createBirpc } from "birpc";
import type { createCodeHighlighter } from "./tokenization";

type Highlighter = ReturnType<typeof createCodeHighlighter>;
interface Endpoint extends EventTarget {
  postMessage: (message: unknown, transfer: Transferable[]) => void;
}
export function highlightChannel(endpoint: Endpoint, functions: Partial<Highlighter> = {}) {
  return createBirpc<Highlighter>(functions, {
    deserialize: (event: MessageEvent<unknown>) => event.data,
    off: (listener) => endpoint.removeEventListener("message", listener),
    on: (listener) => endpoint.addEventListener("message", listener),
    post: (message: unknown) => endpoint.postMessage(message, []),
    timeout: -1,
  });
}
