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
  forkMaterializationBody,
  jsonBody,
  limitRequestBody,
  preparationDraftBody,
  reasoningTranslationBody,
} from "./request";
import { readMessageForm, readSessionForm } from "./multipart";
import type { AccessService } from "../access/service";
import type { AppController } from "../controller";
import { compress } from "hono/compress";
import { requestBodyLimit } from "../../../settings/networking";
import { validator } from "hono/validator";
import { writeReasoningTranslation } from "../reasoningTranslation";

type ApiController = Pick<
  AppController,
  | "bootstrap"
  | "hookOptions"
  | "activateFileLink"
  | "sessions"
  | "userMessages"
  | "predictions"
  | "pickWorkspace"
  | "createSession"
  | "deleteSession"
  | "clearTemporaryFiles"
  | "transcript"
  | "eventCursor"
  | "composerDraft"
  | "saveComposerDraft"
  | "preparationDraft"
  | "savePreparationDraft"
  | "sendMessage"
  | "control"
  | "cancelTool"
  | "answerTool"
  | "materializeFork"
  | "assertSession"
  | "events"
>;
export function createApi(controller: ApiController, access?: AccessService) {
  const app = new Hono<AccessEnvironment>(),
    attachmentBodyLimit = requestBodyLimit + controller.bootstrap().attachments.maxSizeBytes,
    attachmentRequestLimit = limitRequestBody(attachmentBodyLimit, "附件请求体"),
    routes = mountAccess(app, access);
  app.use("/api/sessions/:sessionId/messages", attachmentRequestLimit);
  app.use("/api/sessions/:sessionId/transcript", compress());
  app.notFound((c) => {
    throw new HttpError(404, `未知 API：${c.req.path}`);
  });
  app.onError(handleApiError);
  return routes
    .get("/api/bootstrap", (c) => c.json(controller.bootstrap()))
    .get("/api/user-messages", (c) => c.json(controller.userMessages()))
    .get("/api/session-preparation", (c) => c.json(controller.preparationDraft()))
    .on(["PUT", "POST"], "/api/session-preparation", jsonBody(preparationDraftBody), (c) => {
      const body = c.req.valid("json");
      return c.json(controller.savePreparationDraft(body.content, body.revision));
    })
    .get(
      "/api/hooks",
      validator("query", (_query: { profile?: string }, c) => ({
        profile: c.req.query("profile"),
      })),
      (c) => c.json({ hooks: controller.hookOptions(c.req.valid("query").profile) }),
    )
    .get("/api/sessions", (c) => c.json({ sessions: controller.sessions() }))
    .get("/api/events/state", (c) => controller.events.streamState(c, () => controller.sessions()))
    .post("/api/workspace-picker", async (c) =>
      c.json({ workspace: await controller.pickWorkspace() }),
    )
    .post("/api/sessions", attachmentRequestLimit, async (c) =>
      c.json({
        session: await controller.createSession(await readSessionForm(c.req)),
      }),
    )
    .delete("/api/sessions/:sessionId", async (c) => {
      const deletedSessionId = decodeSessionId(c.req.param("sessionId"));
      return c.json(await controller.deleteSession(deletedSessionId));
    })
    .delete("/api/sessions/:sessionId/temporary-files", async (c) =>
      c.json(await controller.clearTemporaryFiles(sessionId(c))),
    )
    .get("/api/sessions/:sessionId/transcript", (c) => c.json(controller.transcript(sessionId(c))))
    .get("/api/sessions/:sessionId/predictions", async (c) =>
      c.json(await controller.predictions(sessionId(c))),
    )
    .post(
      "/api/sessions/:sessionId/file-links/activate",
      jsonBody(fileLinkActionBody),
      async (c) => {
        const body = c.req.valid("json");
        return c.json(await controller.activateFileLink(sessionId(c), body.path, body.action));
      },
    )
    .get("/api/sessions/:sessionId/events/content", (c) => {
      const id = sessionId(c);
      controller.assertSession(id);
      return controller.events.streamContent(c, id, () => controller.eventCursor(id));
    })
    .get("/api/sessions/:sessionId/composer-draft", (c) =>
      c.json(controller.composerDraft(sessionId(c))),
    )
    .on(
      ["PUT", "POST"],
      "/api/sessions/:sessionId/composer-draft",
      jsonBody(composerDraftBody),
      (c) => {
        const body = c.req.valid("json");
        return c.json(controller.saveComposerDraft(sessionId(c), body.content, body.revision));
      },
    )
    .put(
      "/api/sessions/:sessionId/reasoning-translation",
      jsonBody(reasoningTranslationBody),
      (c) => {
        const body = c.req.valid("json"),
          id = sessionId(c);
        controller.assertSession(id);
        const result = writeReasoningTranslation(id, body);
        controller.events.invalidateTranscript(id, controller.eventCursor(id));
        return c.json(result);
      },
    )
    .post("/api/sessions/:sessionId/messages", async (c) => {
      const submission = await readMessageForm(c.req);
      return c.json(await controller.sendMessage(sessionId(c), submission));
    })
    .post("/api/sessions/:sessionId/control", jsonBody(controlBody), async (c) => {
      const body = c.req.valid("json");
      return c.json(await controller.control(sessionId(c), body.control));
    })
    .post("/api/sessions/:sessionId/tools/cancel", jsonBody(cancelToolBody), (c) => {
      const body = c.req.valid("json");
      return c.json(controller.cancelTool(sessionId(c), body.toolCallId));
    })
    .post("/api/sessions/:sessionId/tools/answer", jsonBody(answerToolBody), (c) => {
      const body = c.req.valid("json");
      return c.json(controller.answerTool(sessionId(c), body.toolCallId, body.answer));
    })
    .post(
      "/api/sessions/:sessionId/fork/materialize",
      jsonBody(forkMaterializationBody),
      async (c) => {
        const body = c.req.valid("json");
        return c.json({
          session: await controller.materializeFork(sessionId(c), body.beforeMessageId),
        });
      },
    );
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
