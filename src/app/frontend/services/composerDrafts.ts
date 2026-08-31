import { beaconComposerDraft, loadComposerDraft, saveComposerDraft } from "./client";

export type ComposerDraftTarget =
  | { beforeMessageId: number; kind: "fork"; sourceSessionId: string }
  | { kind: "new" }
  | { kind: "session"; sessionId: string };
export async function readComposerDraft(target: ComposerDraftTarget, fallback: string) {
  if (target.kind === "session") {
    const draft = await loadComposerDraft(target.sessionId);
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
  globalThis.sessionStorage.setItem(storageKey(target), content);
  return Promise.resolve({ revision: 0 });
}
export function flushComposerDraft(target: ComposerDraftTarget, content: string, revision: number) {
  if (target.kind === "session") {
    if (revision === 0) {
      return true;
    }
    return beaconComposerDraft(target.sessionId, content, revision);
  }
  globalThis.sessionStorage.setItem(storageKey(target), content);
  return true;
}
export function clearTemporaryComposerDraft(target: ComposerDraftTarget = { kind: "new" }) {
  if (target.kind === "session") {
    throw new Error("已创建会话的草稿不能从临时存储清除");
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
function storageKey(target: Exclude<ComposerDraftTarget, { kind: "session" }>) {
  return `omity:composer:${composerDraftKey(target)}`;
}
