/* oxlint-disable @pandacss/no-margin-properties -- Message separation is part of the transcript layout. */
import type { ReasoningTranslation, TimelineMessage } from "../../../timeline";
import { css, cva, cx } from "styled-system/css";
import { Body } from "../Transcript/Body";
import { CopyButton } from "./CopyButton";
import { GitFork } from "lucide-react";
import { IconButton } from "../ParkUI";
import { reportPromiseErrors } from "../../services/errors";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

const row = css({
    '&[data-last="true"]': { marginBlockEnd: "4" },
    alignItems: "start",
    display: "flex",
    gap: "2",
    minWidth: "zero",
    width: "full",
  }),
  inputRow = css({ justifyContent: "flex-end" }),
  forkButton = css({
    borderWidth: "zero",
    flexShrink: 0,
  }),
  message = cva({
    base: {
      '&[data-first="false"]': { borderBlockStartWidth: "zero", paddingBlockStart: "3" },
      '&[data-last="false"]': { borderBlockEndWidth: "zero", paddingBlockEnd: "zero" },
      background: "surface",
      borderColor: "line",
      borderWidth: "hairline",
      display: "grid",
      gap: "3",
      justifyItems: "start",
      maxWidth: "content",
      minWidth: "zero",
      padding: { base: "3", md: "4" },
      textAlign: "left",
      width: "fitContent",
    },
    variants: {
      pending: {
        true: { opacity: 0.55 },
      },
      role: {
        assistant: { maxWidth: { base: "full", lg: "twoThirds" }, width: "full" },
        tool: {},
        user: {
          background: "surfaceRaised",
          borderColor: "lineStrong",
          maxHeight: "messageLimit",
          maxWidth: { base: "full", lg: "twoThirds" },
          overflowY: "auto",
          overscrollBehaviorY: "contain",
          scrollbarGutter: "stable",
        },
      },
    },
  }),
  roleTone = cva({
    variants: {
      role: {
        assistant: { color: "statusModel" },
        tool: { color: "statusTool" },
        user: { color: "statusPaused" },
      },
    },
  }),
  header = css({
    alignItems: "center",
    display: "flex",
    insetBlockStart: "zero",
    justifyContent: "flex-end",
    minHeight: "8",
    pointerEvents: "none",
    position: "sticky",
    width: "full",
    zIndex: "base",
  }),
  actions = cva({
    base: {
      alignItems: "center",
      display: "flex",
      gap: "1",
      pointerEvents: "auto",
    },
    variants: {
      role: {
        assistant: { background: "surface" },
        tool: { background: "surface" },
        user: { background: "surfaceRaised" },
      },
    },
  });
export function Message({
  canFork,
  forkDisabled,
  item,
  liveTranslation,
  latestReasoningIndex,
  latestToolIndex,
  onCancelTool,
  onFork,
  partIndex,
}: {
  canFork: boolean;
  forkDisabled: boolean;
  item: TimelineMessage;
  liveTranslation?: ReasoningTranslation;
  latestReasoningIndex?: number;
  latestToolIndex?: number;
  onCancelTool: (toolCallId: string) => Promise<void>;
  onFork: (messageId: number) => Promise<void>;
  partIndex?: number;
}) {
  const { t } = useTranslation(),
    visualRole = item.role === "system" ? "user" : item.role,
    first = partIndex === undefined || partIndex === 0,
    last = partIndex === undefined || partIndex === item.parts.length - 1,
    tone = roleTone({ role: visualRole }),
    forkLabel = forkDisabled ? t("pauseBeforeFork") : t("fork"),
    handleFork = useCallback(() => {
      reportPromiseErrors(onFork(item.id));
    }, [item.id, onFork]);
  return (
    <div className={cx(row, visualRole === "user" && inputRow)} data-last={last}>
      <article
        className={message({ pending: item.role === "user" && item.pending, role: visualRole })}
        data-first={first}
        data-last={last}
      >
        {first ? (
          <div className={header}>
            <span className={actions({ role: visualRole })}>
              {canFork ? (
                <IconButton
                  aria-label={forkLabel}
                  className={cx(forkButton, tone)}
                  disabled={forkDisabled}
                  onClick={handleFork}
                  title={forkLabel}
                  type="button"
                  variant="ghost"
                >
                  <GitFork size={14} />
                </IconButton>
              ) : null}
              {visualRole === "user" ? (
                <CopyButton className={tone} value={item.copyContent ?? item.content} />
              ) : null}
            </span>
          </div>
        ) : null}
        <Body
          item={item}
          latestReasoningIndex={latestReasoningIndex}
          latestToolIndex={latestToolIndex}
          liveTranslation={liveTranslation}
          onCancelTool={onCancelTool}
          partIndex={partIndex}
        />
      </article>
    </div>
  );
}
