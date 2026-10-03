import { type ChangeEvent, useCallback, useId } from "react";
import { Field, Input } from "../../ParkUI";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

const hint = css({ color: "muted", fontSize: "xs" }),
  error = css({ color: "statusError", fontSize: "xs" });
export function ModelInput({
  disabled,
  model,
  onChange,
}: {
  disabled: boolean;
  model: string;
  onChange: (model: string) => void;
}) {
  const { t } = useTranslation(),
    descriptionId = useId(),
    invalid = !disabled && model.trim().length === 0,
    change = useCallback(
      (event: ChangeEvent<HTMLInputElement>) => onChange(event.currentTarget.value),
      [onChange],
    );
  return (
    <Field.Root disabled={disabled} invalid={invalid}>
      <Field.Label>{t("model")}</Field.Label>
      <Input
        aria-describedby={descriptionId}
        autoCapitalize="none"
        autoComplete="off"
        name="model"
        onChange={change}
        required
        spellCheck={false}
        value={model}
      />
      <span className={invalid ? error : hint} id={descriptionId}>
        {t(invalid ? "modelRequired" : "modelDescription")}
      </span>
    </Field.Root>
  );
}
