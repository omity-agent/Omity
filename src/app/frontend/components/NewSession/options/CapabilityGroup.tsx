import { Badge, Field } from "../../ParkUI";
import { css, cx } from "styled-system/css";
import { useCallback, useId } from "react";
import type { CapabilityOption } from "./preferences";
import { Switch } from "@ark-ui/react/switch";
import { switchRecipe } from "styled-system/recipes";

const classes = switchRecipe({ size: "sm" }),
  group = css({
    background: "surface",
    borderColor: "line",
    borderRadius: "l2",
    borderWidth: "hairline",
    minWidth: "zero",
    padding: "4",
  }),
  legend = css({
    alignItems: "center",
    display: "flex",
    gap: "2",
    paddingInline: "1",
  }),
  list = css({ display: "grid", gap: "3" }),
  row = css({
    alignItems: "start",
    colorPalette: "neutral",
    cursor: "pointer",
    gap: "3",
    minWidth: "zero",
    width: "full",
  }),
  details = css({ display: "grid", gap: "1", minWidth: "zero", overflowWrap: "anywhere" }),
  description = css({ color: "mutedStrong", fontSize: "sm", whiteSpace: "pre-wrap" });
export function CapabilityGroup({
  disabled,
  emptyLabel,
  label,
  onChange,
  options,
}: {
  disabled: boolean;
  emptyLabel: string;
  label: string;
  onChange: (id: string, enable: boolean) => void;
  options: CapabilityOption[];
}) {
  return (
    <Field.Group className={group}>
      <Field.Legend className={legend}>
        {label}
        <Badge>
          {options.filter(({ enable }) => enable).length} / {options.length}
        </Badge>
      </Field.Legend>
      {options.length === 0 ? (
        <span className={description}>{emptyLabel}</span>
      ) : (
        <div className={list}>
          {options.map((option) => (
            <CapabilityToggle
              disabled={disabled}
              key={option.id}
              onChange={onChange}
              option={option}
            />
          ))}
        </div>
      )}
    </Field.Group>
  );
}
function CapabilityToggle({
  option,
  disabled,
  onChange,
}: {
  option: CapabilityOption;
  disabled: boolean;
  onChange: (id: string, enable: boolean) => void;
}) {
  const descriptionId = useId(),
    handleCheckedChange = useCallback(
      ({ checked }: Switch.CheckedChangeDetails) => onChange(option.id, checked),
      [option.id, onChange],
    );
  return (
    <Switch.Root
      checked={option.enable}
      className={cx(classes.root, row)}
      disabled={disabled}
      onCheckedChange={handleCheckedChange}
    >
      <Switch.Control className={classes.control}>
        <Switch.Thumb className={classes.thumb} />
      </Switch.Control>
      <span className={details}>
        <Switch.Label className={classes.label}>{option.id}</Switch.Label>
        {option.description && (
          <span className={description} id={descriptionId}>
            {option.description}
          </span>
        )}
      </span>
      <Switch.HiddenInput
        aria-describedby={option.description ? descriptionId : undefined}
        role="switch"
      />
    </Switch.Root>
  );
}
