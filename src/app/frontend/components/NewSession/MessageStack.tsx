import { Bot, Trash2, UserRound } from "lucide-react";
import { composerFrame, composerRole } from "../Chat/Composer/layout";
import { useCallback, useMemo } from "react";
import { ActionPanel } from "../Chat/Composer/controls/ActionPanel";
import { IconButton } from "../ParkUI";
import type { InitialMessagePair } from "../../../initialState";
import { MarkdownEditor } from "../Chat/MarkdownEditor";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

export interface EditablePair extends InitialMessagePair {
  id: string;
}
const stack = css({ alignSelf: "end" });
export function MessageStack({
  pairs,
  onPairChange,
  onRemove,
  onSubmit,
}: {
  pairs: EditablePair[];
  onPairChange: (id: string, pair: InitialMessagePair) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={stack}>
      {pairs.map((item) => (
        <MessagePairEditor
          assistantLabel={t("assistant")}
          item={item}
          key={item.id}
          userLabel={t("user")}
          onPairChange={onPairChange}
          onRemove={onRemove}
          onSubmit={onSubmit}
        />
      ))}
    </div>
  );
}
function MessagePairEditor({
  assistantLabel,
  item,
  userLabel,
  onPairChange,
  onRemove,
  onSubmit,
}: {
  assistantLabel: string;
  item: EditablePair;
  userLabel: string;
  onPairChange: (id: string, pair: InitialMessagePair) => void;
  onRemove: (id: string) => void;
  onSubmit: () => void;
}) {
  const changeUser = useCallback(
      (user: string) => {
        onPairChange(item.id, { ...item, user });
      },
      [item, onPairChange],
    ),
    changeAssistant = useCallback(
      (assistant: string) => {
        onPairChange(item.id, { ...item, assistant });
      },
      [item, onPairChange],
    ),
    remove = useCallback(() => {
      onRemove(item.id);
    }, [item.id, onRemove]);
  return (
    <section>
      <MessageEditor
        label={userLabel}
        role="user"
        value={item.user}
        onChange={changeUser}
        onSubmit={onSubmit}
      />
      <MessageEditor
        label={assistantLabel}
        role="assistant"
        value={item.assistant}
        onChange={changeAssistant}
        onRemove={remove}
        onSubmit={onSubmit}
      />
    </section>
  );
}
function MessageEditor({
  label,
  role,
  value,
  onChange,
  onRemove,
  onSubmit,
}: {
  label: string;
  role: "user" | "assistant";
  value: string;
  onChange: (value: string) => void;
  onRemove?: () => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation(),
    RoleIcon = role === "user" ? UserRound : Bot,
    footer = useMemo(
      () => (
        <span aria-label={label} className={composerRole} title={label}>
          <RoleIcon aria-hidden size={20} />
        </span>
      ),
      [label, RoleIcon],
    );
  return (
    <div className={composerFrame}>
      <MarkdownEditor
        disabled={false}
        label={label}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder=""
        value={value}
      />
      <ActionPanel footer={footer}>
        {onRemove ? (
          <IconButton
            aria-label={t("removeMessagePair")}
            onClick={onRemove}
            title={t("removeMessagePair")}
            type="button"
          >
            <Trash2 aria-hidden size={16} />
          </IconButton>
        ) : null}
      </ActionPanel>
    </div>
  );
}
