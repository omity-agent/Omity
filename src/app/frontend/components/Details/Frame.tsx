/* oxlint-disable @pandacss/no-descendant-selectors -- The frame styles generated pre content and owns disclosure state. */
/* oxlint-disable @pandacss/no-margin-properties -- The detail overlap aligns content with its disclosure header. */
import { ChevronUp, type LucideIcon } from "lucide-react";
import { css, cx, sva } from "styled-system/css";
import { Collapsible } from "@ark-ui/react/collapsible";
import type { ReactNode } from "react";
import { useDisclosure } from "../Transcript/disclosures";

const openDisclosure = css({ transform: "rotate(180deg)" }),
  frame = sva({
    base: {
      accessory: { alignItems: "center", display: "flex", flexShrink: 0 },
      content: {
        _closed: {
          _motionReduce: { animation: "disabled" },
          animation: "detailCollapse",
        },
        _open: {
          _motionReduce: { animation: "disabled" },
          animation: "detailExpand",
        },
        overflow: "hidden",
      },
      disclosure: {
        color: "muted",
        flexShrink: 0,
        height: "smallIcon",
        transition: "[transform 120ms ease]",
        width: "smallIcon",
      },
      header: {
        _hover: { background: "controlHover" },
        alignItems: "center",
        display: "flex",
        height: "detailHeader",
        maxWidth: "full",
        minHeight: "controlTarget",
        paddingInline: "2",
        position: "relative",
        zIndex: "base",
      },
      icon: { flexShrink: 0, height: "smallIcon", width: "smallIcon" },
      root: {
        "& pre": { maxWidth: "full" },
        color: "muted",
        fontSize: "interface",
        marginBlockStart: "detailOverlap",
        maxWidth: "full",
        minWidth: "zero",
        padding: "zero",
        width: "full",
      },
      title: {
        color: "mutedStrong",
        flexBasis: "zero",
        flexGrow: 1,
        flexShrink: 1,
        lineHeight: "normal",
        minWidth: "zero",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
      },
      trigger: {
        alignItems: "center",
        appearance: "none",
        background: "clear",
        borderWidth: "zero",
        color: "muted",
        cursor: "pointer",
        display: "flex",
        flexBasis: "zero",
        flexGrow: 1,
        flexShrink: 1,
        font: "inherit",
        gap: "2",
        height: "full",
        maxWidth: "full",
        minWidth: "zero",
        padding: "zero",
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
    { onOpenChange, open, registerDetail } = useDisclosure(stateKey, expandedInitially);
  return (
    <Collapsible.Root
      className={classes.root}
      onOpenChange={onOpenChange}
      open={open}
      ref={registerDetail}
      lazyMount
      unmountOnExit
    >
      <Collapsible.Content className={classes.content}>{children}</Collapsible.Content>
      <div className={classes.header}>
        <Collapsible.Trigger aria-label={label} className={classes.trigger} type="button">
          <ChevronUp
            aria-hidden
            className={cx(classes.disclosure, open && openDisclosure)}
            size={12}
          />
          <Icon className={classes.icon} size={13} />
          {title ? <span className={classes.title}>{title}</span> : null}
        </Collapsible.Trigger>
        {accessory ? <div className={classes.accessory}>{accessory}</div> : null}
      </div>
    </Collapsible.Root>
  );
}
