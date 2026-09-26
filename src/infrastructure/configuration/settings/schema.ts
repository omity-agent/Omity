import { predictionSettingsSchema, prepareMainSettings } from "./models";
import { emptyAs } from "./values";
import ipaddr from "ipaddr.js";
import { logLevelSchema } from "../../../types";
import { z } from "zod";

export { omitCodexConnectionSettings, parseModelSettings } from "./models";
const promptFileSchema = z
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
  promptsSchema = z
    .array(promptFileSchema)
    .refine((files) => new Set(files).size === files.length, "提示词文件列表不能包含重复项"),
  agentSettingsSchema = z.strictObject({
    prompts: emptyAs(promptsSchema, []),
    recursionLimit: z.number().int().positive(),
    skills: z.strictObject({
      directory: z.string().min(1),
      enabled: z.boolean(),
      skillEnabled: emptyAs(z.record(z.string(), z.boolean()), {}),
    }),
    toolExecution: z.strictObject({
      parallel: z.boolean(),
    }),
    toolOutput: z.strictObject({
      maxTokens: z.number().int().positive(),
    }),
  }),
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
    .strictObject({
      challengeTtlMs: z.number().int().min(1000).max(86_400_000),
      loginRateLimit: z.strictObject({
        attempts: z.number().int().positive().max(1000),
        windowMs: z.number().int().min(1000).max(86_400_000),
      }),
      publicOrigin: emptyAs(publicOriginSchema, null),
      sessionTtlMs: z.number().int().min(60_000).max(2_592_000_000),
      trustedProxies: emptyAs(z.array(cidrSchema), []),
    })
    .refine(
      ({ publicOrigin, trustedProxies }) => publicOrigin === null || trustedProxies.length > 0,
      "配置公网 Origin 时必须配置 trustedProxies",
    ),
  mainSettingsSchema = z.strictObject({
    access: accessSchema,
    attachments: z.strictObject({
      allowedSuffixes: z
        .array(suffixSchema)
        .min(1)
        .refine(
          (suffixes) => new Set(suffixes).size === suffixes.length,
          "附件后缀白名单不能包含重复项",
        ),
      maxSizeBytes: z
        .number()
        .int()
        .positive()
        .max(Number.MAX_SAFE_INTEGER - 1024 * 1024),
    }),
    frontend: z.strictObject({
      cacheHitWarningRatio: z.number().min(0).max(1),
      draftSaveDelayMs: z.number().int().positive(),
      reasoningTranslation: z.strictObject({
        enabled: z.boolean(),
        highConfidenceThreshold: z.number().min(0).max(1),
        minimumIntervalMs: z.number().int().nonnegative(),
      }),
      transcriptSnapshotThrottleMs: z.number().int().positive(),
    }),
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
      level: logLevelSchema,
      streamTokens: z.boolean(),
    }),
    prediction: emptyAs(predictionSettingsSchema.optional(), undefined).optional(),
    server: z.strictObject({
      host: z.string().min(1),
      port: z.number().int().min(0).max(65_535),
    }),
  });
export function parseMainSettings(value: unknown) {
  return mainSettingsSchema.parse(prepareMainSettings(value));
}
export function parseAgentSettings(value: unknown) {
  return agentSettingsSchema.parse(value);
}
export { agentSettingsSchema, mainSettingsSchema };
