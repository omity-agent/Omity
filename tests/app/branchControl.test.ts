import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/messages/history";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";

afterEach(cleanupDatabaseDirs);
test("fork pauses a user message inserted into an active model run", () => {
  const source = makeDb(),
    target = makeDb();
  source.resetSession("source", workspace);
  source.appendUser("source", "第一条");
  source.startQueue("source", required(source.nextQueue("source")));
  appendAssistantMessage(source.db, "source", "生成中的回复");
  const inserted = source.appendUser("source", "插入消息");
  source.startQueue("source", required(source.pendingAppends("source")[0]));
  forkDatabaseBeforeMessage({
    beforeMessageId: userMessageId(source, inserted),
    profiles: [],
    source,
    sourceSessionId: "source",
    target,
    targetSessionId: "target",
    workspace,
  });
  expect(target.control("target")).toBe("pause");
  source.close();
  target.close();
});
function userMessageId(db: ReturnType<typeof makeDb>, queueId: number) {
  const query = db.db.prepare<{ id: number }, [number]>(
    "SELECT id FROM messages WHERE queue_id = ?",
  );
  try {
    return required(query.get(queueId)).id;
  } finally {
    query.finalize();
  }
}
