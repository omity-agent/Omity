import remarkCjkFriendly from "remark-cjk-friendly/parseOnly";
import remarkCjkFriendlyGfmStrikethrough from "remark-cjk-friendly-gfm-strikethrough/parseOnly";
import remarkGfm from "remark-gfm";

export const markdownPlugins = [remarkGfm, remarkCjkFriendly, remarkCjkFriendlyGfmStrikethrough];
export const transcriptWindow = {
  bufferSize: 384,
  followThreshold: 48,
};
export const codeWindow = {
  bufferSize: 192,
  estimatedLineHeight: 24,
};
