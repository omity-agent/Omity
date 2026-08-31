import { AsyncQueuer } from "@tanstack/pacer/async-queuer";
import type { ReasoningTranslation } from "../../../timeline";
import { createBrowserTranslator } from "./browser";

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
  minimumIntervalMs: number;
  onTranslation?: (translation: ReasoningTranslation) => void;
  persist: (translation: ReasoningTranslation) => Promise<unknown>;
  reportError?: (error: unknown) => void;
  targetLanguage: string;
}
export class ReasoningTranslationCoordinator {
  private closed = false;
  private failed = false;
  private readonly queue: AsyncQueuer<TranslationCandidate>;
  constructor(private readonly options: TranslationCoordinatorOptions) {
    this.queue = new AsyncQueuer(
      (candidate) => {
        const signal = this.queue.getAbortSignal();
        if (!signal) {
          throw new Error("翻译任务缺少取消信号");
        }
        return this.translate(candidate, signal);
      },
      {
        onError: (error) => {
          if (this.closed) {
            return;
          }
          this.failed = true;
          this.queue.clear();
          this.queue.stop();
          this.options.reportError?.(error);
        },
        wait: options.minimumIntervalMs,
      },
    );
  }
  update(candidate: PendingTranslationCandidate) {
    if (this.closed || this.failed || !candidate.messageId) {
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
