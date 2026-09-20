import type { Boundaries, TimingSpan } from "./spanRecorder";
import assert from "node:assert/strict";

interface Interval {
  start: number;
  end: number;
}
interface DetailTiming {
  path: string[];
  milliseconds: number;
  selfMilliseconds: number;
  calls: number;
  firstOffset: number;
}
export interface PhaseTiming {
  label: string;
  milliseconds: number;
  untraced: number;
  details: DetailTiming[];
}
const phases = [
  { from: "received", label: "① 模型收尾", to: "modelSettled" },
  { from: "modelSettled", label: "② 工具前准备", to: "mcpStarted" },
  { from: "mcpStarted", label: "③ MCP 往返", to: "mcpReturned" },
  { from: "mcpReturned", label: "④ 工具后处理", to: "nextModel" },
  { from: "nextModel", label: "⑤ 下一次模型请求构造", to: "sent" },
] as const;
export function summarizePhases(boundaries: Boundaries, spans: TimingSpan[]): PhaseTiming[] {
  const result = phases.map(({ from, to, label }) =>
    summarizePhase(label, { end: boundaries[to], start: boundaries[from] }, spans),
  );
  assert(
    Math.abs(
      result.reduce((total, phase) => total + phase.milliseconds, 0) -
        (boundaries.sent - boundaries.received),
    ) < 0.001,
    "分段时间未覆盖完整调用",
  );
  return result;
}
function summarizePhase(label: string, phase: Interval, spans: TimingSpan[]): PhaseTiming {
  const groups = new Map<
      string,
      {
        path: string[];
        intervals: Interval[];
        children: Interval[];
        calls: number;
      }
    >(),
    covered: Interval[] = [];
  for (const span of spans) {
    assert(span.end !== undefined, `计时操作未完成：${span.label}`);
    const interval = {
      end: Math.min(span.end, phase.end),
      start: Math.max(span.start, phase.start),
    };
    if (interval.end > interval.start) {
      const path: string[] = [];
      let ancestor: TimingSpan | undefined = span;
      while (ancestor) {
        path.unshift(ancestor.label);
        ancestor = ancestor.parent;
      }
      const key = JSON.stringify(path),
        group = groups.get(key) ?? { calls: 0, children: [], intervals: [], path };
      group.intervals.push(interval);
      for (const child of spans.filter((candidate) => candidate.parent === span)) {
        assert(child.end !== undefined, `计时子项未完成：${child.label}`);
        const start = Math.max(interval.start, child.start),
          end = Math.min(interval.end, child.end);
        if (end > start) {
          group.children.push({ end, start });
        }
      }
      group.calls += 1;
      groups.set(key, group);
      covered.push(interval);
    }
  }
  const milliseconds = phase.end - phase.start,
    union = intervalUnion(covered);
  assert(union <= milliseconds + 0.001, "内部计时超出阶段范围");
  return {
    details: [...groups.values()].map((group) => ({
      calls: group.calls,
      firstOffset: Math.min(...group.intervals.map((interval) => interval.start)) - phase.start,
      milliseconds: intervalUnion(group.intervals),
      path: group.path,
      selfMilliseconds: Math.max(0, intervalUnion(group.intervals) - intervalUnion(group.children)),
    })),
    label,
    milliseconds,
    untraced: Math.max(0, milliseconds - union),
  };
}
function intervalUnion(intervals: Interval[]) {
  const ordered = intervals.toSorted((left, right) => left.start - right.start);
  let total = 0,
    end = -Infinity;
  for (const interval of ordered) {
    total += Math.max(0, interval.end - Math.max(interval.start, end));
    end = Math.max(end, interval.end);
  }
  return total;
}
