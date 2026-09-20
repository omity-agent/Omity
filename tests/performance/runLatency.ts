import { cpus, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { prepareBenchmarkSettings, readLatencyProfile } from "./typicalProfile";
import type { RoundtripSample } from "./timing/roundtripCapture";
import assert from "node:assert/strict";
import { createTypicalHistory } from "./historyFixture";
import { measureApplication } from "./timedApplication";
import { printLatencyReport } from "./timing/latencyReport";

const repository = resolve(import.meta.dir, "../.."),
  profile = await readLatencyProfile(repository),
  history = createTypicalHistory(profile.context),
  directory = await mkdtemp(join(tmpdir(), "omity-mcp-latency-")),
  previousHome = process.env["OMITY_HOME"],
  previousKey = process.env[profile.model.apiKeyEnv],
  samples: RoundtripSample[] = [];
assert.equal(history.estimatedTokens, profile.context.targetTokens);
try {
  const toolsPath = join(directory, "synthetic-tools.json");
  await writeFile(
    toolsPath,
    JSON.stringify(
      history.tools.map((tool) => ({
        description: tool.description,
        inputSchema: tool.inputSchema,
        name: tool.name.replace(/^bench__/u, ""),
      })),
    ),
  );
  const settings = await prepareBenchmarkSettings(
    directory,
    repository,
    profile,
    history.systemPrompt,
    toolsPath,
  );
  process.env[profile.model.apiKeyEnv] = "local-benchmark-placeholder";
  console.log(`工具调用性能测试：${process.platform} / Bun ${Bun.version} / ${cpus()[0]?.model}`);
  console.log(`上下文约 ${history.estimatedTokens.toLocaleString("zh-CN")} tokens`);
  console.log(
    `历史 ${history.messages.length} 条 + 本轮用户输入；${history.tools.length} 个工具定义；合成推理载荷 ${profile.context.encryptedReasoningCharacters} 字符`,
  );
  console.log(`预热 ${profile.warmup} 次，正式测量 ${profile.samples} 次。`);
  for (let index = 0; index < profile.warmup + profile.samples; index += 1) {
    const home = join(directory, `sample-${index.toString()}`);
    await mkdir(home);
    process.env["OMITY_HOME"] = home;
    try {
      const sample = await measureApplication(settings(home), profile, history, repository);
      if (index >= profile.warmup) {
        samples.push(sample);
      }
    } finally {
      await rm(home, { force: true, recursive: true });
    }
    if (index + 1 === profile.warmup || (samples.length > 0 && samples.length % 10 === 0)) {
      console.log(
        `进度：已预热 ${Math.min(index + 1, profile.warmup)} 次，正式样本 ${samples.length}/${profile.samples}`,
      );
    }
  }
  printLatencyReport(samples);
} finally {
  if (previousHome === undefined) {
    delete process.env["OMITY_HOME"];
  } else {
    process.env["OMITY_HOME"] = previousHome;
  }
  if (previousKey === undefined) {
    delete process.env[profile.model.apiKeyEnv];
  } else {
    process.env[profile.model.apiKeyEnv] = previousKey;
  }
  await rm(directory, { force: true, recursive: true });
}
