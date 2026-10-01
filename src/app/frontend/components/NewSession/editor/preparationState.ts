import {
  type EditablePair,
  type SessionPreparation,
  emptyPreparation,
  parsePreparation,
} from "../../../../composition/preparation";
import { flushComposerDraft, readComposerDraft } from "../../../services/composerDrafts";
import { reportError, reportPromiseErrors } from "../../../services/errors";
import { useEffect, useRef, useState } from "react";
import { DraftSaver } from "../../../services/scheduling/draftSaver";
import type { InitialMessagePair } from "../../../../initialState";
import { claimShortId } from "../../../../../infrastructure/randomId";

const target = { kind: "new" } as const;
export function useNewSessionDraft(saveDelayMs?: number) {
  "use no memo";
  const [draft, setDraft] = useState(emptyPreparation),
    [loading, setLoading] = useState(true),
    [revision, setRevision] = useState(0),
    draftRef = useRef(draft),
    revisionRef = useRef(0),
    saverRef = useRef<DraftSaver | undefined>(undefined);
  useEffect(() => {
    let current = true;
    const load = async () => {
      const loaded = await readComposerDraft(target, JSON.stringify(emptyPreparation()));
      if (!current) {
        return;
      }
      const restored = parsePreparation(loaded.content);
      draftRef.current = restored;
      revisionRef.current = loaded.revision;
      setDraft(restored);
      setRevision(loaded.revision);
      setLoading(false);
    };
    reportPromiseErrors(load());
    return () => {
      current = false;
    };
  }, []);
  useEffect(() => {
    const saver = new DraftSaver(target, saveDelayMs ?? 0, reportError);
    saverRef.current = saver;
    return () => {
      if (saverRef.current === saver) {
        saverRef.current = undefined;
      }
      reportPromiseErrors(saver.flush());
    };
  }, [saveDelayMs]);
  useEffect(() => {
    const flush = () => {
      if (!flushComposerDraft(target, JSON.stringify(draftRef.current), revisionRef.current)) {
        reportError(new Error("新建会话草稿未能提交保存"));
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
    };
  }, []);
  const update = (next: SessionPreparation) => {
      if (revisionRef.current >= Number.MAX_SAFE_INTEGER) {
        throw new Error("新建会话草稿版本号溢出");
      }
      draftRef.current = next;
      revisionRef.current += 1;
      setDraft(next);
      setRevision(revisionRef.current);
      saverRef.current?.schedule(JSON.stringify(next), revisionRef.current);
    },
    updateMessage = (message: string) => {
      if (message !== draftRef.current.message) {
        update({ ...draftRef.current, message });
      }
    },
    changePair = (id: string, next: InitialMessagePair) => {
      update({
        ...draftRef.current,
        pairs: draftRef.current.pairs.map((item) => (item.id === id ? { ...next, id } : item)),
      });
    },
    removePair = (id: string) => {
      update({
        ...draftRef.current,
        pairs: draftRef.current.pairs.filter((item) => item.id !== id),
      });
    },
    addPair = () => {
      const { current } = draftRef,
        id = claimShortId((candidate) => !current.pairs.some((item) => item.id === candidate)),
        pair: EditablePair = { assistant: "", id, user: "" };
      update({ ...current, pairs: [...current.pairs, pair] });
    },
    flush = () => saverRef.current?.flush() ?? Promise.resolve(),
    clear = () => {
      saverRef.current?.discardPending();
      draftRef.current = emptyPreparation();
      setDraft(draftRef.current);
    };
  return {
    addPair,
    changePair,
    clear,
    draft,
    flush,
    loading,
    removePair,
    revision,
    updateMessage,
  };
}
