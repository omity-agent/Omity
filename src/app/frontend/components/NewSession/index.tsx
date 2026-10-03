import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import { conversation, scroll, scrollContent, setup, setupFirst } from "./layout";
import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { ConfigurationPanel } from "./options/ConfigurationPanel";
import type { InitialSessionState } from "../../../initialState";
import { LatestMessage } from "./editor/LatestMessage";
import { MessageStack } from "./MessageStack";
import { PendingAttachments } from "../Chat/Composer/attachments";
import { WorkspacePicker } from "./WorkspacePicker";
import { useNewSessionDraft } from "./editor/preparationState";
import { useSessionCreation } from "./editor/submission";
import { useSessionPreferences } from "./options/preferences";

export function NewSessionPage({
  attachmentSettings,
  draftSaveDelayMs,
  pageClassName,
  recentWorkspaces,
  availableProfiles,
  selectedProfile,
  workspace,
  userMessages,
  onCreate,
  onPickWorkspace,
  onProfileChange,
  onWorkspaceChange,
}: {
  attachmentSettings?: AttachmentSettings;
  draftSaveDelayMs?: number;
  pageClassName: string;
  recentWorkspaces: string[];
  availableProfiles: string[];
  selectedProfile?: string;
  workspace: string;
  userMessages: readonly string[];
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onProfileChange: (profile?: string) => void;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const selection = useSessionPreferences(selectedProfile),
    {
      addPair,
      changePair,
      clear: clearDraft,
      draft: { message, pairs },
      flush: flushDraft,
      loading: draftLoading,
      removePair,
      revision: draftRevision,
      updateMessage,
    } = useNewSessionDraft(draftSaveDelayMs),
    scrollRef = useRef<HTMLDivElement>(null),
    attachmentsRef = useRef(new PendingAttachments(attachmentSettings)),
    previousPairCountRef = useRef(pairs.length);
  useEffect(() => {
    attachmentsRef.current.configure(attachmentSettings);
  }, [attachmentSettings]);
  useLayoutEffect(() => {
    const pairAdded = pairs.length > previousPairCountRef.current;
    previousPairCountRef.current = pairs.length;
    if (!pairAdded) {
      return undefined;
    }
    const keepLastMessageInPlace = () => {
      const node = scrollRef.current;
      if (node) {
        node.scrollTop = node.scrollHeight;
      }
    };
    keepLastMessageInPlace();
    const frame = requestAnimationFrame(keepLastMessageInPlace);
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [pairs.length]);
  const { handleFormSubmit, handleSubmit, submitting } = useSessionCreation({
      attachmentsRef,
      clearDraft,
      draftRevision,
      flushDraft,
      hookOverrides: selection.hookOverrides,
      mcpOverrides: selection.mcpOverrides,
      message,
      model: selection.model,
      onCreate,
      optionsReady: selection.ready,
      pairs,
      workspace,
    }),
    complete =
      workspace.trim().length > 0 &&
      message.trim().length > 0 &&
      pairs.every(({ user, assistant }) => user.trim().length > 0 && assistant.trim().length > 0),
    pasteFiles = useCallback(
      (files: File[]) => attachmentsRef.current.paste(files, message),
      [attachmentsRef, message],
    );
  return (
    <form className={pageClassName} onSubmit={handleFormSubmit}>
      <div className={scroll} ref={scrollRef}>
        <div className={scrollContent}>
          <div className={setup}>
            <WorkspacePicker
              className={setupFirst}
              disabled={submitting}
              recentWorkspaces={recentWorkspaces}
              workspace={workspace}
              onChange={onWorkspaceChange}
              onPick={onPickWorkspace}
            />
            <ConfigurationPanel
              availableProfiles={availableProfiles}
              disabled={submitting}
              onProfileChange={onProfileChange}
              selectedProfile={selectedProfile}
              selection={selection}
            />
          </div>
          <div className={conversation}>
            <MessageStack
              disabled={draftLoading || submitting}
              pairs={pairs}
              onPairChange={changePair}
              onRemove={removePair}
              onSubmit={handleSubmit}
            />
            <LatestMessage
              disabled={draftLoading || submitting}
              message={message}
              submitDisabled={draftLoading || !selection.valid || !complete || submitting}
              submitting={submitting}
              userMessages={userMessages}
              onAddPair={addPair}
              onChange={updateMessage}
              onPasteFiles={attachmentSettings ? pasteFiles : undefined}
              onSubmit={handleSubmit}
            />
          </div>
        </div>
      </div>
    </form>
  );
}
