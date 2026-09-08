import { Button, Field } from "../../ParkUI";
import type { HookOption, useHookSelection } from "./selection";
import { css, cx } from "styled-system/css";
import { useCallback, useId } from "react";
import { Switch } from "@ark-ui/react/switch";
import { reportPromiseErrors } from "../../../services/errors";
import { switchRecipe } from "styled-system/recipes";
import { useTranslation } from "react-i18next";

const classes = switchRecipe({ size: "sm" }),
  list = css({ display: "grid", gap: "3" }),
  row = css({
    alignItems: "start",
    cursor: "pointer",
    gap: "3",
    minW: 0,
    w: "full",
  }),
  details = css({ display: "grid", gap: "1", minW: 0, overflowWrap: "anywhere" }),
  description = css({ color: "mutedStrong", fontSize: "sm", whiteSpace: "pre-wrap" });
export function Toggles({
  selection,
  disabled,
}: {
  selection: ReturnType<typeof useHookSelection>;
  disabled: boolean;
}) {
  const { t } = useTranslation(),
    handleRetry = useCallback(() => reportPromiseErrors(selection.reload()), [selection]);
  return (
    <Field.Root>
      <Field.Label>{t("hooks")}</Field.Label>
      {selection.error ? (
        <div role="alert">
          <p>{t("hookLoadFailed", { message: selection.error.message })}</p>
          <Button onClick={handleRetry} disabled={disabled} type="button">
            {t("retry")}
          </Button>
        </div>
      ) : !selection.ready ? (
        <span role="status">{t("loadingHooks")}</span>
      ) : selection.hooks.length === 0 ? (
        <span className={description}>{t("noHooks")}</span>
      ) : (
        <div className={list}>
          {selection.hooks.map((hook) => (
            <HookToggle
              disabled={disabled}
              hook={hook}
              key={hook.id}
              onChange={selection.handleChange}
            />
          ))}
        </div>
      )}
    </Field.Root>
  );
}
function HookToggle({
  hook,
  disabled,
  onChange,
}: {
  hook: HookOption;
  disabled: boolean;
  onChange: (id: string, enable: boolean) => void;
}) {
  const descriptionId = useId(),
    handleCheckedChange = useCallback(
      ({ checked }: Switch.CheckedChangeDetails) => onChange(hook.id, checked),
      [hook.id, onChange],
    );
  return (
    <Switch.Root
      checked={hook.enable}
      className={cx(classes.root, row)}
      disabled={disabled}
      onCheckedChange={handleCheckedChange}
    >
      <Switch.Control className={classes.control}>
        <Switch.Thumb className={classes.thumb} />
      </Switch.Control>
      <span className={details}>
        <Switch.Label className={classes.label}>{hook.id}</Switch.Label>
        {hook.description && (
          <span className={description} id={descriptionId}>
            {hook.description}
          </span>
        )}
      </span>
      <Switch.HiddenInput
        aria-describedby={hook.description ? descriptionId : undefined}
        role="switch"
      />
    </Switch.Root>
  );
}
