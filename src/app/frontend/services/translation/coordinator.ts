import { AsyncQueuer } from "@tanstack/pacer/async-queuer";

import type { ReasoningTranslation } from "../../../timeline";
import { localize } from "../../i18n";
import { createBrowserTranslator, UnsupportedLanguagePairError } from "./browser";

interface TranslationCandidate {
  content: string;
  messageId: string;
  streaming?: true;
  translations?: ReasoningTranslation[];
}
type PendingTranslationCandidate = Omit<TranslationCandidate, "messageId"> & {
  messageId?: string;
};
interface TranslationCoordinatorOptions {
  createTranslator?: typeof createBrowserTranslator;
  highConfidenceThreshold: number;
  minimumIntervalMs: number;
  onTranslation?: (translation: ReasoningTranslation) => void;
  persist: (translation: ReasoningTranslation) => Promise<unknown>;
  reportError?: (error: unknown) => void;
  targetLanguage: string;
}
interface TranslationJob {
  candidate: TranslationCandidate;
  persistedSource?: string;
  processedSource?: string;
  queued: boolean;
  skipped: boolean;
  translation?: ReasoningTranslation;
}
export class ReasoningTranslationCoordinator {
  private closed = false;
  private readonly jobs = new Map<string, TranslationJob>();
  private readonly queue: AsyncQueuer<TranslationJob>;
  constructor(private readonly options: TranslationCoordinatorOptions) {
    this.queue = new AsyncQueuer(
      (job) => {
        const signal = this.queue.getAbortSignal();
        if (!signal) {
          throw new Error(localize("translationAbortSignalMissing"));
        }
        return this.translate(job, signal);
      },
      {
        onError: (error, job) => this.handleError(error, job),
        onSettled: (job) => {
          job.queued = false;
          this.enqueue(job);
        },
        wait: options.minimumIntervalMs,
      },
    );
  }
  update(candidates: readonly PendingTranslationCandidate[]) {
    if (this.closed) {
      return;
    }
    for (const candidate of candidates) {
      if (
        candidate.messageId &&
        (candidate.streaming ||
          this.jobs.has(candidate.messageId) ||
          candidate === candidates.at(-1))
      ) {
        this.updateCandidate({ ...candidate, messageId: candidate.messageId });
      }
    }
  }
  close() {
    this.closed = true;
    this.queue.stop();
    this.queue.clear();
    this.queue.abort();
  }
  private updateCandidate(candidate: TranslationCandidate) {
    const job = this.jobs.get(candidate.messageId) ?? {
        candidate,
        queued: false,
        skipped: false,
      },
      persisted = candidate.translations?.find(
        (translation) =>
          translation.messageId === candidate.messageId &&
          translation.source === candidate.content &&
          translation.targetLanguage === this.options.targetLanguage,
      );
    job.candidate = candidate;
    if (persisted) {
      job.translation = persisted;
      job.persistedSource = persisted.source;
      job.processedSource = persisted.source;
    }
    this.jobs.set(candidate.messageId, job);
    this.enqueue(job);
  }
  private enqueue(job: TranslationJob) {
    if (
      this.closed ||
      job.queued ||
      job.skipped ||
      (job.processedSource === job.candidate.content &&
        (job.candidate.streaming ||
          job.translation?.source !== job.candidate.content ||
          job.persistedSource === job.candidate.content))
    ) {
      return;
    }
    job.queued = true;
    this.queue.addItem(job);
  }
  private async translate(job: TranslationJob, signal: AbortSignal) {
    const { candidate } = job;
    if (job.processedSource !== candidate.content) {
      job.processedSource = candidate.content;
      const translator = await (this.options.createTranslator ?? createBrowserTranslator)(
          this.options.targetLanguage,
          candidate.content,
          signal,
        ),
        translated = await translator.translate(candidate.content, signal);
      if (translated === null || signal.aborted || this.closed) {
        return;
      }
      if (job.candidate.content.startsWith(candidate.content)) {
        job.translation = {
          messageId: candidate.messageId,
          source: candidate.content,
          targetLanguage: this.options.targetLanguage,
          translated,
        };
        this.options.onTranslation?.(job.translation);
      }
    }
    const result = job.translation;
    if (
      !signal.aborted &&
      !job.candidate.streaming &&
      result?.source === job.candidate.content &&
      job.persistedSource !== result.source
    ) {
      await this.options.persist(result);
      job.persistedSource = result.source;
    }
  }
  private handleError(error: unknown, job: TranslationJob) {
    if (this.closed) {
      return;
    }
    if (error instanceof UnsupportedLanguagePairError) {
      const highConfidence = error.confidence >= this.options.highConfidenceThreshold;
      console.warn(
        localize(highConfidence ? "translationSkipReasoning" : "translationRetryDetection", {
          confidence: error.confidence,
          messageId: job.candidate.messageId,
          sourceLanguage: error.sourceLanguage,
          targetLanguage: error.targetLanguage,
          threshold: this.options.highConfidenceThreshold,
        }),
      );
      if (!highConfidence) {
        return;
      }
    } else {
      this.options.reportError?.(error);
    }
    job.skipped = true;
  }
}
