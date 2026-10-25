/// <reference lib="webworker" />
import { highlightChannel } from "./channel";
import { createCodeHighlighter } from "./tokenization";

highlightChannel(globalThis, createCodeHighlighter());
