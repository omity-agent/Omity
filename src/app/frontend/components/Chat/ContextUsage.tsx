import { DatabaseZap } from "lucide-react";
import type { TokenUsage } from "../../../timeline";
import { css } from "styled-system/css";
import { formatTokens } from "../../tokenUnits";
import { useTranslation } from "react-i18next";

const panel = css({
    alignItems: "end",
    borderTopColor: "line",
    borderTopWidth: "1px",
    color: "muted",
    display: "grid",
    fontFamily: "mono",
    fontSize: "xs",
    gap: "2",
    gridTemplateColumns: { base: "repeat(2, auto)", md: "1fr" },
    justifyContent: "space-between",
    mt: { base: 0, md: "auto" },
    pt: "3",
    w: "full",
    whiteSpace: "nowrap",
  }),
  row = css({
    alignItems: "center",
    display: "flex",
    gap: "1.5",
    justifyContent: "space-between",
  }),
  value = css({ color: "mutedStrong" });
export function ContextUsage({ usage }: { usage: TokenUsage | null }) {
  const { t } = useTranslation(),
    totalTokens = usage
      ? formatTokens(usage.inputTokens + usage.outputTokens)
      : t("unavailableTokens"),
    cacheRate =
      usage && usage.inputTokens > 0
        ? `${((usage.cacheReadTokens / usage.inputTokens) * 100).toFixed(2)}%`
        : usage
          ? "0.00%"
          : "—",
    description = `${t("contextUsage")}: ${totalTokens}; ${t("kvCache")}: ${cacheRate}`;
  return (
    <div aria-label={description} className={panel} title={description}>
      <span className={row}>
        <span>{t("contextUsage")}</span>
        <span className={value}>{totalTokens}</span>
      </span>
      <span className={row}>
        <span className={row}>
          <DatabaseZap aria-hidden="true" size={12} />
          <span>{t("kvCache")}</span>
        </span>
        <span className={value}>{cacheRate}</span>
      </span>
    </div>
  );
}
