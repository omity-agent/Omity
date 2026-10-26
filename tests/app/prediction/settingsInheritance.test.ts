import { afterEach, expect, test } from "bun:test";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { parse, stringify } from "yaml";
import { z } from "zod";

import { loadSettings } from "../../../src/infrastructure/configuration/settings/load";
import { createTestDirectory } from "../../support/artifacts";
import { writeTestConfiguration } from "../../support/configuration";
import { testSettings } from "../../support/settings";

const roots: string[] = [],
  primaryModel = {
    ...testSettings().model,
    baseURL: "https://primary.example.test/v1",
    reasoning_effort: "high",
    temperature: 0.8,
  };
afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});
test("the bundled prediction configuration inherits the primary model", () => {
  const settings = loadPredictionConfiguration();
  expect(settings.prediction?.enabled).toBe(true);
  expect(settings.prediction?.model).toEqual(settings.model);
});
test.each([undefined, null, "", {}])("an empty prediction model inherits: %j", (model) => {
  const settings = loadPredictionConfiguration({ model });
  expect(settings.prediction?.model).toEqual(settings.model);
});
test("prediction overrides inherit empty fields and retain explicit values", () => {
  const settings = loadPredictionConfiguration({
    model: {
      adapter: "",
      apiKeyEnv: null,
      baseURL: "",
      maxConcurrentRequests: null,
      model: "prediction-model",
      raceIntervalMs: 2500,
      reasoning_effort: "",
      retryDelayMs: null,
      temperature: 0,
    },
  });
  expect(settings.prediction?.model).toEqual({
    ...settings.model,
    model: "prediction-model",
    raceIntervalMs: 2500,
    temperature: 0,
  });
});
test("prediction can override the adapter and connection independently", () => {
  const model = {
      adapter: "messages",
      apiKeyEnv: "PREDICTION_KEY",
      baseURL: "https://prediction.example.test",
    } as const,
    settings = loadPredictionConfiguration({ model });
  expect(settings.prediction?.model).toEqual({ ...settings.model, ...model });
});
test.each([true, false])("Codex ignores connection placeholders when inherited: %j", (inherit) => {
  const settings = loadPredictionConfiguration(
    {
      model: {
        adapter: inherit ? null : "codex",
        apiKeyEnv: `\${OMITY_MISSING_PREDICTION_KEY}`,
        baseURL: `\${OMITY_MISSING_PREDICTION_URL}`,
      },
    },
    inherit ? { ...primaryModel, adapter: "codex" } : primaryModel,
  );
  expect(settings.prediction?.model).toMatchObject({ adapter: "codex" });
  expect(settings.prediction?.model).not.toHaveProperty("apiKeyEnv");
  expect(settings.prediction?.model).not.toHaveProperty("baseURL");
});
test.each([{ adapter: "invalid" }, { retryDelayMs: 0 }, { unknown: null }])(
  "prediction still rejects invalid overrides: %j",
  (model) => {
    expect(() => loadPredictionConfiguration({ model })).toThrow(z.ZodError);
  },
);
test("disabled prediction accepts an empty model", () => {
  const settings = loadPredictionConfiguration({ enabled: false, model: null });
  expect(settings.prediction?.enabled).toBe(false);
});
function loadPredictionConfiguration(
  prediction: Record<string, unknown> = {},
  model: Record<string, unknown> = primaryModel,
) {
  const root = createTestDirectory("prediction-settings");
  roots.push(root);
  const directory = writeTestConfiguration(root, { modelYaml: stringify(model) }),
    main = z
      .record(z.string(), z.unknown())
      .parse(parse(readFileSync(resolve(import.meta.dir, "../../../settings/main.yaml"), "utf8")));
  writeFileSync(
    join(directory, "main.yaml"),
    stringify({
      ...main,
      prediction: {
        ...z.record(z.string(), z.unknown()).parse(main["prediction"]),
        ...prediction,
      },
    }),
  );
  return loadSettings(root, { userSettingsDir: join(root, "user-settings") });
}
