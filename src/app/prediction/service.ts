import { Output, generateText } from "ai";
import { type PredictionSample, loadPredictionSnapshot } from "./samples";
import { buildConfiguredAiModel, structuredRequestOptions } from "../../agent/model/provider";
import type { Settings } from "../../types";
import { z } from "zod";

type PredictionSettings = Extract<NonNullable<Settings["prediction"]>, { enabled: true }>;
interface SampleCache {
  ids: string[];
  samples: PredictionSample[];
}
export class PredictionService {
  private readonly pending = new Map<string, Promise<string[]>>();
  private readonly predictions = new Map<string, string[]>();
  private sampleCache: SampleCache | undefined;
  constructor(private readonly settings: Settings) {}
  onIdle(sessionId: string) {
    const config = this.settings.prediction;
    if (!config || !config.enabled || this.pending.has(sessionId)) {
      return;
    }
    this.predictions.delete(sessionId);
    let snapshot: ReturnType<typeof loadPredictionSnapshot>;
    try {
      snapshot = loadPredictionSnapshot();
    } catch (error) {
      reportPredictionError(sessionId, error);
      return;
    }
    const currentModel = snapshot.latestModels.get(sessionId),
      samples = this.selectSamples(snapshot, config);
    if (!currentModel || !samples) {
      return;
    }
    const pending = this.generate(config, currentModel.content, samples);
    this.pending.set(sessionId, pending);
    void this.storePrediction(sessionId, pending);
  }
  async get(sessionId: string) {
    const pending = this.pending.get(sessionId);
    if (pending) {
      try {
        await pending;
      } catch {
        return [];
      }
    }
    return this.predictions.get(sessionId) ?? [];
  }
  private selectSamples(
    snapshot: ReturnType<typeof loadPredictionSnapshot>,
    config: PredictionSettings,
  ) {
    const eligible = distinctModelSamples(
      snapshot.samples
        .filter(
          ({ contextTokens, userTokens }) =>
            contextTokens > config.sampleContextTokens && userTokens <= config.maxUserMessageTokens,
        )
        .toSorted(
          (left, right) => left.createdAt - right.createdAt || left.id.localeCompare(right.id),
        ),
    );
    if (eligible.length < config.sampleCount) {
      return undefined;
    }
    const latest = eligible.slice(-config.sampleCount),
      ids = latest.map(({ id }) => id);
    if (!this.sampleCache || this.shouldRefresh(snapshot, config, ids)) {
      this.sampleCache = { ids, samples: latest };
    }
    return this.sampleCache.samples;
  }
  private shouldRefresh(
    snapshot: ReturnType<typeof loadPredictionSnapshot>,
    config: PredictionSettings,
    latestIds: string[],
  ) {
    const cachedIds = this.sampleCache?.ids ?? [],
      changed =
        cachedIds.length !== latestIds.length ||
        cachedIds.some((id, index) => id !== latestIds[index]),
      hasCurrentSample = latestIds.some((id) => cachedIds.includes(id)),
      now = Math.floor(Date.now() / 1000),
      staleAfter = config.refreshIntervalHours * 60 * 60,
      allSessionsStale =
        snapshot.sessionUpdates.size > 0 &&
        [...snapshot.sessionUpdates.values()].every((updatedAt) => now - updatedAt > staleAfter);
    return !hasCurrentSample || (allSessionsStale && changed);
  }
  private async generate(
    config: PredictionSettings,
    currentModel: string,
    samples: PredictionSample[],
  ) {
    const result = await generateText({
      ...structuredRequestOptions(config.model),
      maxRetries: 0,
      model: buildConfiguredAiModel(config.model),
      output: Output.array({
        element: z.string().min(1),
        maxItems: config.outputCount,
        minItems: config.outputCount,
      }),
      prompt: predictionPrompt(config.task, currentModel, samples),
      temperature: config.model.temperature,
    });
    return result.output;
  }
  private async storePrediction(sessionId: string, pending: Promise<string[]>) {
    try {
      this.predictions.set(sessionId, await pending);
    } catch (error) {
      reportPredictionError(sessionId, error);
    } finally {
      this.pending.delete(sessionId);
    }
  }
}
function distinctModelSamples(samples: PredictionSample[]) {
  const knownModels = new Set<string>(),
    distinct = samples.toReversed().filter((sample) => {
      if (knownModels.has(sample.model)) {
        return false;
      }
      knownModels.add(sample.model);
      return true;
    });
  return distinct.toReversed();
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
function reportPredictionError(sessionId: string, error: unknown) {
  console.warn("用户输入预测失败", { error, sessionId });
}
