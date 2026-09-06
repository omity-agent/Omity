import { expect, mock, test } from "bun:test";
import { AppEvents } from "../../src/app/events";

test("唤醒仅通知同一会话，并广播给该会话的所有等待者", async () => {
  const events = new AppEvents(),
    otherWoke = mock(),
    other = observe(events.wait("other", 60_000), otherWoke),
    first = events.wait("target", 60_000),
    second = events.wait("target", 60_000);
  events.wake("target");
  await Promise.all([first, second]);
  expect(otherWoke).not.toHaveBeenCalled();
  events.wake("other");
  await other;
  expect(otherWoke).toHaveBeenCalledTimes(1);
});
test("超时完成后重复唤醒不会保留或触发旧订阅", async () => {
  const events = new AppEvents(),
    completed = mock(),
    waiting = observe(events.wait("error", 0), completed);
  await waiting;
  events.wake("error");
  events.wake("error");
  expect(completed).toHaveBeenCalledTimes(1);
  const next = events.wait("error", 60_000);
  events.wake("error");
  await next;
});
test("连续完成的等待者会及时释放事件订阅", async () => {
  const events = new AppEvents(),
    completed = mock();
  for (let index = 0; index < 30; index += 1) {
    const waiting = events.wait("session", 60_000);
    events.wake("session");
    await waiting;
    completed();
  }
  expect(completed).toHaveBeenCalledTimes(30);
});
test("不同会话的并发等待不会共用错误事件监听器", async () => {
  const events = new AppEvents(),
    sessions = Array.from({ length: 30 }, (_, index) => `session-${index.toString()}`),
    waiting = sessions.map((sessionId) => events.wait(sessionId, 60_000));
  for (const sessionId of sessions) {
    events.wake(sessionId);
  }
  await Promise.all(waiting);
  expect(waiting).toHaveLength(sessions.length);
});
async function observe(waiting: Promise<void>, completed: () => void) {
  await waiting;
  completed();
}
