import { type ChangeEvent, useCallback } from "react";
import { Field, Select } from "../ParkUI";
import { useTranslation } from "react-i18next";

export function ProfilePicker({
  available,
  disabled = false,
  selected,
  onChange,
}: {
  available: string[];
  disabled?: boolean;
  selected?: string;
  onChange: (profile?: string) => void;
}) {
  const { t } = useTranslation(),
    change = useCallback(
      (event: ChangeEvent<HTMLSelectElement>) => {
        onChange(event.target.value || undefined);
      },
      [onChange],
    );
  return (
    <Field.Root disabled={disabled}>
      <Field.Label>{t("profile")}</Field.Label>
      <Select name="profile" onChange={change} value={selected ?? ""}>
        <option value="">{t("defaultProfile")}</option>
        {available.map((name) => (
          <option key={name} value={name}>
            {name}
          </option>
        ))}
      </Select>
    </Field.Root>
  );
}
