import { AIMessage, HumanMessage, ToolMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb, required, workspace } from "../support/database";
import {
  readComposerDraftRecord,
  writeComposerDraftRecord,
} from "../../src/infrastructure/database/records/session/composerDrafts";
import { agentFixture } from "./support/agentFixture";
import { forkDatabaseBeforeMessage } from "../../src/app/fork";
import { processInput } from "../../src/runtime/consumeInputs";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

afterEach(cleanupDatabaseDirs);
test.each(["", "unsent draft"])(
  "fork continues without submitting the composer: %j",
  async (draft) => {
    const source = makeDb(),
      target = makeDb();
    try {
      await prepareFork(source, target, new AIMessage("previous answer"));
      writeComposerDraftRecord(target.db, "target", draft, 2);
      const fixture = agentFixture({ db: target }),
        before = target.history("target").filter((message) => HumanMessage.isInstance(message));
      expect(target.nextInput("target")?.status).toBe("paused");
      target.setControl("target", "running");
      await processInput(fixture.context, required(target.nextInput("target")));
      expect(fixture.model.doStreamCalls).toHaveLength(1);
      expect(target.nextInput("target")).toBeNull();
      expect(
        target.history("target").filter((message) => HumanMessage.isInstance(message)),
      ).toEqual(before);
      expect(readComposerDraftRecord(target.db, "target").content).toBe(draft);
      expect(target.history("target").at(-1)?.text).toBe("continued");
      fixture.executions.close();
    } finally {
      source.close();
      target.close();
    }
  },
);
test("fork resumes pending tools before requesting the model", async () => {
  const source = makeDb(),
    target = makeDb();
  let called = 0;
  const echo = tool(
    () => {
      called += 1;
      return "echoed";
    },
    {
      description: "echo",
      name: "echo",
      schema: z.object({}),
    },
  );
  try {
    await prepareFork(
      source,
      target,
      new AIMessage({
        content: "",
        tool_calls: [{ args: {}, id: "echo-call", name: "echo" }],
      }),
    );
    const fixture = agentFixture({ db: target, tools: [echo] });
    target.setControl("target", "running");
    await processInput(fixture.context, required(target.nextInput("target")));
    expect(called).toBe(1);
    expect(target.nextInput("target")).toBeNull();
    expect(fixture.model.doStreamCalls).toHaveLength(1);
    expect(
      target.history("target").filter((message) => ToolMessage.isInstance(message)),
    ).toHaveLength(1);
    fixture.executions.close();
  } finally {
    source.close();
    target.close();
  }
});
async function prepareFork(
  source: ReturnType<typeof makeDb>,
  target: ReturnType<typeof makeDb>,
  response: AIMessage,
) {
  source.resetSession("source", workspace);
  source.appendUser("source", "first user");
  source.consumeInput("source", required(source.nextInput("source")));
  await source.syncHistory("source", [...source.history("source"), response]);
  source.appendUser("source", "deleted fork message");
  const messageId = source.consumeInput("source", required(source.pendingInputs("source")[0]));
  forkDatabaseBeforeMessage({
    beforeMessageId: messageId,
    profiles: [],
    source,
    sourceSessionId: "source",
    target,
    targetSessionId: "target",
    workspace,
  });
}
