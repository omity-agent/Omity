import type { PredictionSample, loadPredictionSnapshot } from "./samples";
import type { Settings } from "../../types";

export type PredictionSettings = Extract<NonNullable<Settings["prediction"]>, { enabled: true }>;
interface SampleCache {
  ids: string[];
  samples: PredictionSample[];
}
export class PredictionExamples {
  private cache: SampleCache | undefined;
  select(snapshot: ReturnType<typeof loadPredictionSnapshot>, config: PredictionSettings) {
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
    if (!this.cache || this.shouldRefresh(snapshot, config, ids)) {
      this.cache = { ids, samples: latest };
    }
    return this.cache.samples;
  }
  private shouldRefresh(
    snapshot: ReturnType<typeof loadPredictionSnapshot>,
    config: PredictionSettings,
    latestIds: string[],
  ) {
    const cachedIds = this.cache?.ids ?? [],
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
