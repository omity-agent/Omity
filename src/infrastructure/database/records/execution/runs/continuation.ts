import { and, eq, gt, sql } from "drizzle-orm";
import { inputs, runs } from "../../../schema/execution";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../../../sqlite/connection";

export function carryPendingInputs(db: Database, runId: number, sessionId: string) {
  const orm = sessionDatabase(db),
    pending = and(eq(inputs.runId, runId), eq(inputs.delivery, "pending"), gt(inputs.ordinal, 0));
  if (orm.select({ id: inputs.id }).from(inputs).where(pending).limit(1).get()) {
    const successor = orm
        .insert(runs)
        .values({ sessionId, status: "pending" })
        .returning({ id: runs.id })
        .get(),
      ordered = orm.$with("pending_successors").as(
        orm
          .select({
            id: inputs.id,
            ordinal: sql<number>`row_number() over (order by ${inputs.ordinal}) - 1`.as("ordinal"),
          })
          .from(inputs)
          .where(pending),
      );
    orm
      .with(ordered)
      .update(inputs)
      .set({ ordinal: sql`${ordered.ordinal}`, runId: successor.id })
      .from(ordered)
      .where(eq(inputs.id, ordered.id))
      .run();
  }
  orm
    .update(inputs)
    .set({ delivery: "canceled" })
    .where(and(eq(inputs.runId, runId), eq(inputs.delivery, "pending")))
    .run();
}
