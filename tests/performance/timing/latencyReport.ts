import type { PhaseTiming } from "./phaseBreakdown";
import type { RoundtripSample } from "./roundtripCapture";
import assert from "node:assert/strict";
import { median } from "es-toolkit";

export function printLatencyReport(samples: RoundtripSample[]) {
  assert(samples.length > 0, "没有可统计的性能样本");
  console.log("\n本机耗时（单位 ms）");
  const first = samples[0]!;
  for (const [index, phase] of first.phases.entries()) {
    const phases = samples.map((sample) => {
      const current = sample.phases[index];
      assert(current?.label === phase.label, "性能样本的阶段不一致");
      return current;
    });
    console.log(
      `${phase.label}：${median(phases.map((value) => value.milliseconds)).toFixed(2)} ms（中位数）`,
    );
    printDetails(phases, []);
    console.log(
      `  图调度、消息处理及其他未细分开销：${median(phases.map((value) => value.untraced)).toFixed(2)} ms`,
    );
  }
  console.log(
    `总计：${median(samples.map((sample) => sample.sent - sample.received)).toFixed(2)} ms（中位数）`,
  );
  console.log(
    `下一次模型请求体：${median(samples.map((sample) => sample.requestBytes)).toLocaleString("zh-CN")} 字节（中位数）`,
  );
  console.log("子项包含在父项耗时内；同项异步区间取并集。");
}
function printDetails(phases: PhaseTiming[], parent: string[]) {
  const children = new Set(
      phases.flatMap((phase) =>
        phase.details
          .filter(
            (detail) =>
              detail.path.length === parent.length + 1 &&
              parent.every((label, index) => detail.path[index] === label),
          )
          .map((detail) => JSON.stringify(detail.path)),
      ),
    ),
    rows = [...children]
      .map((key) => {
        const values = phases.map((phase) =>
            phase.details.find((detail) => JSON.stringify(detail.path) === key),
          ),
          present = values.filter((value) => value !== undefined),
          { path } = present[0]!,
          counts = values.map((value) => value?.calls ?? 0);
        return {
          counts,
          duration: median(values.map((value) => value?.milliseconds ?? 0)),
          hasChildren: phases.some((phase) =>
            phase.details.some(
              (detail) =>
                detail.path.length > path.length &&
                path.every((label, index) => detail.path[index] === label),
            ),
          ),
          offset: median(present.map((value) => value.firstOffset)),
          path,
          self: median(values.map((value) => value?.selfMilliseconds ?? 0)),
        };
      })
      .toSorted((left, right) => left.offset - right.offset);
  for (const row of rows) {
    const minimum = Math.min(...row.counts),
      maximum = Math.max(...row.counts),
      count =
        minimum === maximum ? maximum.toString() : `${minimum.toString()}–${maximum.toString()}`;
    console.log(
      `${"  ".repeat(row.path.length)}${row.path.at(-1)}：${row.duration.toFixed(2)} ms（${count} 次/样本${row.hasChildren ? `；扣除子项 ${row.self.toFixed(2)} ms` : ""}）`,
    );
    printDetails(phases, row.path);
  }
}
