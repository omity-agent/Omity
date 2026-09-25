import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import { appendAssistantMessage } from "../../src/infrastructure/database/records/transcript/messages/history";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";

afterEach(cleanupDatabaseDirs);
test("fork pauses a user message inserted into an active model run", () => {
  const source = makeDb(),
    target = makeDb();
  source.resetSession("source", workspace);
  source.appendUser("source", "第一条");
  source.consumeInput("source", required(source.nextInput("source")));
  appendAssistantMessage(source.db, "source", "生成中的回复");
  const inserted = source.appendUser("source", "插入消息");
  source.consumeInput("source", required(source.pendingInputs("source")[0]));
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
function userMessageId(db: ReturnType<typeof makeDb>, inputId: number) {
  const query = db.db.prepare<{ id: number }, [number]>(
    "SELECT id FROM messages WHERE input_id = ?",
  );
  try {
    return required(query.get(inputId)).id;
  } finally {
    query.finalize();
  }
}
