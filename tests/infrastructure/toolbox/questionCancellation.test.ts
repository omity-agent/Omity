import { expect, mock, test } from "bun:test";
import { AskUserRuntime } from "../../../src/infrastructure/toolbox/runtime";
import { askUserRequestSchema } from "../../../src/infrastructure/toolbox/questionnaire";
import { getEventListeners } from "node:events";

const question = { callId: "call", kind: "open_ended", question: "问题" } as const;
test("取消问题立即撤销可回答状态并释放监听器", async () => {
  const changed = mock(),
    runtime = new AskUserRuntime(changed),
    controller = new AbortController(),
    reason = new Error("已取消"),
    waiting = runtime.ask(question, "session", controller.signal),
    rejected = rejection(waiting);
  controller.abort(reason);
  expect(runtime.question("session")).toBeNull();
  expect(() => runtime.answer("session", "call", { answer: "迟到的答案" })).toThrow();
  expect(await rejected).toBe(reason);
  expect(changed).toHaveBeenCalledTimes(2);
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
});
test("预先取消的信号保留终止错误契约", async () => {
  const runtime = new AskUserRuntime(),
    waiting = runtime.ask(question, "session", AbortSignal.abort("cancelled"));
  expect(runtime.question("session")).toBeNull();
  expect(await rejection(waiting)).toMatchObject({ message: "工具已终止" });
});
test("正常回答后移除取消监听，重复回答显式失败", async () => {
  const runtime = new AskUserRuntime(),
    controller = new AbortController(),
    waiting = runtime.ask(question, "session", controller.signal);
  runtime.answer("session", "call", { answer: "答案" });
  expect(() => runtime.answer("session", "call", { answer: "重复" })).toThrow();
  expect(await waiting).toEqual({ answer: "答案" });
  expect(getEventListeners(controller.signal, "abort")).toHaveLength(0);
  expect(runtime.question("session")).toBeNull();
});
async function rejection(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("预期问题被取消");
}
test("共享问题契约校验传输类型，不重复施加工具配置中的长度限制", () => {
  expect(askUserRequestSchema.parse(question)).toEqual(question);
  expect(
    askUserRequestSchema.safeParse({ ...question, kind: "choice", multiple: false, options: [1] })
      .success,
  ).toBeFalse();
  expect(askUserRequestSchema.safeParse({ ...question, question: 1 }).success).toBeFalse();
  expect(askUserRequestSchema.safeParse({ ...question, question: "" }).success).toBeTrue();
});
