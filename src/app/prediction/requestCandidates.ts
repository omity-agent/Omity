import { Output, generateText } from "ai";
import { buildConfiguredAiModel, structuredRequestOptions } from "../../agent/model/provider";
import type { PredictionSample } from "./samples";
import type { PredictionSettings } from "./selectExamples";
import { z } from "zod";

export async function requestCandidates(
  config: PredictionSettings,
  currentModel: string,
  samples: PredictionSample[],
  signal: AbortSignal,
) {
  const result = await generateText({
    ...structuredRequestOptions(config.model),
    abortSignal: signal,
    maxRetries: 0,
    model: buildConfiguredAiModel(config.model),
    output: Output.array({
      element: z.string().trim().min(1),
      maxItems: config.outputCount,
      minItems: config.outputCount,
    }),
    prompt: predictionPrompt(config.task, currentModel, samples),
    temperature: config.model.temperature,
  });
  return result.output;
}
function predictionPrompt(task: string, currentModel: string, samples: PredictionSample[]) {
  return [
    "<samples>",
    ...samples.flatMap((sample, index) => [
      `  <sample index="${(index + 1).toString()}">`,
      "    <assistant>",
      escapeXml(sample.model),
      "    </assistant>",
      "    <user>",
      escapeXml(sample.user),
      "    </user>",
      "  </sample>",
    ]),
    "</samples>",
    "<task-description>",
    escapeXml(task),
    "</task-description>",
    "<current-assistant-response>",
    escapeXml(currentModel),
    "</current-assistant-response>",
  ].join("\n");
}
function escapeXml(value: string) {
  return value.replace(
    /[<>&'"]/gu,
    (character) =>
      ({
        '"': "&quot;",
        "&": "&amp;",
        "'": "&apos;",
        "<": "&lt;",
        ">": "&gt;",
      })[character]!,
  );
}
