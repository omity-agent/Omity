import { type AccessEnvironment, mountAccess } from "./access";
import { type Context, Hono } from "hono";
import { HttpError, errorResponse } from "./errors";
import {
  answerToolBody,
  cancelToolBody,
  composerDraftBody,
  controlBody,
  decodeSessionId,
  fileLinkActionBody,
  forkBody,
  readJson,
  readMessageForm,
  readSessionForm,
  requestBodyLimit,
} from "./request";
import type { AccessService } from "../access/service";
import type { AppController } from "../controller";
import { bodyLimit } from "hono/body-limit";

export type ApiController = Pick<
  AppController,
  | "bootstrap"
  | "activateFileLink"
  | "sessions"
  | "pickWorkspace"
  | "createSession"
  | "deleteSession"
  | "transcript"
  | "eventCursor"
  | "composerDraft"
  | "saveComposerDraft"
  | "sendMessage"
  | "control"
  | "cancelTool"
  | "answerTool"
  | "forkSession"
  | "assertSession"
  | "events"
>;
export function createApi(controller: ApiController, access?: AccessService) {
  const app = new Hono<AccessEnvironment>(),
    attachmentBodyLimit = requestBodyLimit + controller.bootstrap().attachments.maxSizeBytes,
    attachmentRequestLimit = bodyLimit({
      maxSize: attachmentBodyLimit,
      onError() {
        throw new HttpError(413, `附件请求体不能超过 ${attachmentBodyLimit.toString()} 字节`);
      },
    }),
    regularBodyLimit = bodyLimit({
      maxSize: requestBodyLimit,
      onError() {
        throw new HttpError(413, `请求体不能超过 ${requestBodyLimit.toString()} 字节`);
      },
    });
  mountAccess(app, access, regularBodyLimit);
  app.use("/api/sessions/:sessionId/messages", attachmentRequestLimit);
  app.get("/api/bootstrap", (c) => c.json(controller.bootstrap()));
  app.get("/api/sessions", (c) => c.json({ sessions: controller.sessions() }));
  app.get("/api/events/state", (c) =>
    controller.events.streamState(c, () => controller.sessions()),
  );
  app.post("/api/workspace-picker", async (c) =>
    c.json({ workspace: await controller.pickWorkspace() }),
  );
  app.post("/api/sessions", attachmentRequestLimit, async (c) =>
    c.json({
      session: await controller.createSession(await readSessionForm(c.req)),
    }),
  );
  app.delete("/api/sessions/:sessionId", async (c) => {
    const deletedSessionId = decodeSessionId(c.req.param("sessionId"));
    return c.json(await controller.deleteSession(deletedSessionId));
  });
  app.get("/api/sessions/:sessionId/transcript", (c) =>
    c.json(controller.transcript(sessionId(c))),
  );
  app.post("/api/sessions/:sessionId/file-links/activate", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, fileLinkActionBody);
    return c.json(await controller.activateFileLink(sessionId(c), body.path, body.action));
  });
  app.get("/api/sessions/:sessionId/events/content", (c) => {
    const id = sessionId(c);
    controller.assertSession(id);
    return controller.events.streamContent(c, id, () => controller.eventCursor(id));
  });
  app.get("/api/sessions/:sessionId/composer-draft", (c) =>
    c.json(controller.composerDraft(sessionId(c))),
  );
  app.put("/api/sessions/:sessionId/composer-draft", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, composerDraftBody);
    return c.json(controller.saveComposerDraft(sessionId(c), body.content, body.revision));
  });
  app.post("/api/sessions/:sessionId/messages", async (c) => {
    const submission = await readMessageForm(c.req);
    return c.json(await controller.sendMessage(sessionId(c), submission));
  });
  app.post("/api/sessions/:sessionId/control", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, controlBody);
    return c.json(await controller.control(sessionId(c), body.control));
  });
  app.post("/api/sessions/:sessionId/tools/cancel", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, cancelToolBody);
    return c.json(controller.cancelTool(sessionId(c), body.toolCallId));
  });
  app.post("/api/sessions/:sessionId/tools/answer", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, answerToolBody);
    return c.json(controller.answerTool(sessionId(c), body.toolCallId, body.answer));
  });
  app.post("/api/sessions/:sessionId/fork", regularBodyLimit, async (c) => {
    const body = await readJson(c.req, forkBody);
    return c.json({
      session: await controller.forkSession(sessionId(c), body.beforeMessageId),
    });
  });
  app.notFound((c) => {
    throw new HttpError(404, `未知 API：${c.req.path}`);
  });
  app.onError(handleApiError);
  return app;
}
function handleApiError(error: Error, c: Context) {
  const normalized = errorResponse(error);
  return c.json(normalized.body, normalized.status);
}
function sessionId(c: Context) {
  const value = c.req.param("sessionId");
  if (value === undefined) {
    throw new HttpError(400, "请求缺少 Session ID");
  }
  return decodeSessionId(value);
}
