import { isPlainObject as isRecord, omit } from "es-toolkit";
import { z } from "zod";

import { modelAdapterSchema, reasoningEffortSchema } from "../../../types";
import { emptyAs } from "./fieldSchemas";

const sharedModelSettings = {
    maxConcurrentRequests: z.number().int().positive(),
    model: z.string().min(1),
    raceIntervalMs: z.number().int().positive(),
    reasoning_effort: emptyAs(reasoningEffortSchema.optional(), undefined).optional(),
    retryDelayMs: z.number().int().positive(),
    temperature: emptyAs(z.number().optional(), undefined).optional(),
  },
  modelSettingsSchema = z.discriminatedUnion("adapter", [
    z.strictObject({
      adapter: modelAdapterSchema,
      apiKeyEnv: z.string().min(1),
      baseURL: emptyAs(z.url().nullable(), null),
      ...sharedModelSettings,
    }),
    z.strictObject({
      adapter: z.literal("codex"),
      ...sharedModelSettings,
    }),
  ]),
  predictionFields = {
    maxUserMessageTokens: z.number().int().positive(),
    outputCount: z.number().int().positive(),
    refreshIntervalHours: z.number().positive(),
    sampleContextTokens: z.number().int().positive(),
    sampleCount: z.number().int().positive(),
    task: z.string().min(1),
  },
  modelOverridesSchema = z.preprocess(
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
      .extend({ adapter: z.union([modelAdapterSchema, z.literal("codex")]) })
      .partial(),
  );
export function createPredictionSettingsSchema(primaryModel: z.output<typeof modelSettingsSchema>) {
  return z.discriminatedUnion("enabled", [
    z.strictObject({
      ...predictionFields,
      enabled: z.literal(true),
      model: z.preprocess(
        (value) => inheritModelSettings(value, primaryModel),
        modelSettingsSchema,
      ),
    }),
    z.strictObject({
      ...predictionFields,
      enabled: z.literal(false),
      model: emptyAs(modelOverridesSchema.optional(), undefined).optional(),
    }),
  ]);
}
export function parseModelSettings(value: unknown) {
  return modelSettingsSchema.parse(omitCodexConnectionSettings(value));
}
function inheritModelSettings(value: unknown, primaryModel: z.output<typeof modelSettingsSchema>) {
  if (value === undefined || value === null || value === "") {
    return primaryModel;
  }
  if (!isRecord(value)) {
    return value;
  }
  return omitCodexConnectionSettings({
    ...primaryModel,
    ...Object.fromEntries(
      Object.entries(value).map(([key, item]) => [
        key,
        item === undefined || item === null || item === "" ? Reflect.get(primaryModel, key) : item,
      ]),
    ),
  });
}
export function omitCodexConnectionSettings(value: unknown, inheritedAdapter?: string) {
  if (!isRecord(value)) {
    return value;
  }
  const { adapter } = value;
  return (adapter === undefined || adapter === null || adapter === ""
    ? inheritedAdapter
    : adapter) === "codex"
    ? omit(value, ["apiKeyEnv", "baseURL"])
    : value;
}
export function prepareMainSettings(
  value: unknown,
  primaryModel: z.output<typeof modelSettingsSchema>,
) {
  if (!isRecord(value) || !isRecord(value["prediction"])) {
    return value;
  }
  const { prediction } = value;
  return {
    ...value,
    prediction: {
      ...prediction,
      ...(Object.hasOwn(prediction, "model")
        ? { model: omitCodexConnectionSettings(prediction["model"], primaryModel.adapter) }
        : {}),
    },
  };
}
