import {
  type BadgeVariantProps,
  type ButtonVariantProps,
  type CodeVariantProps,
  type InputVariantProps,
  badge as badgeRecipe,
  button as buttonRecipe,
  code as codeRecipe,
  field as fieldRecipe,
  input as inputRecipe,
} from "styled-system/recipes";
import { type ComponentProps, type ReactNode, createElement } from "react";
import { css, cva, cx } from "styled-system/css";
import { Field as ArkField } from "@ark-ui/react/field";

const fieldClasses = fieldRecipe(),
  compactControl = cva({
    base: {
      _disabled: {
        color: "muted",
        cursor: "not-allowed",
        opacity: 0.4,
      },
      _focusVisible: {
        outlineColor: "mutedStrong",
        outlineOffset: "0.5",
        outlineStyle: "solid",
        outlineWidth: "hairline",
      },
      borderRadius: "l1",
      color: "text",
      minHeight: "controlTarget",
      minWidth: "zero",
      textStyle: "control",
      touchAction: "manipulation",
    },
    defaultVariants: { content: "text" },
    variants: {
      content: {
        icon: { paddingInline: "zero" },
        text: { paddingInline: "3" },
      },
    },
  }),
  surfacedControl = css({
    _disabled: {
      background: "surface",
      borderColor: "line",
      color: "muted",
    },
    _hover: { background: "controlHover" },
    background: "control",
    borderColor: "lineStrong",
  }),
  compactBadge = css({
    background: "surfaceRaised",
    borderColor: "lineStrong",
    borderRadius: "l1",
    color: "mutedStrong",
    display: "inline-flex",
    textStyle: "badge",
    width: "fitContent",
  }),
  compactCode = css({
    background: "surfaceInset",
    borderColor: "line",
    borderRadius: "l1",
    borderWidth: "hairline",
    color: "text",
    fontFamily: "mono",
  });
interface ControlContent {
  iconOnly?: boolean;
}
type ButtonProps = ComponentProps<"button"> & ButtonVariantProps & ControlContent;
type LinkButtonProps = ComponentProps<"a"> & ButtonVariantProps & ControlContent;
export function Button({
  className,
  iconOnly = false,
  size = "sm",
  variant = "outline",
  ...props
}: ButtonProps) {
  return createElement("button", {
    ...props,
    className: cx(
      buttonRecipe({ size, variant }),
      compactControl({ content: iconOnly ? "icon" : "text" }),
      variant !== "ghost" && surfacedControl,
      className,
    ),
  });
}
export function LinkButton({
  className,
  iconOnly = false,
  size = "sm",
  variant = "outline",
  ...props
}: LinkButtonProps) {
  return createElement("a", {
    ...props,
    className: cx(
      buttonRecipe({ size, variant }),
      compactControl({ content: iconOnly ? "icon" : "text" }),
      variant !== "ghost" && surfacedControl,
      className,
    ),
  });
}
export function IconButton(props: ButtonProps) {
  const className = css({
    _disabled: {
      _hover: {
        background: "surfaceInset",
        borderColor: "line",
        color: "muted",
      },
      background: "surfaceInset",
      borderColor: "line",
      color: "muted",
      opacity: 0.55,
    },
    height: "controlTarget",
    minWidth: "controlTarget",
    padding: "zero",
    width: "controlTarget",
  });
  return createElement(Button, {
    size: "sm",
    variant: "outline",
    ...props,
    className: cx(className, props.className),
    iconOnly: true,
  });
}
type InputProps = Omit<ComponentProps<typeof ArkField.Input>, "name" | "size"> &
  InputVariantProps & { name: string };
const inputText = css({ fontSize: "editor" });
export function Input({ className, size = "sm", ...props }: InputProps) {
  return createElement(ArkField.Input, {
    ...props,
    className: cx(inputRecipe({ size }), compactControl(), surfacedControl, inputText, className),
  });
}
type SelectProps = Omit<ComponentProps<typeof ArkField.Select>, "name" | "size"> &
  InputVariantProps & { name: string };
export function Select({ className, size = "sm", ...props }: SelectProps) {
  return createElement(ArkField.Select, {
    ...props,
    className: cx(inputRecipe({ size }), compactControl(), surfacedControl, inputText, className),
  });
}
function FieldRoot({ className, ...props }: ComponentProps<typeof ArkField.Root>) {
  return createElement(ArkField.Root, { ...props, className: cx(fieldClasses.root, className) });
}
function FieldLabel({ className, ...props }: ComponentProps<typeof ArkField.Label>) {
  return createElement(ArkField.Label, { ...props, className: cx(fieldClasses.label, className) });
}
function FieldGroup({ className, ...props }: ComponentProps<"fieldset">) {
  return createElement("fieldset", { ...props, className: cx(fieldClasses.root, className) });
}
function FieldLegend({ className, ...props }: ComponentProps<"legend">) {
  return createElement("legend", { ...props, className: cx(fieldClasses.label, className) });
}
export const Field = {
  Group: FieldGroup,
  Label: FieldLabel,
  Legend: FieldLegend,
  Root: FieldRoot,
};
type BadgeProps = ComponentProps<"span"> & BadgeVariantProps;
export function Badge({ className, size = "sm", variant = "outline", ...props }: BadgeProps) {
  return createElement("span", {
    ...props,
    className: cx(badgeRecipe({ size, variant }), compactBadge, className),
  });
}
type CodeProps = ComponentProps<"code"> &
  CodeVariantProps & {
    children: ReactNode;
  };
export function Code({ className, size = "sm", variant = "ghost", ...props }: CodeProps) {
  return createElement("code", {
    ...props,
    className: cx(codeRecipe({ size, variant }), compactCode, className),
  });
}
