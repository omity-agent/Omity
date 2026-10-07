import { and, asc, eq } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { events } from "../../schema";
import { isPlainObject as isRecord } from "es-toolkit";
import { localize } from "../../../../i18n/server";
import { sessionDatabase } from "../../sqlite/connection";

interface ToolStreamIdentity {
  messageId: string;
  partId: string;
}
export function findToolStreamIdentity(
  db: Database,
  sessionId: string,
  callId: string,
): ToolStreamIdentity | null {
  const rows = sessionDatabase(db)
      .select({
        messageId: events.messageId,
        partId: events.partId,
        payload: events.payload,
      })
      .from(events)
      .where(and(eq(events.sessionId, sessionId), eq(events.kind, "tool_call_delta")))
      .orderBy(asc(events.id))
      .all(),
    matches = rows.filter(
      (row) => isRecord(row.payload) && Reflect.get(row.payload, "idDelta") === callId,
    ),
    identities = new Map(
      matches.map((row) => [
        `${row.messageId}\u0000${row.partId}`,
        { messageId: row.messageId, partId: row.partId },
      ]),
    );
  if (identities.size > 1) {
    throw new Error(
      localize("database:transcript.formalCallStreamIdentityDuplicate", { value0: callId }),
    );
  }
  return identities.values().next().value ?? null;
}
