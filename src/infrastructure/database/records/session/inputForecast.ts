import { and, eq } from "drizzle-orm";
import { AIMessage } from "@langchain/core/messages";
import type { Database } from "bun:sqlite";
import { inputPredictions } from "../../schema";
import { messageContentToText } from "../../../../runtime/modelContent";
import { messageRowsToChatMessages } from "../transcript/messages/serialization";
import { sessionDatabase } from "../../sqlite/connection";
import { z } from "zod";

interface ContextRow {
  message_json: string;
  transcript_revision: number;
}
const candidatesSchema = z.array(z.string().trim().min(1)).min(1);
export function readPredictionContext(db: Database, sessionId: string) {
  const row = db
    .query<ContextRow, [string]>(
      `SELECT m.message_json, s.transcript_revision
       FROM sessions s JOIN messages m ON m.session_id = s.id
       WHERE s.id = ? AND s.control = 'running'
         AND m.position = (SELECT MAX(position) FROM messages WHERE session_id = s.id)
         AND NOT EXISTS (
           SELECT 1 FROM runs WHERE session_id = s.id AND status IN ('pending', 'running', 'paused')
         )`,
    )
    .get(sessionId);
  if (!row) {
    return undefined;
  }
  const [message] = messageRowsToChatMessages([row]);
  if (!message || !AIMessage.isInstance(message) || message.tool_calls?.length) {
    return undefined;
  }
  const content = messageContentToText(message);
  return content.trim() ? { content, revision: row.transcript_revision } : undefined;
}
export function readPredictionRecord(db: Database, sessionId: string, revision: number) {
  const row = sessionDatabase(db)
    .select({ candidates: inputPredictions.candidates })
    .from(inputPredictions)
    .where(
      and(
        eq(inputPredictions.sessionId, sessionId),
        eq(inputPredictions.transcriptRevision, revision),
      ),
    )
    .get();
  return row ? candidatesSchema.parse(row.candidates) : undefined;
}
export function writePredictionRecord(
  db: Database,
  sessionId: string,
  revision: number,
  candidates: string[],
) {
  return (
    db.run(
      `INSERT INTO input_predictions (session_id, transcript_revision, candidates_json, updated_at)
     SELECT id, transcript_revision, ?, unixepoch() FROM sessions
     WHERE id = ? AND transcript_revision = ?
     ON CONFLICT(session_id) DO UPDATE SET
       transcript_revision = excluded.transcript_revision,
       candidates_json = excluded.candidates_json,
       updated_at = excluded.updated_at`,
      [JSON.stringify(candidatesSchema.parse(candidates)), sessionId, revision],
    ).changes === 1
  );
}
