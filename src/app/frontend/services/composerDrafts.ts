import {
  beaconComposerDraft,
  beaconPreparationDraft,
  loadComposerDraft,
  loadPreparationDraft,
  saveComposerDraft,
  savePreparationDraft,
} from "./client";

export type ComposerDraftTarget =
  | { beforeMessageId: number; kind: "fork"; sourceSessionId: string }
  | { kind: "new" }
  | { kind: "session"; sessionId: string };
export async function readComposerDraft(target: ComposerDraftTarget, fallback: string) {
  if (target.kind !== "fork") {
    const draft =
      target.kind === "session"
        ? await loadComposerDraft(target.sessionId)
        : await loadPreparationDraft();
    return {
      content: draft.content ?? fallback,
      revision: draft.revision,
    };
  }
  return {
    content: globalThis.sessionStorage.getItem(storageKey(target)) ?? fallback,
    revision: 0,
  };
}
export function writeComposerDraft(target: ComposerDraftTarget, content: string, revision: number) {
  if (target.kind === "session") {
    return saveComposerDraft(target.sessionId, content, revision);
  }
  if (target.kind === "new") {
    return savePreparationDraft(content, revision);
  }
  globalThis.sessionStorage.setItem(storageKey(target), content);
  return Promise.resolve({ revision: 0 });
}
export function flushComposerDraft(target: ComposerDraftTarget, content: string, revision: number) {
  if (target.kind !== "fork") {
    if (revision === 0) {
      return true;
    }
    return target.kind === "session"
      ? beaconComposerDraft(target.sessionId, content, revision)
      : beaconPreparationDraft(content, revision);
  }
  globalThis.sessionStorage.setItem(storageKey(target), content);
  return true;
}
export function clearTemporaryComposerDraft(target: ComposerDraftTarget) {
  if (target.kind !== "fork") {
    throw new Error("仅 Fork 草稿使用临时存储");
  }
  globalThis.sessionStorage.removeItem(storageKey(target));
}
export function composerDraftKey(target: ComposerDraftTarget) {
  if (target.kind === "session") {
    return `session:${target.sessionId}`;
  }
  if (target.kind === "fork") {
    return `fork:${target.sourceSessionId}:${target.beforeMessageId.toString()}`;
  }
  return "new";
}
function storageKey(target: Extract<ComposerDraftTarget, { kind: "fork" }>) {
  return `omity:composer:${composerDraftKey(target)}`;
}
