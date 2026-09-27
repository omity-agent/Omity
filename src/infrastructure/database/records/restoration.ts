import { and, eq, ne, sql } from "drizzle-orm";
import { checkpointWrites, checkpoints } from "../schema";
import { runTransaction, sessionDatabase } from "../sqlite/connection";
import type { Database } from "bun:sqlite";

type Head = typeof checkpoints.$inferSelect;
type Identity = Pick<Head, "runId" | "checkpointNs">;
export type RecoverySnapshot = Head & {
  pendingWrites: (typeof checkpointWrites.$inferSelect)[];
};
export class RecoveryStore {
  private readonly orm;
  private readonly head;
  private readonly currentId;
  private readonly pending;
  constructor(private readonly db: Database) {
    this.orm = sessionDatabase(db);
    const identity = and(
      eq(checkpoints.runId, sql.placeholder("runId")),
      eq(checkpoints.checkpointNs, sql.placeholder("checkpointNs")),
    );
    this.head = this.orm.select().from(checkpoints).where(identity).prepare();
    this.currentId = this.orm
      .select({ checkpointId: checkpoints.checkpointId })
      .from(checkpoints)
      .where(identity)
      .prepare();
    this.pending = this.orm
      .select()
      .from(checkpointWrites)
      .where(
        and(
          eq(checkpointWrites.runId, sql.placeholder("runId")),
          eq(checkpointWrites.checkpointNs, sql.placeholder("checkpointNs")),
          eq(checkpointWrites.checkpointId, sql.placeholder("checkpointId")),
        ),
      )
      .orderBy(checkpointWrites.taskId, checkpointWrites.index)
      .prepare();
  }
  get(identity: Identity) {
    return runTransaction(this.db, () => {
      const head = this.head.get(identity);
      return head ? this.snapshot(head) : undefined;
    });
  }
  list(filter: Partial<Identity> & { limit?: number }) {
    return runTransaction(this.db, () =>
      this.orm
        .select()
        .from(checkpoints)
        .where(
          and(
            filter.runId === undefined ? undefined : eq(checkpoints.runId, filter.runId),
            filter.checkpointNs === undefined
              ? undefined
              : eq(checkpoints.checkpointNs, filter.checkpointNs),
          ),
        )
        .limit(filter.limit ?? -1)
        .all()
        .map((head) => this.snapshot(head)),
    );
  }
  put(row: Head, expectedId?: string) {
    runTransaction(this.db, () => {
      const current = this.currentId.get(row);
      if (current && current.checkpointId !== expectedId) {
        throw new Error(`checkpoint head 冲突：${current.checkpointId}`);
      }
      this.orm
        .delete(checkpointWrites)
        .where(
          and(
            eq(checkpointWrites.runId, row.runId),
            eq(checkpointWrites.checkpointNs, row.checkpointNs),
            ne(checkpointWrites.checkpointId, row.checkpointId),
          ),
        )
        .run();
      this.orm
        .insert(checkpoints)
        .values(row)
        .onConflictDoUpdate({
          set: {
            checkpoint: row.checkpoint,
            checkpointId: row.checkpointId,
            metadata: row.metadata,
            type: row.type,
          },
          target: [checkpoints.runId, checkpoints.checkpointNs],
        })
        .run();
    });
  }
  putWrites(
    identity: Identity & { checkpointId: string },
    writes: (Omit<typeof checkpointWrites.$inferInsert, keyof Identity | "checkpointId"> & {
      replace: boolean;
    })[],
  ) {
    runTransaction(this.db, () => {
      if (this.currentId.get(identity)?.checkpointId !== identity.checkpointId) {
        throw new Error(`checkpoint pending write 已过期：${identity.checkpointId}`);
      }
      for (const { replace, ...row } of writes) {
        const insert = this.orm.insert(checkpointWrites).values({ ...row, ...identity });
        if (replace) {
          insert
            .onConflictDoUpdate({
              set: { channel: row.channel, type: row.type, value: row.value },
              target: [
                checkpointWrites.runId,
                checkpointWrites.checkpointNs,
                checkpointWrites.taskId,
                checkpointWrites.index,
              ],
            })
            .run();
        } else {
          insert.onConflictDoNothing().run();
        }
      }
    });
  }
  delete(runId: number) {
    this.orm.delete(checkpoints).where(eq(checkpoints.runId, runId)).run();
  }
  private snapshot(head: Head): RecoverySnapshot {
    return { ...head, pendingWrites: this.pending.all(head) };
  }
}
