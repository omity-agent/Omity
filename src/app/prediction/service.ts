import { PredictionExamples, type PredictionSettings } from "./selectExamples";
import { type PredictionSample, loadPredictionSnapshot } from "./samples";
import {
  openSessionDatabase,
  runTransaction,
} from "../../infrastructure/database/sqlite/connection";
import {
  readPredictionContext,
  readPredictionRecord,
  writePredictionRecord,
} from "../../infrastructure/database/records/session/inputForecast";
import type { Settings } from "../../types";
import { databasePath } from "../../infrastructure/configuration/sessionPaths";
import { requestCandidates } from "./requestCandidates";

interface PredictionTask {
  controller: AbortController;
  promise: Promise<void>;
  revision: number;
}
export class PredictionService {
  private readonly path = databasePath();
  private readonly pending = new Map<string, PredictionTask>();
  private readonly examples = new PredictionExamples();
  private closed = false;
  constructor(private readonly settings: Settings) {}
  async onIdle(sessionId: string) {
    try {
      await this.get(sessionId);
    } catch (error) {
      console.warn("用户输入预测失败", { error, sessionId });
    }
  }
  async get(sessionId: string) {
    const config = this.settings.prediction;
    if (this.closed || !config?.enabled) {
      return [];
    }
    let task = this.prepare(sessionId, config);
    while (task) {
      await task.promise;
      const latest = this.pending.get(sessionId);
      task = latest === task ? undefined : latest;
    }
    return this.read(sessionId);
  }
  async close() {
    this.closed = true;
    const tasks = [...this.pending.values()];
    for (const task of tasks) {
      task.controller.abort();
    }
    await Promise.all(tasks.map(({ promise }) => promise));
  }
  private read(sessionId: string) {
    if (this.closed) {
      return [];
    }
    using db = openSessionDatabase(this.path);
    return runTransaction(db, () => {
      const context = readPredictionContext(db, sessionId);
      return context ? (readPredictionRecord(db, sessionId, context.revision) ?? []) : [];
    });
  }
  private prepare(sessionId: string, config: PredictionSettings) {
    using db = openSessionDatabase(this.path);
    return runTransaction(db, () => {
      const context = readPredictionContext(db, sessionId),
        previous = this.pending.get(sessionId);
      if (!context) {
        previous?.controller.abort();
        return undefined;
      }
      if (readPredictionRecord(db, sessionId, context.revision)) {
        return undefined;
      }
      if (previous?.revision === context.revision && !previous.controller.signal.aborted) {
        return previous;
      }
      previous?.controller.abort();
      const samples = this.examples.select(loadPredictionSnapshot(db), config);
      if (!samples) {
        return undefined;
      }
      const controller = new AbortController(),
        task = {
          controller,
          promise: this.generate(sessionId, context, config, samples, controller),
          revision: context.revision,
        };
      this.pending.set(sessionId, task);
      return task;
    });
  }
  private async generate(
    sessionId: string,
    context: { content: string; revision: number },
    config: PredictionSettings,
    samples: PredictionSample[],
    controller: AbortController,
  ) {
    try {
      const candidates = await requestCandidates(
        config,
        context.content,
        samples,
        controller.signal,
      );
      if (!controller.signal.aborted) {
        using db = openSessionDatabase(this.path);
        writePredictionRecord(db, sessionId, context.revision, candidates);
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.pending.get(sessionId)?.controller === controller) {
        this.pending.delete(sessionId);
      }
    }
  }
}
