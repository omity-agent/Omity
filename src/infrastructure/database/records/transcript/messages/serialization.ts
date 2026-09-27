import { type BaseMessage, HumanMessage } from "@langchain/core/messages";
import { type MessageStorageMode, encodeMessage } from "./payload";
import { contentToText } from "../../../../../runtime/content";
import { countTokens } from "../../../../../runtime/tokenizer";

export interface MessageInsert {
  messageJson: string;
  sourceId: string;
  tokenCount: number | null;
}
export type { MessageStorageMode } from "./payload";
export function messageInsert(
  message: BaseMessage,
  mode: MessageStorageMode = "history",
): MessageInsert {
  if (!message.id) {
    throw new Error("LangChain 消息缺少持久化 ID");
  }
  return {
    messageJson: JSON.stringify(encodeMessage(message, mode)),
    sourceId: message.id,
    tokenCount: HumanMessage.isInstance(message)
      ? countTokens(contentToText(message.content))
      : null,
  };
}
