import { sessionLabel, statusLabelKey } from "./sessions";
import { useEffect, useMemo } from "react";
import type { SessionInfo } from "../../services/client";
import { useTranslation } from "react-i18next";

export function useSessionPresentation(
  sessions: SessionInfo[],
  activeId: string | undefined,
  pausing: boolean,
) {
  const { t } = useTranslation();
  const displayedSessions = useMemo(
    () =>
      sessions.map((session) =>
        pausing &&
        session.id === activeId &&
        (session.status === "model" || session.status === "tool")
          ? { ...session, status: "pausing" as const }
          : session,
      ),
    [activeId, pausing, sessions],
  );
  const activeSession = displayedSessions.find(({ id }) => id === activeId);
  useEffect(() => {
    const brand = t("brand");
    document.title = activeSession
      ? `${t(statusLabelKey(activeSession.status))} · #${sessionLabel(activeSession.id)} · ${brand}`
      : brand;
    return () => {
      document.title = brand;
    };
  }, [activeSession, t]);
  return { activeSession, sessions: displayedSessions };
}
