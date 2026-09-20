import type { Database } from "bun:sqlite";
import { cachedQuery } from "../../connection";
import { storedConversationSchema } from "./replayShape";
import { z } from "zod";

export function deriveSessionTitle(db: Database, sessionId: string) {
  const row = cachedQuery<{ message_json: string; call_index: number }>(
    db,
    `WITH completed AS MATERIALIZED (
       SELECT position,
         json_extract(message_json, '$.toolCallId') AS call_id,
         json_extract(message_json, '$.name') AS tool_name
       FROM messages
       WHERE session_id = ? AND position IS NOT NULL
         AND json_extract(message_json, '$.type') = 'tool'
         AND json_extract(message_json, '$.builtInTool') = 'update_title'
         AND json_extract(message_json, '$.status') = 'success'
     )
     SELECT request.message_json, CAST(call.key AS INTEGER) AS call_index
     FROM messages request, json_each(request.message_json, '$.toolCalls') call
     WHERE request.session_id = ? AND request.position IS NOT NULL
       AND json_extract(request.message_json, '$.type') = 'ai'
       AND EXISTS (
         SELECT 1 FROM completed result
         WHERE result.position > request.position
           AND result.call_id = json_extract(call.value, '$.id')
           AND result.tool_name = json_extract(call.value, '$.name')
       )
     ORDER BY request.position DESC, CAST(call.key AS INTEGER) DESC LIMIT 1`,
  ).get(sessionId, sessionId);
  if (!row) {
    return sessionId;
  }
  const message = storedConversationSchema.parse(JSON.parse(row.message_json) as unknown),
    call = message.type === "ai" ? message.toolCalls?.[row.call_index] : undefined;
  if (!call) {
    throw new Error(`标题调用记录无效：${sessionId}`);
  }
  return z
    .string()
    .trim()
    .min(1)
    .parse(call.args[call.isCustomTool ? "input" : "title"]);
}
