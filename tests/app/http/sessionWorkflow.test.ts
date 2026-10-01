import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "bun:test";
import { liveApplication } from "./liveApplication";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { submissionForm } from "../../../src/app/attachments/submission";
import { z } from "zod";

test("HTTP session creation runs a model then preserves draft revisions and attachments until deletion", async () => {
  await using app = await liveApplication();
  const created = await fetch(`${app.url}/api/sessions`, {
    body: submissionForm({ history: [], message: "first question", workspace: app.root }, []),
    method: "POST",
  });
  expect(created.status).toBe(200);
  const { session } = z
      .object({ session: z.object({ id: z.string() }) })
      .parse(await created.json()),
    endpoint = `${app.url}/api/sessions/${session.id}`,
    deadline = Date.now() + 5000;
  while (!app.controller.transcript(session.id).queue.every(({ status }) => status === "done")) {
    if (Date.now() >= deadline) {
      throw new Error("HTTP 会话未在期限内完成模型调用");
    }
    await app.controller.events.wait(session.id, 25);
  }
  expect(app.requests).toHaveLength(1);
  const transcript = await fetch(`${endpoint}/transcript`);
  expect(await transcript.json()).toMatchObject({
    messages: expect.arrayContaining([
      expect.objectContaining({ content: "workflow answer", role: "assistant" }),
    ]),
  });
  const control = await fetch(`${endpoint}/control`, json({ control: "pause" })),
    newerDraft = await fetch(
      `${endpoint}/composer-draft`,
      json({ content: "newer draft", revision: 4 }),
    ),
    staleDraft = await fetch(
      `${endpoint}/composer-draft`,
      json({ content: "stale beacon", revision: 3 }),
    ),
    currentDraft = await fetch(`${endpoint}/composer-draft`);
  expect(control.status).toBe(200);
  expect(newerDraft.status).toBe(200);
  expect(staleDraft.status).toBe(200);
  expect(await currentDraft.json()).toMatchObject({
    content: "newer draft",
    revision: 4,
  });
  const sent = await fetch(`${endpoint}/messages`, {
    body: submissionForm(
      { content: "read {{file:a1b2c3d4:notes.txt}}", draftRevision: 3, submissionId: "s1b2c3d4" },
      [{ file: new File(["attachment content"], "notes.txt"), id: "a1b2c3d4" }],
    ),
    method: "POST",
  });
  expect(sent.status).toBe(200);
  const accepted = z.object({ content: z.string(), inputId: z.number() }).parse(await sent.json()),
    path = accepted.content.slice("read ".length);
  expect(readFileSync(path, "utf8")).toBe("attachment content");
  const draftAfterMessage = await fetch(`${endpoint}/composer-draft`),
    transcriptAfterMessage = await fetch(`${endpoint}/transcript`);
  expect(await draftAfterMessage.json()).toMatchObject({
    content: "newer draft",
  });
  expect(await transcriptAfterMessage.json()).toMatchObject({
    control: "pause",
    queue: expect.arrayContaining([
      expect.objectContaining({
        content: accepted.content,
        id: accepted.inputId,
        status: "paused",
      }),
    ]),
  });
  const invalid = await fetch(`${endpoint}/messages`, {
    body: submissionForm(
      { content: "read {{file:e5f6g7h8:missing.txt}}", draftRevision: 4, submissionId: "t1b2c3d4" },
      [],
    ),
    method: "POST",
  });
  expect(invalid.status).toBe(400);
  expect(app.requests).toHaveLength(1);
  const paths = sessionPaths(session.id),
    deleted = await fetch(endpoint, { method: "DELETE" }),
    deletedTranscript = await fetch(`${endpoint}/transcript`),
    sessions = await fetch(`${app.url}/api/sessions`);
  expect(deleted.status).toBe(200);
  expect(existsSync(paths.dir)).toBe(false);
  expect(deletedTranscript.status).toBe(404);
  expect(await sessions.json()).toEqual({ sessions: [] });
}, 15_000);
function json(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  };
}
