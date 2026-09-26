import { AIMessage, HumanMessage } from "@langchain/core/messages";
import { afterEach, expect, test } from "bun:test";
import { completion, createPredictionFixture } from "./modelFixture";

const fixtures: Awaited<ReturnType<typeof createPredictionFixture>>[] = [];
afterEach(async () => {
  for (const entry of fixtures.splice(0)) {
    await entry.dispose();
  }
});
async function fixture() {
  const value = await createPredictionFixture();
  fixtures.push(value);
  return value;
}
test("a new reply replaces an in-flight prediction and all readers receive the new result", async () => {
  const value = await fixture(),
    { database, service, sessionId } = value,
    started = Promise.withResolvers<void>(),
    blocked = Promise.withResolvers<Response>(),
    latest = ["新回复的建议一", "新回复的建议二"];
  value.respondWith(() => {
    started.resolve();
    return blocked.promise;
  });
  const first = service.get(sessionId);
  await started.promise;
  try {
    await database.syncHistory(sessionId, [
      ...database.history(sessionId),
      new HumanMessage({ content: "新问题", id: "next-user" }),
      new AIMessage({ content: "新回复", id: "next-assistant" }),
    ]);
    value.respondWith(() => Promise.resolve(Response.json(completion(latest))));
    const second = service.get(sessionId);
    expect(await second).toEqual(latest);
    blocked.resolve(Response.json(completion(value.replies)));
    expect(await first).toEqual(latest);
    expect(await service.get(sessionId)).toEqual(latest);
    expect(value.requests).toHaveLength(2);
  } finally {
    blocked.resolve(Response.json(completion(value.replies)));
    await first;
  }
});
test("a late completion cannot persist suggestions after a new user input", async () => {
  const value = await fixture(),
    { database, service, sessionId } = value,
    started = Promise.withResolvers<void>(),
    blocked = Promise.withResolvers<Response>();
  value.respondWith(() => {
    started.resolve();
    return blocked.promise;
  });
  const pending = service.get(sessionId);
  await started.promise;
  database.appendUser(sessionId, "新输入");
  blocked.resolve(Response.json(completion(value.replies)));
  expect(await pending).toEqual([]);
  expect(
    database.db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM input_predictions")
      .get()?.total,
  ).toBe(0);
});
test("model failures are visible to callers and do not prevent a subsequent retry", async () => {
  const value = await fixture();
  value.respondWith(() =>
    Promise.resolve(
      Response.json({ error: { message: "prediction unavailable" } }, { status: 500 }),
    ),
  );
  expect(value.service.get(value.sessionId)).rejects.toThrow("prediction unavailable");
  value.respondWith(() => Promise.resolve(Response.json(completion(value.replies))));
  expect(await value.service.get(value.sessionId)).toEqual(value.replies);
  expect(value.requests).toHaveLength(2);
});
test("invalid blank candidates are rejected instead of being persisted", async () => {
  const value = await fixture();
  value.respondWith(() => Promise.resolve(Response.json(completion([" ", "可用文本"]))));
  expect(value.service.get(value.sessionId)).rejects.toThrow();
  expect(
    value.database.db
      .query<{ total: number }, []>("SELECT COUNT(*) AS total FROM input_predictions")
      .get()?.total,
  ).toBe(0);
});
test("shutdown aborts generation and prevents later database writes", async () => {
  const value = await fixture(),
    started = Promise.withResolvers<void>(),
    blocked = Promise.withResolvers<Response>();
  value.respondWith(() => {
    started.resolve();
    return blocked.promise;
  });
  const pending = value.service.get(value.sessionId);
  await started.promise;
  try {
    await value.service.close();
    expect(await pending).toEqual([]);
    expect(await value.service.get(value.sessionId)).toEqual([]);
  } finally {
    blocked.resolve(Response.json(completion(value.replies)));
  }
});
test.each([
  new HumanMessage({ content: "尚未回答", id: "unanswered" }),
  new AIMessage({ content: " ", id: "empty-assistant" }),
  new AIMessage({
    content: "正在调用工具",
    id: "tool-assistant",
    tool_calls: [{ args: {}, id: "call-1", name: "lookup" }],
  }),
])("incomplete conversation endings do not trigger predictions: %j", async (ending) => {
  const value = await fixture();
  await value.database.syncHistory(value.sessionId, [
    ...value.database.history(value.sessionId).slice(0, -1),
    ending,
  ]);
  expect(await value.service.get(value.sessionId)).toEqual([]);
  expect(value.requests).toHaveLength(0);
});
