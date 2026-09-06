import { expect, spyOn, test } from "bun:test";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "../app/support/apiController";
import { createSession } from "../../src/app/frontend/services/client";
import { readHookOptions } from "../../src/app/frontend/components/NewSession/options/selection";

test("the Hook catalog API passes profile selection and frontend validation", async () => {
  const profiles: (string | undefined)[] = [],
    api = createApi(
      createApiController({
        hookOptions: (profile) => {
          profiles.push(profile);
          return [{ description: "通知", enable: false, id: "notify" }];
        },
      }),
    ),
    fetch = interceptApi(api);
  try {
    expect(await readHookOptions("work")).toEqual({
      hooks: [{ description: "通知", enable: false, id: "notify" }],
    });
    await readHookOptions();
    expect(profiles).toEqual(["work", undefined]);
  } finally {
    fetch.mockRestore();
  }
});
test("frontend sends individual Hook choices through multipart session creation", async () => {
  const submissions: unknown[] = [],
    session = {
      createdAt: 1,
      error: null,
      id: "new-session",
      status: "idle" as const,
      title: "new-session",
      updatedAt: 1,
      workspace: "F:/workspace",
    },
    api = createApi(
      createApiController({
        createSession: (submission) => {
          submissions.push(submission);
          return Promise.resolve(session);
        },
      }),
    ),
    fetch = interceptApi(api),
    initial = { history: [], hookOverrides: { notify: false, review: true }, message: "hello" };
  try {
    expect(await createSession(session.workspace, "work", initial, [])).toEqual({ session });
    expect(submissions).toEqual([
      { ...initial, attachments: [], profile: "work", workspace: session.workspace },
    ]);
  } finally {
    fetch.mockRestore();
  }
});
function requestPath(input: Parameters<typeof globalThis.fetch>[0]) {
  return input instanceof Request ? input.url : input.toString();
}
function interceptApi(api: ReturnType<typeof createApi>) {
  const implementation: typeof fetch = Object.assign(
    (input: Parameters<typeof fetch>[0], init?: RequestInit) =>
      Promise.resolve(api.request(`http://localhost/${requestPath(input)}`, init)),
    { preconnect: globalThis.fetch.preconnect },
  );
  return spyOn(globalThis, "fetch").mockImplementation(implementation);
}
test.each([
  '"invalid"',
  '{"notify":"false"}',
  '{"notify":0}',
  '{"notify":null}',
  '{"":true}',
  "[]",
  "{",
])("session creation rejects invalid Hook choices: %s", async (value) => {
  const body = new FormData();
  body.set("workspace", "F:/workspace");
  body.set("message", "hello");
  body.set("history", "[]");
  body.set("hookOverrides", value);
  const response = await createApi(createApiController()).request("/api/sessions", {
    body,
    method: "POST",
  });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
});
