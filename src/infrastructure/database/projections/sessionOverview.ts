import { activeRuns, runs } from "../schema/execution";
import { and, eq, isNotNull, max, sql } from "drizzle-orm";
import { messages, sessions } from "../schema";
import type { Database } from "bun:sqlite";
import { sessionDatabase } from "../sqlite/connection";
import { settingsProfileNamesSchema } from "../../configuration/settings/context";

const statements = new WeakMap<Database, ReturnType<typeof prepareOverviews>>();
export function sessionOverviewRows(db: Database, sessionId?: string) {
  const queries = statements.getOrInsertComputed(db, prepareOverviews),
    rows = sessionId === undefined ? queries.all.all() : queries.one.all({ sessionId });
  return rows.map(({ error, profiles, status, ...session }) =>
    Object.assign(session, {
      error: status === "paused" ? error : null,
      paused: status === "paused",
      profiles: settingsProfileNamesSchema.parse(profiles),
      queueRunning: status === "running",
    }),
  );
}
function prepareOverviews(db: Database) {
  const orm = sessionDatabase(db),
    latestMessage = orm
      .select({ createdAt: max(messages.createdAt) })
      .from(messages)
      .where(and(eq(messages.sessionId, sessions.id), isNotNull(messages.position))),
    fields = {
      control: sessions.control,
      createdAt: sessions.createdAt,
      error: runs.error,
      id: sessions.id,
      profiles: sessions.profiles,
      status: runs.status,
      updatedAt:
        sql`max(${sessions.updatedAt}, coalesce((${latestMessage}), ${sessions.updatedAt}))`.mapWith(
          Number,
        ),
      workspace: sessions.workspace,
    },
    select = () =>
      orm
        .select(fields)
        .from(sessions)
        .leftJoin(runs, and(eq(runs.sessionId, sessions.id), activeRuns()));
  return {
    all: select().prepare(),
    one: select()
      .where(eq(sessions.id, sql.placeholder("sessionId")))
      .prepare(),
  };
}
