import { AgentDatabase } from "../../src/infrastructure/database/agentDatabase";
import { AppController } from "../../src/app/controller";
import type { LatencyProfile } from "./typicalProfile";
import { RoundtripCapture } from "./timing/roundtripCapture";
import type { SettingsContext } from "../../src/infrastructure/configuration/settings/context";
import type { TypicalHistory } from "./historyFixture";
import assert from "node:assert/strict";
import { raceSignal } from "race-signal";
import { sessionPaths } from "../../src/infrastructure/configuration/sessionPaths";

export async function measureApplication(
  settingsContext: SettingsContext,
  profile: LatencyProfile,
  history: TypicalHistory,
  workspace: string,
) {
  const sessionId = "typical-latency",
    signal = AbortSignal.timeout(profile.timeoutMs),
    paths = sessionPaths(sessionId),
    db = new AgentDatabase(paths.dbPath),
    { model } = profile;
  try {
    db.createSession(
      sessionId,
      workspace,
      [],
      {
        prefix: {
          model: {
            adapter: model.adapter,
            baseURL: model.baseURL,
            model: model.model,
            reasoning_effort: model.reasoning_effort,
          },
          systemPrompt: history.systemPrompt,
          tools: { tools: history.tools },
        },
      },
      "pause",
    );
    await db.syncHistory(sessionId, history.messages);
    db.appendUser(sessionId, history.pendingUser);
  } finally {
    db.close();
  }
  const capture = new RoundtripCapture(model.model, history.estimatedTokens);
  let controller: AppController | undefined;
  try {
    controller = new AppController(settingsContext.root, { settingsContext });
    const completed = Promise.withResolvers<void>(),
      notify = controller.events.notifySession.bind(controller.events),
      completion = raceSignal(completed.promise, signal);
    controller.events.notifySession = (session) => {
      capture.observeStatus(session.status);
      notify(session);
      if (session.error) {
        completed.reject(new Error(`性能测试会话失败：${JSON.stringify(session.error)}`));
      } else if (capture.sent && session.status === "idle") {
        completed.resolve();
      }
    };
    await Promise.all([
      completion,
      controller.control(sessionId, "running").then(() => capture.start()),
    ]);
    const sample = capture.result(),
      transcript = controller.transcript(sessionId);
    assert(
      transcript.queue.every((item) => item.status === "done"),
      "测试队列未正常完成",
    );
    assert.equal(transcript.messages.at(-1)?.content, "done", "模拟模型未正常完成");
    return sample;
  } finally {
    try {
      await controller?.close();
    } finally {
      capture.restore();
    }
  }
}
