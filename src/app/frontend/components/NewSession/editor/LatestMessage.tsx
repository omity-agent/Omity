import { Plus, UserRound } from "lucide-react";
import { composerFrame, composerRole } from "../../Chat/Composer/layout";
import { ActionPanel } from "../../Chat/Composer/controls/ActionPanel";
import { IconButton } from "../../ParkUI";
import { MarkdownEditor } from "../../Chat/MarkdownEditor";
import { SubmitButton } from "../../Chat/Composer/controls/SubmitButton";
import { useInputNavigation } from "./inputNavigation";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";

export function LatestMessage({
  disabled,
  message,
  submitDisabled,
  submitting,
  userMessages,
  onAddPair,
  onChange,
  onPasteFiles,
  onSubmit,
}: {
  disabled: boolean;
  message: string;
  submitDisabled: boolean;
  submitting: boolean;
  userMessages: readonly string[];
  onAddPair: () => void;
  onChange: (content: string) => void;
  onPasteFiles?: (files: File[]) => string | undefined;
  onSubmit: () => void;
}) {
  const { t } = useTranslation(),
    { change, navigateHistory } = useInputNavigation(message, onChange, userMessages),
    footer = useMemo(
      () => (
        <span aria-label={t("user")} className={composerRole} title={t("user")}>
          <UserRound aria-hidden size={20} />
        </span>
      ),
      [t],
    );
  return (
    <div className={composerFrame}>
      <MarkdownEditor
        disabled={disabled}
        label={t("user")}
        onChange={change}
        onHistoryNavigate={navigateHistory}
        onPasteFiles={onPasteFiles}
        onSubmit={onSubmit}
        placeholder={t("messagePlaceholder")}
        value={message}
      />
      <ActionPanel footer={footer}>
        <IconButton
          aria-label={t("addMessagePair")}
          disabled={disabled}
          onClick={onAddPair}
          title={t("addMessagePair")}
          type="button"
        >
          <Plus aria-hidden size={16} />
        </IconButton>
        <SubmitButton
          disabled={submitDisabled}
          label={submitting ? t("creating") : t("createAndSend")}
        />
      </ActionPanel>
    </div>
  );
}
