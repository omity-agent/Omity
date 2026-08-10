import { Checkbox, RadioGroup } from "@ark-ui/react";
import { checkbox, radioGroup } from "styled-system/recipes";
import { css, cx } from "styled-system/css";
import type { AskUserQuestion } from "../../toolActions";
import { Check } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

const checkboxClasses = checkbox(),
  radioClasses = radioGroup(),
  optionList = css({ display: "grid", gap: "2" }),
  optionRoot = css({
    _hover: { bg: "controlHover" },
    alignItems: "center",
    cursor: "pointer",
    display: "flex",
    gap: "2",
    minH: "10",
    p: "2",
  }),
  optionControl = css({
    alignItems: "center",
    borderColor: "lineStrong",
    borderWidth: "1px",
    color: "text",
    display: "inline-flex",
    flex: "0 0 auto",
    h: "5",
    justifyContent: "center",
    w: "5",
  }),
  optionIndicator = css({ display: "inline-flex" }),
  optionLabel = css({ color: "mutedStrong", fontSize: "xs", m: 0 }),
  radioControl = cx(optionControl, css({ borderRadius: "full" })),
  radioIndicator = css({
    bg: "text",
    borderRadius: "full",
    h: "2.5",
    w: "2.5",
  });
type ChoiceQuestion = Extract<AskUserQuestion, { kind: "choice" }>;

export function ChoiceOptions({
  question,
  selectedOptions,
  onOptionsChange,
}: {
  question: ChoiceQuestion;
  selectedOptions: string[];
  onOptionsChange: (options: string[]) => void;
}) {
  const { t } = useTranslation(),
    handleRadioChange = useCallback(
      ({ value }: { value: string | null }) => onOptionsChange(value ? [value] : []),
      [onOptionsChange],
    );
  if (question.multiple) {
    return (
      <div className={optionList}>
        {question.options.map((option) => (
          <MultipleOption
            key={option}
            option={option}
            selectedOptions={selectedOptions}
            onOptionsChange={onOptionsChange}
          />
        ))}
      </div>
    );
  }
  return (
    <RadioGroup.Root
      className={radioClasses.root}
      onValueChange={handleRadioChange}
      value={selectedOptions[0] ?? ""}
    >
      <RadioGroup.Label className={cx(radioClasses.label, optionLabel)}>
        {t("selectOne")}
      </RadioGroup.Label>
      <div className={optionList}>
        {question.options.map((option) => (
          <RadioGroup.Item
            className={cx(radioClasses.item, optionRoot)}
            key={option}
            value={option}
          >
            <RadioGroup.ItemHiddenInput />
            <RadioGroup.ItemControl className={cx(radioClasses.itemControl, radioControl)}>
              <span aria-hidden="true" className={radioIndicator} />
            </RadioGroup.ItemControl>
            <RadioGroup.ItemText className={radioClasses.itemText}>{option}</RadioGroup.ItemText>
          </RadioGroup.Item>
        ))}
      </div>
    </RadioGroup.Root>
  );
}
function MultipleOption({
  option,
  selectedOptions,
  onOptionsChange,
}: {
  option: string;
  selectedOptions: string[];
  onOptionsChange: (options: string[]) => void;
}) {
  const handleCheckedChange = useCallback(
    ({ checked }: { checked: boolean | "indeterminate" }) => {
      const next = new Set(selectedOptions);
      if (checked === true) {
        next.add(option);
      } else {
        next.delete(option);
      }
      onOptionsChange([...next]);
    },
    [onOptionsChange, option, selectedOptions],
  );
  return (
    <Checkbox.Root
      checked={selectedOptions.includes(option)}
      className={cx(checkboxClasses.root, optionRoot)}
      onCheckedChange={handleCheckedChange}
    >
      <Checkbox.HiddenInput />
      <Checkbox.Control className={cx(checkboxClasses.control, optionControl)}>
        <Checkbox.Indicator className={cx(checkboxClasses.indicator, optionIndicator)}>
          <Check size={14} />
        </Checkbox.Indicator>
      </Checkbox.Control>
      <Checkbox.Label className={checkboxClasses.label}>{option}</Checkbox.Label>
    </Checkbox.Root>
  );
}
