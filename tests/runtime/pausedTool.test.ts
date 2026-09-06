import { afterEach, expect, test } from "bun:test";
import { agentFixture, toolResponse } from "./support/agentFixture";
import { cleanupDatabaseDirs, required, workspace } from "../support/database";
import { MockLanguageModelV4 } from "ai/test";
import { ToolMessage } from "@langchain/core/messages";
import { buildTimeline } from "../../src/app/timeline";
import { loadTranscript } from "../../src/app/transcript";
import { processQueue } from "../../src/runtime/queue";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

afterEach(cleanupDatabaseDirs);
test("paused cancellation is visible immediately and survives host reconstruction", async () => {
  let called = 0;
  const echo = tool(
      () => {
        called += 1;
        return "must not execute";
      },
      {
        description: "echo",
        name: "echo",
        schema: z.object({}),
      },
    ),
    first = agentFixture({
      model: new MockLanguageModelV4({ doStream: toolResponse() }),
      tools: [echo],
    }),
    { db } = first,
    stopping = new AbortController();
  try {
    db.resetSession("target", workspace);
    db.appendUser("target", "run");
    db.setControl("target", "step");
    first.context.stopping = stopping.signal;
    first.context.observer = {
      changed: () => {
        if (db.control("target") === "pause") {
          stopping.abort();
        }
      },
      token: () => undefined,
    };
    await processQueue(first.context, required(db.nextQueue("target")));
    expect(called).toBe(0);
    expect(db.nextQueue("target")?.status).toBe("paused");
    db.requestToolCancellation("target", "echo-call");
    const snapshot = loadTranscript(db, "target"),
      parts = buildTimeline(snapshot.messages, snapshot.queue, snapshot.events).flatMap(
        (message) => message.parts,
      );
    expect(parts.find((part) => part.type === "tool")).toMatchObject({
      output: { content: "工具运行 0 毫秒 后被用户手动终止。" },
      phase: "completed",
    });
    first.executions.close();
    const resumed = agentFixture({ db, tools: [echo] });
    db.setControl("target", "running");
    await processQueue(resumed.context, required(db.nextQueue("target")));
    expect(called).toBe(0);
    expect(db.nextQueue("target")).toBeNull();
    expect(db.history("target").find((message) => ToolMessage.isInstance(message))?.text).toBe(
      "工具运行 0 毫秒 后被用户手动终止。",
    );
    expect(resumed.model.doStreamCalls).toHaveLength(1);
    resumed.executions.close();
  } finally {
    first.executions.close();
    db.close();
  }
});
