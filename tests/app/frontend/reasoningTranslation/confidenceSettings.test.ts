import { expect, test } from "bun:test";
import { bootstrapResponseSchema } from "../../../../src/app/frontend/services/validation/responses";
import { parse } from "yaml";
import { parseMainSettings } from "../../../../src/infrastructure/configuration/settings/schema";
import { readFileSync } from "node:fs";

function mainSettings() {
  return parseMainSettings(
    parse(readFileSync(new URL("../../../../settings/main.yaml", import.meta.url), "utf8")),
  );
}
test("the configured confidence threshold reaches frontend response validation", () => {
  const settings = mainSettings(),
    frontend = bootstrapResponseSchema.shape.frontend.parse(settings.frontend);
  expect(frontend.reasoningTranslation.highConfidenceThreshold).toBe(
    settings.frontend.reasoningTranslation.highConfidenceThreshold,
  );
});
test.each([0, 0.95, 1])("confidence threshold %s is configurable", (threshold) => {
  const settings = mainSettings();
  settings.frontend.reasoningTranslation.highConfidenceThreshold = threshold;
  expect(parseMainSettings(settings).frontend.reasoningTranslation.highConfidenceThreshold).toBe(
    threshold,
  );
  expect(
    bootstrapResponseSchema.shape.frontend.parse(settings.frontend).reasoningTranslation
      .highConfidenceThreshold,
  ).toBe(threshold);
});
test.each([-0.1, 1.1, Number.NaN, undefined])(
  "invalid confidence threshold %s is rejected by both schemas",
  (threshold) => {
    const defaults = mainSettings(),
      settings = {
        ...defaults,
        frontend: {
          ...defaults.frontend,
          reasoningTranslation: {
            ...defaults.frontend.reasoningTranslation,
            highConfidenceThreshold: threshold,
          },
        },
      };
    expect(() => parseMainSettings(settings)).toThrow();
    expect(bootstrapResponseSchema.shape.frontend.safeParse(settings.frontend).success).toBeFalse();
  },
);
