/// <reference lib="webworker" />
import { createCodeHighlighter } from "./tokenization";
import { highlightChannel } from "./channel";

highlightChannel(globalThis, createCodeHighlighter());
