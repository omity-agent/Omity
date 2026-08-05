import { eq, sql } from "drizzle-orm";
import type { Database } from "bun:sqlite";
import { hookUsage } from "../../infrastructure/database/schema";
import { sessionDatabase } from "../../infrastructure/database/connection";

export function consumeHookUsage(
  db: Database,
  sessionId: string,
  hookId: string,
  limit: number,
): boolean {
  if (limit === -1) {
    return true;
  }
  if (limit === 0) {
    return false;
  }
  return Boolean(
    sessionDatabase(db)
      .insert(hookUsage)
      .values({ hookId, sessionId, usedCount: 1 })
      .onConflictDoUpdate({
        set: { usedCount: sql`${hookUsage.usedCount} + 1` },
        setWhere: sql`${hookUsage.usedCount} < ${limit}`,
        target: [hookUsage.sessionId, hookUsage.hookId],
      })
      .returning({ hookId: hookUsage.hookId })
      .get(),
  );
}
export function copyHookUsage(
  source: Database,
  sourceSessionId: string,
  target: Database,
  targetSessionId: string,
) {
  const rows = sessionDatabase(source)
    .select({ hookId: hookUsage.hookId, usedCount: hookUsage.usedCount })
    .from(hookUsage)
    .where(eq(hookUsage.sessionId, sourceSessionId))
    .all();
  if (rows.length > 0) {
    sessionDatabase(target)
      .insert(hookUsage)
      .values(rows.map((row) => Object.assign(row, { sessionId: targetSessionId })))
      .run();
  }
}
