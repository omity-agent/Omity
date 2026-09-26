import { isPlainObject as isRecord, omit } from "es-toolkit";
import { modelApiSchema, reasoningEffortSchema } from "../../../types";
import { emptyAs } from "./values";
import { z } from "zod";

const sharedModelSettings = {
  maxConcurrentRequests: z.number().int().positive(),
  model: z.string().min(1),
  raceIntervalMs: z.number().int().positive(),
  reasoning_effort: emptyAs(reasoningEffortSchema.optional(), undefined).optional(),
  retryDelayMs: z.number().int().positive(),
  temperature: emptyAs(z.number().optional(), undefined).optional(),
};
export const modelSettingsSchema = z.discriminatedUnion("adapter", [
  z.strictObject({
    adapter: modelApiSchema,
    apiKeyEnv: z.string().min(1),
    baseURL: emptyAs(z.url().nullable(), null),
    ...sharedModelSettings,
  }),
  z.strictObject({
    adapter: z.literal("codex"),
    ...sharedModelSettings,
  }),
]);
const predictionFields = {
    maxUserMessageTokens: z.number().int().positive(),
    outputCount: z.number().int().positive(),
    refreshIntervalHours: z.number().positive(),
    sampleContextTokens: z.number().int().positive(),
    sampleCount: z.number().int().positive(),
    task: z.string().min(1),
  },
  modelDraftSchema = z.preprocess(
    (value) =>
      isRecord(value)
        ? Object.fromEntries(
            Object.entries(value).map(([key, item]) => [
              key,
              item === null || item === "" ? undefined : item,
            ]),
          )
        : value,
    modelSettingsSchema.options[0]
      .extend({ adapter: z.union([modelApiSchema, z.literal("codex")]) })
      .partial(),
  );
export const predictionSettingsSchema = z.discriminatedUnion("enabled", [
  z.strictObject({
    ...predictionFields,
    enabled: z.literal(true),
    model: modelSettingsSchema,
  }),
  z.strictObject({
    ...predictionFields,
    enabled: z.literal(false),
    model: emptyAs(modelDraftSchema.optional(), undefined).optional(),
  }),
]);
export function parseModelSettings(value: unknown) {
  return modelSettingsSchema.parse(omitCodexConnectionSettings(value));
}
export function omitCodexConnectionSettings(value: unknown) {
  return isRecord(value) && value["adapter"] === "codex"
    ? omit(value, ["apiKeyEnv", "baseURL"])
    : value;
}
export function prepareMainSettings(value: unknown) {
  if (!isRecord(value) || !isRecord(value["prediction"])) {
    return value;
  }
  const { prediction } = value;
  return {
    ...value,
    prediction: {
      ...prediction,
      ...(Object.hasOwn(prediction, "model")
        ? { model: omitCodexConnectionSettings(prediction["model"]) }
        : {}),
    },
  };
}
