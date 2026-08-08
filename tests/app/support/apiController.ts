import type { ApiController } from "../../../src/app/http/handler";
import { AppEvents } from "../../../src/app/events";

export function createApiController(overrides: Partial<ApiController> = {}): ApiController {
  const controller: ApiController = {
    activateFileLink: notConfigured,
    assertSession: () => undefined,
    bootstrap: () => ({
      attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
      cwd: "F:/workspace",
      frontend: { draftSaveDelayMs: 0, transcriptRefreshIntervalMs: 0 },
      profiles: { available: [] },
      sessions: [],
    }),
    cancelTool: notConfigured,
    composerDraft: notConfigured,
    control: notConfigured,
    createSession: notConfigured,
    deleteSession: notConfigured,
    eventCursor: () => 0,
    events: new AppEvents(),
    forkSession: notConfigured,
    pickWorkspace: notConfigured,
    saveComposerDraft: notConfigured,
    sendMessage: notConfigured,
    sessions: () => [],
    transcript: () => ({
      control: "running",
      eventCursor: 0,
      events: [],
      fileLinks: [],
      messages: [],
      queue: [],
      transcriptRevision: 0,
    }),
  };
  return { ...controller, ...overrides };
}
function notConfigured(): never {
  throw new Error("测试未配置此控制器方法");
}
