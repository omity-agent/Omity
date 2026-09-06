import { expect, test } from "bun:test";
import { createApi } from "../../src/app/http/handler";
import { createApiController } from "./support/apiController";
import { submissionForm } from "../../src/app/attachments/submission";

const message = { content: "message", draftRevision: 0, submissionId: "a1b2c3d4" };
test.each([
  ["missing", undefined],
  ["empty", ""],
  ["malformed", "{"],
  ["null", "null"],
  ["array", "[]"],
  ["string revision", JSON.stringify({ ...message, draftRevision: "0" })],
  ["negative revision", JSON.stringify({ ...message, draftRevision: -1 })],
  ["unsafe revision", JSON.stringify({ ...message, draftRevision: Number.MAX_SAFE_INTEGER + 1 })],
  ["fractional revision", JSON.stringify({ ...message, draftRevision: 0.5 })],
  ["unknown metadata", JSON.stringify({ ...message, extra: true })],
])("rejects %s submission metadata before invoking the controller", async (_label, submission) => {
  const body = new FormData();
  if (submission !== undefined) {
    body.set("submission", submission);
  }
  await expectInvalid(body);
});
test("rejects duplicate metadata, duplicate files and unknown multipart fields", async () => {
  const duplicateMetadata = submissionForm(message, []);
  duplicateMetadata.append("submission", JSON.stringify(message));
  await expectInvalid(duplicateMetadata);
  const duplicateFiles = submissionForm(message, [
    { file: new File(["one"], "one.txt"), id: "a1b2c3d4" },
    { file: new File(["two"], "two.txt"), id: "a1b2c3d4" },
  ]);
  await expectInvalid(duplicateFiles);
  for (const key of ["extra", "__proto__", "constructor", "submission.content", "file:invalid"]) {
    const body = submissionForm(message, []);
    body.set(key, "value");
    await expectInvalid(body);
  }
});
test("rejects text disguised as an attachment and file-valued metadata", async () => {
  const textAttachment = submissionForm(message, []);
  textAttachment.set("file:a1b2c3d4", "not a file");
  await expectInvalid(textAttachment);
  const metadataFile = new FormData();
  metadataFile.set("submission", new File([JSON.stringify(message)], "metadata.json"));
  await expectInvalid(metadataFile);
});
test("preserves empty attachments, metadata whitespace and file identity", async () => {
  const controller = createApiController({
      sendMessage: async (_id, submission) => {
        expect(submission.content).toBe("  message\n");
        expect(submission.attachments).toHaveLength(2);
        expect(submission.attachments[0]).toMatchObject({
          file: { name: "empty.txt", size: 0 },
          id: "a1b2c3d4",
        });
        expect(await submission.attachments[1]!.file.text()).toBe("文件内容");
        return { content: submission.content, queueId: 1 };
      },
    }),
    body = submissionForm({ ...message, content: "  message\n" }, [
      { file: new File([], "empty.txt"), id: "a1b2c3d4" },
      { file: new File(["文件内容"], "笔记.txt"), id: "e5f6g7h8" },
    ]),
    response = await createApi(controller).request("/api/sessions/test/messages", {
      body,
      method: "POST",
    });
  expect(response.status).toBe(200);
});
test("session metadata retains hook switches and validates profile paths", async () => {
  const state = {
      history: [{ assistant: "answer", user: "question" }],
      hookOverrides: { hook: false },
      message: "next",
      profile: "work",
      workspace: " F:/workspace ",
    },
    controller = createApiController({
      createSession: (submission) => {
        expect(submission).toEqual({ ...state, attachments: [], workspace: "F:/workspace" });
        return Promise.resolve({
          createdAt: 1,
          error: null,
          id: "test",
          status: "idle",
          title: "test",
          updatedAt: 1,
          workspace: "F:/workspace",
        });
      },
    }),
    api = createApi(controller),
    response = await api.request("/api/sessions", {
      body: submissionForm(state, []),
      method: "POST",
    }),
    invalid = await api.request("/api/sessions", {
      body: submissionForm({ ...state, profile: "../outside" }, []),
      method: "POST",
    });
  expect(response.status).toBe(200);
  expect(invalid.status).toBe(400);
});
async function expectInvalid(body: FormData) {
  const api = createApi(
      createApiController({
        sendMessage: () => {
          throw new Error("invalid submission reached controller");
        },
      }),
    ),
    response = await api.request("/api/sessions/test/messages", { body, method: "POST" });
  expect(response.status).toBe(400);
  expect(await response.json()).toMatchObject({ error: { code: "BAD_REQUEST" } });
}
