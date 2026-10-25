import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";

import { z } from "zod";

import { requestBodyLimit } from "../../../settings/networking";
import { submissionForm } from "../../../src/app/attachments/submission";
import { sessionPaths } from "../../../src/infrastructure/configuration/sessionPaths";
import { liveApplication } from "./liveApplication";

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
test("HTTP validation rejects malformed or ambiguous submissions before session mutations", async () => {
  await using app = await liveApplication();
  const draftEndpoint = `${app.url}/api/sessions/absent/composer-draft`,
    invalidJsonRequests = [
      { body: "{", headers: { "content-type": "application/json" } },
      { body: "null", headers: { "content-type": "application/json" } },
      { body: '{"content":"draft","revision":0}', headers: { "content-type": "application/json" } },
      { body: '{"content":"draft","revision":1}', headers: { "content-type": "text/plain" } },
    ];
  for (const init of invalidJsonRequests) {
    const response = await fetch(draftEndpoint, { ...init, method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  }
  const oversized = await fetch(
    draftEndpoint,
    json({ content: "x".repeat(requestBodyLimit), revision: 1 }),
  );
  expect(oversized.status).toBe(413);
  const optionalBody = await fetch(`${app.url}/api/access/register/options`, {
    body: "{}",
    headers: { "content-type": "text/plain" },
    method: "POST",
  });
  expect(optionalBody.status).toBe(400);
  for (const query of ["profile=first&profile=second", "profile=..%2Foutside"]) {
    const response = await fetch(`${app.url}/api/session-options?${query}`);
    expect(response.status).toBe(400);
  }
  const submission = { history: [], message: "do not start", workspace: app.root },
    invalidForms = [
      new FormData(),
      submissionForm(submission, []),
      submissionForm(submission, []),
      submissionForm(submission, []),
      submissionForm(submission, []),
    ];
  invalidForms[1]!.set("submission", "{");
  invalidForms[2]!.append("submission", JSON.stringify(submission));
  invalidForms[3]!.append("file:invalid", new File(["data"], "notes.txt"));
  invalidForms[4]!.append("file:a1b2c3d4", new File(["first"], "notes.txt"));
  invalidForms[4]!.append("file:a1b2c3d4", new File(["second"], "notes.txt"));
  for (const body of invalidForms) {
    const response = await fetch(`${app.url}/api/sessions`, { body, method: "POST" });
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
  }
  expect(app.controller.sessions()).toEqual([]);
  expect(app.requests).toEqual([]);
});
function json(body: unknown): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
    method: "POST",
  };
}
