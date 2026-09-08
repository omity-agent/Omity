import { describe, expect, test } from "bun:test";
import {
  groupSessions,
  isRunning,
  statusLabelKey,
  updatedAtRefreshDelay,
} from "../../src/app/frontend/components/Sidebar/sessions";
import type { SessionInfo } from "../../src/app/frontend/services/client";

describe("侧栏会话排序", () => {
  test("空列表及特殊对象键名可以安全分组", () => {
    expect(groupSessions([])).toEqual([]);
    const groups = groupSessions([
      session("first", "__proto__", "idle", 1),
      session("second", "__proto__", "tool", 2),
      session("third", "constructor", "idle", 3),
    ]);
    expect(groups.map(({ workspace }) => workspace)).toEqual(["__proto__", "constructor"]);
    expect(groups[0]?.sessions.map(({ id }) => id)).toEqual(["second", "first"]);
    expect(groups[0]?.runningCount).toBe(1);
    expect(groups[0]?.updatedAt).toBe(2);
  });
  test.each(["waiting", "streaming"] as const)("运行工作区和 %s 会话优先", (status) => {
    const input = [
        session("history-new", "F:/history", "idle", 900),
        session("alpha-old", "F:/alpha", "idle", 100),
        session("beta-tool", "F:/beta", "tool", 300),
        session("alpha-model", "F:/alpha", status, 200),
        session("beta-new", "F:/beta", "idle", 800),
      ],
      groups = groupSessions(input);
    expect(groups.map(({ workspace }) => workspace)).toEqual(["F:/beta", "F:/alpha", "F:/history"]);
    expect(groups.map(({ sessions }) => sessions.map(({ id }) => id))).toEqual([
      ["beta-tool", "beta-new"],
      ["alpha-model", "alpha-old"],
      ["history-new"],
    ]);
    expect(input.map(({ id }) => id)).toEqual([
      "history-new",
      "alpha-old",
      "beta-tool",
      "alpha-model",
      "beta-new",
    ]);
  });
  test("等待响应、接收中、工具和正在暂停都属于运行中", () => {
    const runningStatuses: SessionInfo["status"][] = ["waiting", "streaming", "tool", "pausing"];
    expect(runningStatuses.map((status) => isRunning(session("id", "F:/", status, 1)))).toEqual([
      true,
      true,
      true,
      true,
    ]);
    const stoppedStatuses: SessionInfo["status"][] = ["idle", "paused", "error"];
    expect(stoppedStatuses.map((status) => isRunning(session("id", "F:/", status, 1)))).toEqual([
      false,
      false,
      false,
    ]);
  });
  test("模型等待和接收使用不同状态标签", () => {
    expect(statusLabelKey("waiting")).toBe("statusWaiting");
    expect(statusLabelKey("streaming")).toBe("statusStreaming");
  });
  test("相同时间使用创建时间和 id 得到确定顺序", () => {
    const groups = groupSessions([
      session("z", "F:/same", "idle", 100, 10),
      session("b", "F:/same", "idle", 100, 20),
      session("a", "F:/same", "idle", 100, 20),
    ]);
    expect(groups[0]?.sessions.map(({ id }) => id)).toEqual(["a", "b", "z"]);
  });
  test("相对时间在显示值变化的边界刷新", () => {
    const updatedAt = 1000,
      timestamp = updatedAt * 1000;
    expect(updatedAtRefreshDelay(updatedAt, timestamp)).toBe(60_000);
    expect(updatedAtRefreshDelay(updatedAt, timestamp + 59_999)).toBe(1);
    expect(updatedAtRefreshDelay(updatedAt, timestamp + 60_000)).toBe(60_000);
    expect(updatedAtRefreshDelay(updatedAt, timestamp + 3_599_999)).toBe(1);
    expect(updatedAtRefreshDelay(updatedAt, timestamp + 3_600_000)).toBe(3_600_000);
    expect(updatedAtRefreshDelay(updatedAt, timestamp + 604_800_000)).toBeUndefined();
  });
});
function session(
  id: string,
  workspace: string,
  status: SessionInfo["status"],
  updatedAt: number,
  createdAt = updatedAt,
): SessionInfo {
  return { createdAt, error: null, id, status, title: id, updatedAt, workspace };
}
