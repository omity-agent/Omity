import {
  type BadgeVariantProps,
  type ButtonVariantProps,
  type CodeVariantProps,
  type InputVariantProps,
  type TextareaVariantProps,
  badge as badgeRecipe,
  button as buttonRecipe,
  code as codeRecipe,
  field as fieldRecipe,
  input as inputRecipe,
  textarea as textareaRecipe,
} from "styled-system/recipes";
import { type ComponentProps, type ReactNode, createElement } from "react";
import { css, cx } from "styled-system/css";

const fieldClasses = fieldRecipe();
const compactControl = css({
  _disabled: {
    color: "muted",
    cursor: "not-allowed",
    opacity: 0.4,
  },
  _focusVisible: {
    outlineColor: "mutedStrong",
    outlineOffset: "2px",
    outlineStyle: "solid",
    outlineWidth: "1px",
  },
  borderRadius: "0",
  color: "text",
  fontFamily: "body",
  fontWeight: "normal",
  minH: { _coarse: "11" },
  minW: 0,
  touchAction: "manipulation",
});
const surfacedControl = css({
  _disabled: {
    bg: "surface",
    borderColor: "line",
    color: "muted",
  },
  _hover: { bg: "controlHover" },
  bg: "control",
  borderColor: "lineStrong",
});
const compactBadge = css({
  bg: "surfaceRaised",
  borderColor: "lineStrong",
  borderRadius: "0",
  color: "mutedStrong",
  display: "inline-flex",
  fontFamily: "body",
  fontWeight: "normal",
  w: "fit-content",
});
const compactCode = css({
  bg: "surfaceInset",
  borderColor: "line",
  borderRadius: "0",
  borderWidth: "1px",
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
        bg: "surfaceInset",
        borderColor: "line",
        color: "muted",
      },
      bg: "surfaceInset",
      borderColor: "line",
      color: "muted",
      opacity: 0.55,
    },
    h: { _coarse: "11", base: "8" },
    minW: { _coarse: "11", base: "8" },
    p: "0",
    w: { _coarse: "11", base: "8" },
  });
  return createElement(Button, {
    size: "sm",
    variant: "outline",
    ...props,
    className: cx(className, props.className),
  });
}
type InputProps = Omit<ComponentProps<"input">, "size"> & InputVariantProps;
export function Input({ className, size = "sm", ...props }: InputProps) {
  return createElement("input", {
    ...props,
    className: cx(inputRecipe({ size }), compactControl, surfacedControl, className),
  });
}
type SelectProps = Omit<ComponentProps<"select">, "size"> & InputVariantProps;
export function Select({ className, size = "sm", ...props }: SelectProps) {
  return createElement("select", {
    ...props,
    className: cx(inputRecipe({ size }), compactControl, surfacedControl, className),
  });
}
type TextareaProps = ComponentProps<"textarea"> & TextareaVariantProps;
export function Textarea({ className, size = "md", ...props }: TextareaProps) {
  return createElement("textarea", {
    ...props,
    className: cx(textareaRecipe({ size }), compactControl, surfacedControl, className),
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
