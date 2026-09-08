import {
  Bot,
  Circle,
  CircleAlert,
  Hourglass,
  LoaderCircle,
  type LucideIcon,
  Pause,
  Wrench,
} from "lucide-react";
import { css, cva, cx } from "styled-system/css";
import type { ErrorDetails } from "../../../../failures/details";
import type { SessionStatus } from "../../../../types";
import { statusLabelKey } from "./sessions";
import { useTranslation } from "react-i18next";

const indicator = cva({
    base: {
      alignItems: "center",
      display: "inline-flex",
      flexShrink: 0,
      fontSize: "xs",
      gap: "1.5",
    },
    variants: {
      status: {
        error: { color: "statusError" },
        idle: { color: "statusIdle" },
        paused: { color: "statusPaused" },
        pausing: { color: "statusPaused" },
        streaming: { color: "statusModel" },
        tool: { color: "statusTool" },
        waiting: { color: "statusModel" },
      },
    },
  }),
  activeIcon = css({ animation: "pulse 1.8s ease-in-out infinite" }),
  statusMeta: Record<SessionStatus, { icon: LucideIcon; active?: boolean }> = {
    error: { icon: CircleAlert },
    idle: { icon: Circle },
    paused: { icon: Pause },
    pausing: { active: true, icon: LoaderCircle },
    streaming: { active: true, icon: Bot },
    tool: { active: true, icon: Wrench },
    waiting: { active: true, icon: Hourglass },
  };
export function Status({
  compact = false,
  error,
  status,
}: {
  compact?: boolean;
  error: ErrorDetails | null;
  status: SessionStatus;
}) {
  const { t } = useTranslation(),
    meta = statusMeta[status],
    Icon = meta.icon,
    label = t(statusLabelKey(status)),
    description = status === "error" && error ? `${label}: ${error.message}` : label;
  return (
    <span
      aria-label={description}
      className={indicator({ status })}
      title={status === "error" && error ? error.message : label}
    >
      <Icon
        aria-hidden="true"
        className={cx(meta.active && activeIcon)}
        size={12}
        strokeWidth={2}
      />
      {!compact && <span>{label}</span>}
    </span>
  );
}
