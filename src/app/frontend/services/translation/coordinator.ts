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
  now?: () => number;
  onTranslation?: (translation: ReasoningTranslation) => void;
  persist: (translation: ReasoningTranslation) => Promise<unknown>;
  reportError?: (error: unknown) => void;
  targetLanguage: string;
}
export class ReasoningTranslationCoordinator {
  private active?: Promise<void>;
  private controller?: AbortController;
  private lastTranslationAt = Number.NEGATIVE_INFINITY;
  private pending?: TranslationCandidate;
  private timer?: ReturnType<typeof setTimeout>;
  constructor(private readonly options: TranslationCoordinatorOptions) {}
  update(candidate: PendingTranslationCandidate) {
    if (!candidate.messageId) {
      return;
    }
    if (isPersisted(candidate.translations, candidate.content, this.options.targetLanguage)) {
      return;
    }
    this.pending = { ...candidate, messageId: candidate.messageId };
    this.schedule();
  }
  close() {
    this.controller?.abort();
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.pending = undefined;
  }
  private schedule() {
    if (this.active || !this.pending) {
      return;
    }
    const now = this.options.now?.() ?? Date.now(),
      remaining = this.options.minimumIntervalMs - (now - this.lastTranslationAt);
    if (remaining <= 0) {
      this.start();
      return;
    }
    if (!this.timer) {
      this.timer = setTimeout(() => {
        this.timer = undefined;
        this.start();
      }, remaining);
    }
  }
  private start() {
    const candidate = this.pending;
    if (!candidate) {
      return;
    }
    this.pending = undefined;
    this.lastTranslationAt = this.options.now?.() ?? Date.now();
    const controller = new AbortController();
    this.controller = controller;
    this.active = this.run(candidate, controller);
  }
  private async run(candidate: TranslationCandidate, controller: AbortController) {
    try {
      await this.translate(candidate, controller.signal);
    } catch (error) {
      if (!controller.signal.aborted) {
        this.options.reportError?.(error);
      }
    } finally {
      if (this.controller === controller) {
        this.active = undefined;
        this.controller = undefined;
        this.schedule();
      }
    }
  }
  private async translate(candidate: TranslationCandidate, signal: AbortSignal) {
    const translator = await (this.options.createTranslator ?? createBrowserTranslator)(
      this.options.targetLanguage,
      candidate.content,
      signal,
    );
    const translated = await translator.translate(candidate.content, signal);
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
