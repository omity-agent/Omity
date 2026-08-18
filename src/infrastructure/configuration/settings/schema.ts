import ipaddr from "ipaddr.js";
import { z } from "zod";

const reasoningEffortSchema = z.enum(["none", "minimal", "low", "medium", "high", "xhigh", "max"]),
  promptFileSchema = z
    .string()
    .trim()
    .min(1)
    .max(255)
    .refine(
      (value) =>
        value !== "." &&
        value !== ".." &&
        !value.includes("/") &&
        !value.includes("\\") &&
        !/[:*?"<>|\p{Cc}]/u.test(value),
      "提示词必须是 prompts 目录中的文件名",
    ),
  promptsSchema = z.array(promptFileSchema).superRefine((files, context) => {
    if (new Set(files).size !== files.length) {
      context.addIssue({
        code: "custom",
        message: "提示词文件列表不能包含重复项",
      });
    }
  }),
  sharedModelSettings = {
    model: z.string().min(1),
    reasoning_effort: reasoningEffortSchema.optional(),
    retryDelayMs: z.number().int().positive(),
    temperature: z.number().optional(),
    timeoutMs: z.number().int().positive(),
  },
  modelSettingsSchema = z.discriminatedUnion("adapter", [
    z
      .object({
        adapter: z.enum(["responses", "completions"]),
        apiKeyEnv: z.string().min(1),
        baseURL: z.url().nullable(),
        ...sharedModelSettings,
      })
      .strict(),
    z
      .object({
        adapter: z.literal("codex"),
        ...sharedModelSettings,
      })
      .strict(),
  ]),
  agentSettingsSchema = z
    .object({
      prompts: promptsSchema,
      recursionLimit: z.number().int().positive(),
      skills: z
        .object({
          directory: z.string().min(1),
          enabled: z.boolean(),
          skillEnabled: z.record(z.string(), z.boolean()),
        })
        .strict(),
      toolExecution: z
        .object({
          parallel: z.boolean(),
        })
        .strict(),
      toolOutput: z
        .object({
          maxTokens: z.number().int().positive(),
        })
        .strict(),
    })
    .strict(),
  suffixSchema = z
    .string()
    .trim()
    .toLowerCase()
    .min(2)
    .max(32)
    .regex(/^\.[a-z0-9][a-z0-9_+-]*$/u),
  publicOriginSchema = z
    .url()
    .refine((value) => {
      const url = new URL(value);
      return url.protocol === "https:" && url.origin === value;
    }, "公网 Origin 必须是无路径、查询参数和片段的 HTTPS Origin")
    .nullable(),
  cidrSchema = z
    .string()
    .refine((value) => ipaddr.isValidCIDR(value), "可信代理必须使用有效的 CIDR"),
  accessSchema = z
    .object({
      challengeTtlMs: z.number().int().min(1000).max(86_400_000),
      loginRateLimit: z
        .object({
          attempts: z.number().int().positive().max(1000),
          windowMs: z.number().int().min(1000).max(86_400_000),
        })
        .strict(),
      publicOrigin: publicOriginSchema,
      sessionTtlMs: z.number().int().min(60_000).max(2_592_000_000),
      trustedProxies: z.array(cidrSchema),
    })
    .strict()
    .refine(
      ({ publicOrigin, trustedProxies }) => publicOrigin === null || trustedProxies.length > 0,
      "配置公网 Origin 时必须配置 trustedProxies",
    ),
  mainSettingsSchema = z
    .object({
      access: accessSchema,
      attachments: z
        .object({
          allowedSuffixes: z
            .array(suffixSchema)
            .min(1)
            .superRefine((suffixes, context) => {
              if (new Set(suffixes).size !== suffixes.length) {
                context.addIssue({
                  code: "custom",
                  message: "附件后缀白名单不能包含重复项",
                });
              }
            }),
          maxSizeBytes: z
            .number()
            .int()
            .positive()
            .max(Number.MAX_SAFE_INTEGER - 1024 * 1024),
        })
        .strict(),
      frontend: z
        .object({
          draftSaveDelayMs: z.number().int().positive(),
          reasoningTranslation: z
            .object({
              enabled: z.boolean(),
              minimumIntervalMs: z.number().int().nonnegative(),
            })
            .strict(),
          transcriptSnapshotThrottleMs: z.number().int().positive(),
        })
        .strict(),
      host: z.object({
        idleLogMs: z.number().int().positive(),
        pausePollMs: z.number().int().positive(),
        pollMs: z.number().int().positive(),
        shutdownTimeoutMs: z.number().int().positive(),
      }),
      leases: z.object({
        hostTtlMs: z.number().int().positive(),
      }),
      logging: z.object({
        level: z.enum(["debug", "info", "warn", "error"]),
        streamTokens: z.boolean(),
      }),
      server: z
        .object({
          host: z.string().min(1),
          port: z.number().int().min(0).max(65_535),
        })
        .strict(),
    })
    .strict();
export function parseMainSettings(value: unknown) {
  return mainSettingsSchema.parse(value);
}
export function parseModelSettings(value: unknown) {
  return modelSettingsSchema.parse(value);
}
export function parseAgentSettings(value: unknown) {
  return agentSettingsSchema.parse(value);
}
