import { configureReadonlyDatabase, queryAll } from "../infrastructure/database/sqlite/connection";
import { Database } from "bun:sqlite";
import { contentToText } from "../runtime/content";
import { databasePath } from "../infrastructure/configuration/sessionPaths";
import { existsSync } from "node:fs";
import { messageRowsToChatMessages } from "../infrastructure/database/records/transcript/messages/serialization";

interface UserMessageRow {
  created_at: number;
  id: number;
  message_json: string;
  source_id: string;
}
export function loadUserMessages() {
  const path = databasePath();
  if (!existsSync(path)) {
    return [];
  }
  using db = new Database(path, { create: false, readonly: true, strict: true });
  configureReadonlyDatabase(db);
  return queryAll<UserMessageRow>(
    db,
    `SELECT id, source_id, message_json, created_at
     FROM messages
     WHERE position IS NOT NULL AND json_extract(message_json, '$.type') = 'human'
     ORDER BY created_at, id`,
  ).map((row) => {
    const [message] = messageRowsToChatMessages([row]);
    if (!message) {
      throw new Error(`无法还原用户消息：${row.id.toString()}`);
    }
    return { content: contentToText(message.content), createdAt: row.created_at };
  });
}
