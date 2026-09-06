import { UnsupportedLanguagePairError, createBrowserTranslator } from "./browser";
import { AsyncQueuer } from "@tanstack/pacer/async-queuer";
import type { ReasoningTranslation } from "../../../timeline";
import { t } from "i18next";

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
export class ReasoningTranslationCoordinator {
  private closed = false;
  private currentMessageId?: string;
  private skipped = false;
  private readonly queue: AsyncQueuer<TranslationCandidate>;
  constructor(private readonly options: TranslationCoordinatorOptions) {
    this.queue = new AsyncQueuer(
      (candidate) => {
        const signal = this.queue.getAbortSignal();
        if (!signal) {
          throw new Error(t("translationAbortSignalMissing"));
        }
        return this.translate(candidate, signal);
      },
      {
        onError: (error, candidate) => this.handleError(error, candidate),
        wait: options.minimumIntervalMs,
      },
    );
  }
  update(candidate: PendingTranslationCandidate) {
    if (this.closed || !candidate.messageId) {
      return;
    }
    if (this.currentMessageId !== candidate.messageId) {
      this.currentMessageId = candidate.messageId;
      this.skipped = false;
    }
    if (this.skipped) {
      return;
    }
    if (isPersisted(candidate.translations, candidate.content, this.options.targetLanguage)) {
      return;
    }
    this.queue.clear();
    this.queue.addItem({ ...candidate, messageId: candidate.messageId });
  }
  close() {
    this.closed = true;
    this.queue.stop();
    this.queue.clear();
    this.queue.abort();
  }
  private async translate(candidate: TranslationCandidate, signal: AbortSignal) {
    if (this.skipped && this.currentMessageId === candidate.messageId) {
      return;
    }
    const translator = await (this.options.createTranslator ?? createBrowserTranslator)(
        this.options.targetLanguage,
        candidate.content,
        signal,
      ),
      translated = await translator.translate(candidate.content, signal);
    if (translated === null || signal.aborted) {
      return;
    }
    const result = {
      messageId: candidate.messageId,
      source: candidate.content,
      targetLanguage: this.options.targetLanguage,
      translated,
    };
    this.options.onTranslation?.(result);
    if (!candidate.streaming) {
      await this.options.persist(result);
    }
  }
  private handleError(error: unknown, candidate: TranslationCandidate) {
    if (this.closed) {
      return;
    }
    if (error instanceof UnsupportedLanguagePairError) {
      const highConfidence = error.confidence >= this.options.highConfidenceThreshold;
      console.warn(
        t(highConfidence ? "translationSkipReasoning" : "translationRetryDetection", {
          confidence: error.confidence,
          messageId: candidate.messageId,
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
    if (this.currentMessageId === candidate.messageId) {
      this.skipped = true;
    }
  }
}
function isPersisted(
  translations: ReasoningTranslation[] | undefined,
  content: string,
  targetLanguage: string,
) {
  return (
    translations?.some(
      (translation) =>
        translation.source === content && translation.targetLanguage === targetLanguage,
    ) ?? false
  );
}
