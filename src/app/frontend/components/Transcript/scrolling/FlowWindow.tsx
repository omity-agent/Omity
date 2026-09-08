import type { CustomContainerComponentProps, CustomItemComponentProps } from "virtua";
import type { CSSProperties } from "react";
import { css } from "styled-system/css";

const row = css({
  // Only the first mounted row consumes the virtual offset; siblings flow together.
  "&:first-child": { mt: "var(--window-offset)" },
  flexShrink: 0,
});
function flowStyle(style: CSSProperties): CSSProperties {
  return { ...style, display: "flex", flexDirection: "column" };
}
function rowStyle(
  style: CSSProperties,
  top: number,
): CSSProperties & { "--window-offset": string } {
  return { ...style, "--window-offset": `${top.toString()}px`, position: "relative" };
}
export function FlowWindow({ children, ref, style }: CustomContainerComponentProps) {
  return (
    <div ref={ref} style={flowStyle(style)}>
      {children}
    </div>
  );
}
export function FlowItem({ children, ref, style }: CustomItemComponentProps) {
  const { top, ...geometry } = style;
  if (typeof top !== "number") {
    throw new Error("对话虚拟行缺少垂直偏移量");
  }
  const placement = rowStyle(geometry, top);
  return (
    <div className={row} ref={ref} style={placement}>
      {children}
    </div>
  );
}
