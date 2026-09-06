import { composerActions, composerControls } from "../layout";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function ActionPanel({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className={composerActions}>
      <div aria-label={t("composerActions")} className={composerControls} role="group">
        {children}
      </div>
      {footer}
    </div>
  );
}
