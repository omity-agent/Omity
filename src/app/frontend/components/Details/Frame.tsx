import { ChevronUp, type LucideIcon } from "lucide-react";
import { Collapsible } from "@ark-ui/react/collapsible";
import type { ReactNode } from "react";
import { sva } from "styled-system/css";
import { useDisclosure } from "../Transcript/disclosures";

const frame = sva({
  base: {
    accessory: { alignItems: "center", display: "flex", flexShrink: 0 },
    content: {
      _closed: {
        _motionReduce: { animation: "none" },
        animation: "detailCollapse",
      },
      _open: {
        _motionReduce: { animation: "none" },
        animation: "detailExpand",
      },
      overflow: "hidden",
    },
    disclosure: {
      'button[data-state="open"] &': { transform: "rotate(180deg)" },
      color: "muted",
      flexShrink: 0,
      transition: "transform 120ms ease",
    },
    header: {
      _hover: { bg: "controlHover" },
      alignItems: "center",
      display: "flex",
      h: "detailHeader",
      maxW: "full",
      minH: { _coarse: "11" },
      px: "2",
    },
    icon: { flexShrink: 0 },
    root: {
      "& pre": { m: 0, maxW: "full" },
      color: "muted",
      fontSize: "sm",
      maxW: "full",
      minW: 0,
      mt: "-2",
      p: 0,
      w: "full",
    },
    title: {
      color: "mutedStrong",
      flex: "1",
      lineHeight: "normal",
      minW: 0,
      overflow: "hidden",
      textOverflow: "ellipsis",
      whiteSpace: "nowrap",
    },
    trigger: {
      alignItems: "center",
      appearance: "none",
      bg: "transparent",
      borderWidth: 0,
      color: "muted",
      cursor: "pointer",
      display: "flex",
      flex: "1",
      font: "inherit",
      gap: "2",
      h: "full",
      maxW: "full",
      minW: 0,
      p: 0,
      textAlign: "left",
    },
  },
  slots: ["root", "header", "trigger", "disclosure", "icon", "title", "accessory", "content"],
  variants: {
    tone: {
      model: {
        icon: { color: "statusModel" },
      },
      tool: {
        icon: { color: "statusTool" },
      },
    },
  },
});
export function Frame({
  accessory,
  children,
  expandedInitially,
  icon: Icon,
  label,
  stateKey,
  title,
  tone,
}: {
  accessory?: ReactNode;
  children: ReactNode;
  expandedInitially: boolean;
  icon: LucideIcon;
  label: string;
  stateKey: string;
  title?: ReactNode;
  tone: "model" | "tool";
}) {
  const classes = frame({ tone }),
    { open, onOpenChange, registerDetail } = useDisclosure(stateKey, expandedInitially);
  return (
    <Collapsible.Root
      className={classes.root}
      open={open}
      onOpenChange={onOpenChange}
      ref={registerDetail}
      lazyMount
      unmountOnExit
    >
      <Collapsible.Content className={classes.content}>{children}</Collapsible.Content>
      <div className={classes.header}>
        <Collapsible.Trigger aria-label={label} className={classes.trigger}>
          <ChevronUp aria-hidden className={classes.disclosure} size={12} />
          <Icon className={classes.icon} size={13} />
          {title ? <span className={classes.title}>{title}</span> : null}
        </Collapsible.Trigger>
        {accessory ? <div className={classes.accessory}>{accessory}</div> : null}
      </div>
    </Collapsible.Root>
  );
}
