import { Button, Field, Input } from "../ParkUI";
import { type ChangeEvent, useCallback, useState } from "react";
import { Check, FolderOpen, History } from "lucide-react";
import { css, cx } from "styled-system/css";
import { reportPromiseErrors } from "../../services/errors";
import { useTranslation } from "react-i18next";

const row = css({
    display: "grid",
    gap: "2",
    gridTemplateColumns: {
      base: "minmax(0, 1fr)",
      sm: "minmax(0, 1fr) auto",
    },
    minWidth: "zero",
  }),
  pathInput = css({ minWidth: "zero", textOverflow: "ellipsis" }),
  recent = css({
    display: "grid",
    gap: "2",
    gridTemplateColumns: "minmax(0, 1fr)",
    minWidth: "zero",
  }),
  recentLabel = css({ color: "muted", fontSize: "xs" }),
  recentItem = css({ flexGrow: { base: 1, sm: 0 } }),
  recentList = css({
    display: "flex",
    flexWrap: "wrap",
    gap: "2",
    minWidth: "zero",
  }),
  recentButton = css({ maxWidth: "full", minWidth: "zero" }),
  recentPath = css({
    minWidth: "zero",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
async function pickWorkspace(
  onPick: () => Promise<string | null>,
  onChange: (workspace: string) => void,
  setPicking: (picking: boolean) => void,
) {
  setPicking(true);
  try {
    const selected = await onPick();
    if (selected) {
      onChange(selected);
    }
  } finally {
    setPicking(false);
  }
}
export function WorkspacePicker({
  recentWorkspaces,
  className,
  disabled = false,
  workspace,
  onChange,
  onPick,
}: {
  className?: string;
  disabled?: boolean;
  recentWorkspaces: string[];
  workspace: string;
  onChange: (workspace: string) => void;
  onPick: () => Promise<string | null>;
}) {
  const { t } = useTranslation(),
    [picking, setPicking] = useState(false),
    handlePick = useCallback(() => {
      reportPromiseErrors(pickWorkspace(onPick, onChange, setPicking));
    }, [onChange, onPick, setPicking]),
    handleInputChange = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => {
        onChange(event.currentTarget.value);
      },
      [onChange],
    );
  return (
    <Field.Root className={className} disabled={disabled}>
      <Field.Label>{t("workspace")}</Field.Label>
      <span className={row}>
        <Input
          className={pathInput}
          name="workspace"
          value={workspace}
          onChange={handleInputChange}
        />
        <Button disabled={disabled || picking} onClick={handlePick} type="button">
          <FolderOpen size={14} /> {t("chooseFolder")}
        </Button>
      </span>
      {recentWorkspaces.length > 0 ? (
        <div className={recent}>
          <span className={recentLabel}>{t("recentWorkspaces")}</span>
          <div className={recentList}>
            {recentWorkspaces.map((item) => (
              <RecentWorkspaceButton
                disabled={disabled}
                item={item}
                key={item}
                selected={item === workspace}
                onChange={onChange}
              />
            ))}
          </div>
        </div>
      ) : null}
    </Field.Root>
  );
}
function RecentWorkspaceButton({
  disabled,
  item,
  selected,
  onChange,
}: {
  disabled: boolean;
  item: string;
  selected: boolean;
  onChange: (workspace: string) => void;
}) {
  const select = useCallback(() => {
    onChange(item);
  }, [item, onChange]);
  return (
    <Button
      aria-pressed={selected}
      className={cx(recentButton, recentItem)}
      disabled={disabled}
      onClick={select}
      title={item}
      type="button"
    >
      {selected ? <Check size={14} /> : <History size={14} />}
      <span className={recentPath}>{item}</span>
    </Button>
  );
}
