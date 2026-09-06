import type { ApiController } from "../../../src/app/http/handler";
import { AppEvents } from "../../../src/app/events";

export function createApiController(overrides: Partial<ApiController> = {}): ApiController {
  const controller: ApiController = {
    activateFileLink: notConfigured,
    answerTool: notConfigured,
    assertSession: () => undefined,
    bootstrap: () => ({
      attachments: { allowedSuffixes: [".txt"], maxSizeBytes: 1024 },
      cwd: "F:/workspace",
      frontend: {
        draftSaveDelayMs: 0,
        reasoningTranslation: {
          enabled: false,
          highConfidenceThreshold: 0.8,
          minimumIntervalMs: 0,
        },
        transcriptSnapshotThrottleMs: 0,
      },
      profiles: { available: [] },
      sessions: [],
    }),
    cancelTool: notConfigured,
    clearTemporaryFiles: notConfigured,
    composerDraft: notConfigured,
    control: notConfigured,
    createSession: notConfigured,
    deleteSession: notConfigured,
    eventCursor: () => 0,
    events: new AppEvents(),
    hookOptions: () => [],
    materializeFork: notConfigured,
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
      reasoningTranslations: [],
      transcriptRevision: 0,
    }),
  };
  return { ...controller, ...overrides };
}
function notConfigured(): never {
  throw new Error("测试未配置此控制器方法");
}
