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
    '&[data-last="true"]': { mb: "4" },
    alignItems: "start",
    display: "flex",
    gap: "2",
    minW: 0,
    w: "full",
  }),
  inputRow = css({ justifyContent: "flex-end" }),
  forkButton = css({
    borderWidth: "0",
    flexShrink: 0,
  }),
  message = cva({
    base: {
      '&[data-first="false"]': { borderTopWidth: 0, pt: "3" },
      '&[data-last="false"]': { borderBottomWidth: 0, pb: 0 },
      bg: "surface",
      borderColor: "line",
      borderWidth: "1px",
      display: "grid",
      gap: "3",
      justifyItems: "start",
      maxW: "content",
      minW: 0,
      p: "4",
      textAlign: "left",
      w: "fit-content",
    },
    variants: {
      pending: {
        true: { opacity: 0.55 },
      },
      role: {
        assistant: { maxW: { base: "full", sm: "2/3" }, w: "full" },
        tool: {},
        user: {
          bg: "surfaceRaised",
          borderColor: "lineStrong",
          maxH: "66.666667cqh",
          maxW: { base: "full", sm: "2/3" },
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
    justifyContent: "flex-end",
    minH: "8",
    pointerEvents: "none",
    position: "sticky",
    top: "0",
    w: "full",
    zIndex: "1",
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
        assistant: { bg: "surface" },
        tool: { bg: "surface" },
        user: { bg: "surfaceRaised" },
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
              {visualRole === "user" ? <CopyButton className={tone} value={item.content} /> : null}
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
