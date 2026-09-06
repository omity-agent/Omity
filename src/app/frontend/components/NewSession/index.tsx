import type { AttachmentSettings, PendingAttachment } from "../../../attachments/contract";
import { type EditablePair, MessageStack } from "./MessageStack";
import { Plus, UserRound } from "lucide-react";
import { composerFrame, composerRole } from "../Chat/Composer/layout";
import { scroll, scrollContent, setup } from "./layout";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ActionPanel } from "../Chat/Composer/controls/ActionPanel";
import { IconButton } from "../ParkUI";
import type { InitialSessionState } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { PendingAttachments } from "../Chat/Composer/attachments";
import { ProfilePicker } from "./ProfilePicker";
import { SubmitButton } from "../Chat/Composer/controls/SubmitButton";
import { Toggles } from "./options/Toggles";
import { WorkspacePicker } from "./WorkspacePicker";
import { claimShortId } from "../../../../infrastructure/randomId";
import { useHookSelection } from "./options/selection";
import { useNewSessionDraft } from "./draft";
import { useSessionCreation } from "./creation";
import { useTranslation } from "react-i18next";

export function NewSessionPage({
  attachmentSettings,
  draftSaveDelayMs,
  pageClassName,
  recentWorkspaces,
  availableProfiles,
  selectedProfile,
  workspace,
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
  onCreate: (state: InitialSessionState, attachments: PendingAttachment[]) => Promise<void>;
  onPickWorkspace: () => Promise<string | null>;
  onProfileChange: (profile?: string) => void;
  onWorkspaceChange: (workspace: string) => void;
}) {
  const { t } = useTranslation(),
    hookSelection = useHookSelection(selectedProfile),
    {
      clear: clearDraft,
      content: message,
      flush: flushDraft,
      loading: draftLoading,
      update: setMessage,
    } = useNewSessionDraft(draftSaveDelayMs),
    [pairs, setPairs] = useState<EditablePair[]>([]),
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
      flushDraft,
      hookOverrides: hookSelection.overrides,
      hooksReady: hookSelection.ready,
      message,
      onCreate,
      pairs,
      workspace,
    }),
    complete =
      workspace.trim().length > 0 &&
      message.trim().length > 0 &&
      pairs.every(({ user, assistant }) => user.trim().length > 0 && assistant.trim().length > 0),
    changePair = useCallback(
      (id: string, next: InitialSessionState["history"][number]) => {
        setPairs((current) => current.map((item) => (item.id === id ? { id, ...next } : item)));
      },
      [setPairs],
    ),
    removePair = useCallback(
      (id: string) => {
        setPairs((current) => current.filter((item) => item.id !== id));
      },
      [setPairs],
    ),
    pasteFiles = useCallback(
      (files: File[]) => attachmentsRef.current.paste(files, message),
      [attachmentsRef, message],
    ),
    addPair = useCallback(() => {
      setPairs((current) => {
        const id = claimShortId((candidate) => !current.some((item) => item.id === candidate));
        return [...current, { assistant: "", id, user: "" }];
      });
    }, [setPairs]),
    footer = useMemo(
      () => (
        <span aria-label={t("user")} className={composerRole} title={t("user")}>
          <UserRound aria-hidden size={20} />
        </span>
      ),
      [t],
    );
  return (
    <form className={pageClassName} onSubmit={handleFormSubmit}>
      <div className={scroll} ref={scrollRef}>
        <div className={scrollContent}>
          <div className={setup}>
            <WorkspacePicker
              recentWorkspaces={recentWorkspaces}
              workspace={workspace}
              onChange={onWorkspaceChange}
              onPick={onPickWorkspace}
            />
            <ProfilePicker
              available={availableProfiles}
              selected={selectedProfile}
              onChange={onProfileChange}
            />
            <Toggles disabled={submitting} selection={hookSelection} />
          </div>
          <MessageStack
            pairs={pairs}
            onPairChange={changePair}
            onRemove={removePair}
            onSubmit={handleSubmit}
          />
        </div>
      </div>
      <div className={composerFrame}>
        <MarkdownEditor
          disabled={draftLoading || submitting}
          onChange={setMessage}
          onPasteFiles={attachmentSettings ? pasteFiles : undefined}
          onSubmit={handleSubmit}
          placeholder={t("messagePlaceholder")}
          value={message}
        />
        <ActionPanel footer={footer}>
          <IconButton
            aria-label={t("addMessagePair")}
            disabled={submitting}
            onClick={addPair}
            title={t("addMessagePair")}
            type="button"
          >
            <Plus aria-hidden size={16} />
          </IconButton>
          <SubmitButton
            disabled={draftLoading || !hookSelection.ready || !complete || submitting}
            label={submitting ? t("creating") : t("createAndSend")}
          />
        </ActionPanel>
      </div>
    </form>
  );
}
