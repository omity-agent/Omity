import { Annotation, END, START, StateGraph, task } from "@langchain/langgraph";
import { afterEach, expect, test } from "bun:test";
import { cleanupDatabaseDirs, makeDb } from "../support/database";
import { BunSqliteSaver } from "../../src/checkpointer";

afterEach(cleanupDatabaseDirs);
test("Bun saver resumes a completed task without repeating its side effect", async () => {
  const db = makeDb();
  const saver = new BunSqliteSaver(db.db);
  let calls = 0;
  const effect = task("effect", () => {
    calls += 1;
    return Promise.resolve("completed");
  });
  const State = Annotation.Root({
    result: Annotation<string>(),
  });
  const graph = new StateGraph(State)
    .addNode("work", async () => ({ result: await effect() }))
    .addEdge(START, "work")
    .addEdge("work", END)
    .compile({ checkpointer: saver });
  const config = { configurable: { thread_id: "task-recovery" } };
  await invokeWithTaskInterrupt(graph, {}, config);
  expect(calls).toBe(1);
  const state = await graph.getState(config);
  expect(state.next).toEqual([]);
  const result = await graph.invoke(null, config);
  expect(result.result).toBe("completed");
  expect(calls).toBe(1);
  db.close();
});
async function invokeWithTaskInterrupt(
  graph: object,
  input: unknown,
  config: { configurable: { thread_id: string } },
) {
  const invoke: unknown = Reflect.get(graph, "invoke");
  if (typeof invoke !== "function") {
    throw new Error("LangGraph 缺少 invoke 方法");
  }
  await Reflect.apply(invoke, graph, [input, { ...config, interruptAfter: ["effect"] }]);
}
