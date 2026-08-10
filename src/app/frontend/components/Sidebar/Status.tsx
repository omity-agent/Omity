import {
  Bot,
  Circle,
  CircleAlert,
  LoaderCircle,
  type LucideIcon,
  Pause,
  Wrench,
} from "lucide-react";
import { css, cva, cx } from "styled-system/css";
import type { ErrorDetails } from "../../../../failures/details";
import type { SessionStatus } from "../../../../types";
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
        model: { color: "statusModel" },
        paused: { color: "statusPaused" },
        pausing: { color: "statusPaused" },
        tool: { color: "statusTool" },
      },
    },
  }),
  activeIcon = css({ animation: "pulse 1.8s ease-in-out infinite" }),
  statusMeta: Record<SessionStatus, { icon: LucideIcon; label: string; active?: boolean }> = {
    error: { icon: CircleAlert, label: "statusError" },
    idle: { icon: Circle, label: "statusIdle" },
    model: { active: true, icon: Bot, label: "statusModel" },
    paused: { icon: Pause, label: "statusPaused" },
    pausing: { active: true, icon: LoaderCircle, label: "statusPausing" },
    tool: { active: true, icon: Wrench, label: "statusTool" },
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
    label = t(meta.label),
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
