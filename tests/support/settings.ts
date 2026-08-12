import type { Settings } from "../../src/types";

export function testSettings(): Settings {
  return {
    access: {
      challengeTtlMs: 300_000,
      loginRateLimit: { attempts: 10, windowMs: 60_000 },
      publicOrigin: "https://omity.example.test",
      sessionTtlMs: 43_200_000,
      trustedProxies: ["127.0.0.1/32"],
    },
    agent: { recursionLimit: 50, systemPrompt: "test" },
    attachments: {
      allowedSuffixes: [".txt", ".md"],
      maxSizeBytes: 1024,
    },
    frontend: {
      draftSaveDelayMs: 1,
      reasoningTranslation: { enabled: false, minimumIntervalMs: 1000 },
      transcriptRefreshIntervalMs: 1,
    },
    hooks: [],
    host: {
      idleLogMs: 1,
      pausePollMs: 1,
      pollMs: 1,
      shutdownTimeoutMs: 1000,
    },
    leases: { hostTtlMs: 30_000 },
    logging: { level: "error", streamTokens: false },
    model: {
      adapter: "completions",
      apiKeyEnv: "TEST_KEY",
      baseURL: null,
      model: "test",
      retryDelayMs: 1000,
      temperature: 0,
      timeoutMs: 1000,
    },
    server: { host: "127.0.0.1", port: 3030 },
    skills: {
      directory: "~/.agents/skills",
      enabled: false,
      skillEnabled: {},
    },
    toolExecution: { parallel: true },
    toolOutput: { maxTokens: 8192 },
  };
}
