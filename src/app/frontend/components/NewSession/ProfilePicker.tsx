import { type ChangeEvent, useCallback } from "react";
import { Field, Select } from "../ParkUI";
import { useTranslation } from "react-i18next";

export function ProfilePicker({
  available,
  selected,
  onChange,
}: {
  available: string[];
  selected?: string;
  onChange: (profile?: string) => void;
}) {
  const { t } = useTranslation();
  const change = useCallback(
    (event: ChangeEvent<HTMLSelectElement>) => {
      onChange(event.target.value || undefined);
    },
    [onChange],
  );
  return (
    <Field.Root>
      <Field.Label>{t("profile")}</Field.Label>
      <Select onChange={change} value={selected ?? ""}>
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
