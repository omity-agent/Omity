import { afterEach, expect, test } from "bun:test";

import { AIMessage } from "@langchain/core/messages";

import { loadTranscript } from "../../src/app/transcript";
import { captureError } from "../../src/failures/details";
import { storeMessage } from "../../src/infrastructure/database/records/transcript/messages/history";
import {
  loadReasoningTranslations,
  storeReasoningTranslation,
} from "../../src/infrastructure/database/records/transcript/reasoningTranslations";
import {
  cleanupDatabaseDirs,
  makeDatabases,
  makeDb,
  required,
  workspace,
} from "../support/database";

afterEach(cleanupDatabaseDirs);
test("stream links survive reconstruction and yield to sparse canonical message links", async () => {
  const connections = makeDatabases(2);
  using db = required(connections[0]);
  using resumed = required(connections[1]);
  db.createSession("session", workspace);
  const inputId = db.appendUser("session", "run"),
    firstPath = "src/fileLinks/types.ts",
    secondPath = "src/fileLinks/messageSources.ts",
    prefix = "plain\nsrc/fileLi",
    middle = "nks/types.ts\r",
    suffix = `\nplain\n${secondPath}\n`,
    text = prefix + middle + suffix;
  db.consumeInput("session", required(db.nextInput("session")));
  storeMessage(db.db, "session", new AIMessage({ content: firstPath, id: "seed" }), 1);
  const append = (value: string) => ({
    inputId,
    kind: "assistant_text_delta" as const,
    messageId: "stream",
    partId: "text",
    value,
  });
  await db.appendStream("session", append(prefix));
  expect(loadTranscript(db.db, "session").fileLinks).toEqual([]);
  await db.appendStream("session", append(middle));
  const streamed = await resumed.appendStream("session", append(suffix)),
    snapshot = loadTranscript(resumed.db, "session");
  expect(snapshot.fileLinks).toHaveLength(1);
  expect(snapshot.fileLinks).toEqual(required(streamed.fileLinks));
  expect(snapshot.fileLinks[0]?.matches.map((match) => match.position)).toEqual(
    [firstPath, secondPath].map((path) => ({
      end: text.indexOf(path) + path.length,
      start: text.indexOf(path),
    })),
  );
  const settled = new AIMessage({ content: text, id: "settled" }),
    history = [...db.history("session"), settled];
  await resumed.syncHistory("session", history);
  const canonical = loadTranscript(resumed.db, "session");
  expect(canonical.fileLinks.map((link) => link.ownerId).toSorted()).toEqual(["seed", "settled"]);
  expect(canonical.events.map((event) => event.kind)).toEqual(["user_appended"]);
  expect(resumed.db.query("SELECT input_id FROM file_link_sets").all()).toEqual([
    { input_id: null },
    { input_id: null },
  ]);
  settled.content = "replacement without file paths";
  await resumed.syncHistory("session", history);
  expect(loadTranscript(resumed.db, "session").fileLinks.map((link) => link.ownerId)).toEqual([
    "seed",
  ]);
  db.resetSession("session", workspace);
  await db.syncHistory("session", [new AIMessage({ content: secondPath, id: "reset" })]);
  expect(loadTranscript(db.db, "session").fileLinks[0]?.ownerId).toBe("reset");
});
test("persisted run failures deduplicate nested request input without dropping distinct details", () => {
  using db = makeDb();
  db.createSession("session", workspace);
  const inputId = db.appendUser("session", "run"),
    payload = `unique-payload${"x".repeat(4096)}`,
    input = [{ content: payload, role: "user" }],
    cause = Object.assign(new Error("nested"), {
      requestBodyValues: { input, model: "nested-model" },
    }),
    error = Object.assign(new Error("outer", { cause }), {
      requestBodyValues: { input, model: "outer-model" },
    });
  db.pauseRun("session", required(db.nextInput("session")).runId, captureError(error));
  const restored = loadTranscript(db.db, "session").queue.find(
      (item) => item.id === inputId,
    )?.error,
    stored = required(db.db.query<{ error_json: string }, []>("SELECT error_json FROM runs").get());
  expect(restored?.details).toEqual({ requestBodyValues: { input, model: "outer-model" } });
  expect(restored?.cause?.details).toEqual({ requestBodyValues: { model: "nested-model" } });
  expect(stored.error_json.split(payload)).toHaveLength(2);
});
test("translations derive their source from the canonical message and follow message deletion", async () => {
  using db = makeDb();
  db.createSession("session", workspace);
  await db.syncHistory("session", [
    new AIMessage({
      additional_kwargs: { aiSdkContent: [{ text: "canonical reasoning", type: "reasoning" }] },
      content: "",
      id: "reasoning",
    }),
  ]);
  storeReasoningTranslation(db.db, "session", {
    messageId: "reasoning",
    source: "not persisted",
    targetLanguage: "zh-CN",
    translated: "译文",
  });
  expect(loadReasoningTranslations(db.db, "session")).toEqual([
    {
      messageId: "reasoning",
      source: "canonical reasoning",
      targetLanguage: "zh-CN",
      translated: "译文",
    },
  ]);
  await db.syncHistory("session", []);
  expect(loadReasoningTranslations(db.db, "session")).toEqual([]);
});
