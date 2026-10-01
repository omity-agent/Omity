import { expect, test } from "bun:test";
import { AppController } from "../../../src/app/controller";
import { createApi } from "../../../src/app/http/handler";
import { liveApplication } from "./liveApplication";
import { submissionForm } from "../../../src/app/attachments/submission";

const preparation = {
  message: "latest question",
  pairs: [
    { assistant: "first answer", id: "a1b2c3d4", user: "first question" },
    { assistant: "", id: "e5f6g7h8", user: "unfinished question" },
  ],
};
test("new session drafts retain incomplete message pairs across controller reopening and reject stale saves", async () => {
  await using app = await liveApplication();
  const endpoint = `${app.url}/api/session-preparation`,
    initial = await fetch(endpoint);
  expect(initial.status).toBe(200);
  expect(await initial.json()).toEqual({ content: null, revision: 0 });
  const saved = await fetch(endpoint, draft(preparation, 4)),
    stale = await fetch(endpoint, draft({ message: "stale", pairs: [] }, 3));
  expect(saved.status).toBe(200);
  expect(stale.status).toBe(200);
  expect(await stale.json()).toEqual({ revision: 4 });
  const reopened = new AppController(app.root);
  try {
    const restored = await createApi(reopened).request("/api/session-preparation");
    expect(await restored.json()).toEqual({
      content: JSON.stringify(preparation),
      revision: 4,
    });
  } finally {
    await reopened.close();
  }
  const edited = {
      message: "edited latest question",
      pairs: [{ ...preparation.pairs[0]!, assistant: "edited answer" }],
    },
    editedResponse = await fetch(endpoint, draft(edited, 5)),
    restoredEdits = await fetch(endpoint);
  expect(editedResponse.status).toBe(200);
  expect(await restoredEdits.json()).toEqual({
    content: JSON.stringify(edited),
    revision: 5,
  });
  const malformed = await fetch(endpoint, {
      body: JSON.stringify({ content: "not JSON", revision: 6 }),
      headers: { "content-type": "application/json" },
      method: "PUT",
    }),
    duplicated = await fetch(
      endpoint,
      draft({ message: "", pairs: [preparation.pairs[0], preparation.pairs[0]] }, 6),
    );
  expect(malformed.status).toBe(400);
  expect(duplicated.status).toBe(400);
  const unchanged = await fetch(endpoint);
  expect(await unchanged.json()).toMatchObject({ revision: 5 });
});
test("session creation clears only its submitted preparation and keeps drafts on failed creation", async () => {
  await using app = await liveApplication();
  const endpoint = `${app.url}/api/session-preparation`,
    ready = { message: preparation.message, pairs: [preparation.pairs[0]!] },
    saved = await fetch(endpoint, draft(ready, 1));
  expect(saved.status).toBe(200);
  const failed = await fetch(`${app.url}/api/sessions`, {
    body: submissionForm({ draftRevision: 1, history: [], message: "", workspace: app.root }, []),
    method: "POST",
  });
  expect(failed.status).toBe(400);
  const afterFailure = await fetch(endpoint);
  expect(await afterFailure.json()).toEqual({
    content: JSON.stringify(ready),
    revision: 1,
  });
  const created = await fetch(`${app.url}/api/sessions`, {
    body: submissionForm(
      {
        draftRevision: 1,
        history: ready.pairs.map(({ assistant, user }) => ({ assistant, user })),
        message: ready.message,
        workspace: app.root,
      },
      [],
    ),
    method: "POST",
  });
  expect(created.status).toBe(200);
  const lateBeacon = await fetch(endpoint, draft(ready, 1)),
    afterCreation = await fetch(endpoint);
  expect(lateBeacon.status).toBe(200);
  expect(await afterCreation.json()).toEqual({
    content: JSON.stringify({ message: "", pairs: [] }),
    revision: 1,
  });
  const newer = { message: "another tab's draft", pairs: [] },
    savedNewer = await fetch(endpoint, draft(newer, 2)),
    olderCreation = await fetch(`${app.url}/api/sessions`, {
      body: submissionForm(
        { draftRevision: 1, history: [], message: ready.message, workspace: app.root },
        [],
      ),
      method: "POST",
    }),
    afterOlderCreation = await fetch(endpoint);
  expect(savedNewer.status).toBe(200);
  expect(olderCreation.status).toBe(200);
  expect(await afterOlderCreation.json()).toEqual({
    content: JSON.stringify(newer),
    revision: 2,
  });
}, 15_000);
function draft(content: unknown, revision: number): RequestInit {
  return {
    body: JSON.stringify({ content: JSON.stringify(content), revision }),
    headers: { "content-type": "application/json" },
    method: "POST",
  };
}
