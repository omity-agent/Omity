import {
  ALL_SPECIAL_TOKENS,
  countTokens as countGptTokens,
} from "gpt-tokenizer/encoding/o200k_base";

export function countTokens(text: string) {
  return countGptTokens(text, { allowedSpecial: ALL_SPECIAL_TOKENS });
}
