import { type ComposerDraftTarget, writeComposerDraft } from "../composerDrafts";
import { Debouncer } from "@tanstack/pacer";

interface DraftSnapshot {
  content: string;
  revision: number;
}
type PersistDraft = (
  target: ComposerDraftTarget,
  content: string,
  revision: number,
) => Promise<unknown>;
export class DraftSaver {
  private readonly debouncer: Debouncer<(snapshot: DraftSnapshot) => void>;
  private tail: Promise<unknown> = Promise.resolve();
  constructor(
    private readonly target: ComposerDraftTarget,
    private readonly delayMs: number,
    private readonly onError: (error: unknown) => void,
    private readonly persist: PersistDraft = writeComposerDraft,
  ) {
    this.debouncer = new Debouncer(
      (snapshot) => {
        this.tail = this.persistAfter(this.tail, snapshot);
      },
      { wait: this.delayMs },
    );
  }
  schedule(content: string, revision: number) {
    this.debouncer.maybeExecute({ content, revision });
  }
  discardPending() {
    this.debouncer.cancel();
  }
  async flush() {
    this.debouncer.flush();
    await this.tail;
  }
  private async persistAfter(previous: Promise<unknown>, snapshot: DraftSnapshot) {
    await previous;
    try {
      await this.persist(this.target, snapshot.content, snapshot.revision);
    } catch (error: unknown) {
      this.onError(error);
    }
  }
}
