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
import { css, cx } from "styled-system/css";

const fieldClasses = fieldRecipe(),
  compactControl = css({
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
type ButtonProps = ComponentProps<"button"> & ButtonVariantProps;
type LinkButtonProps = ComponentProps<"a"> & ButtonVariantProps;
export function Button({ className, size = "sm", variant = "outline", ...props }: ButtonProps) {
  return createElement("button", {
    ...props,
    className: cx(
      buttonRecipe({ size, variant }),
      compactControl,
      variant !== "ghost" && surfacedControl,
      className,
    ),
  });
}
export function LinkButton({
  className,
  size = "sm",
  variant = "outline",
  ...props
}: LinkButtonProps) {
  return createElement("a", {
    ...props,
    className: cx(
      buttonRecipe({ size, variant }),
      compactControl,
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
  });
}
type InputProps = Omit<ComponentProps<"input">, "size"> & InputVariantProps;
const inputText = css({ fontSize: "editor" });
export function Input({ className, size = "sm", ...props }: InputProps) {
  return createElement("input", {
    ...props,
    className: cx(inputRecipe({ size }), compactControl, surfacedControl, inputText, className),
  });
}
type SelectProps = Omit<ComponentProps<"select">, "size"> & InputVariantProps;
export function Select({ className, size = "sm", ...props }: SelectProps) {
  return createElement("select", {
    ...props,
    className: cx(inputRecipe({ size }), compactControl, surfacedControl, inputText, className),
  });
}
function FieldRoot({ className, ...props }: ComponentProps<"div">) {
  return createElement("div", { ...props, className: cx(fieldClasses.root, className) });
}
function FieldLabel({ className, ...props }: ComponentProps<"span">) {
  return createElement("span", { ...props, className: cx(fieldClasses.label, className) });
}
export const Field = {
  Label: FieldLabel,
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
