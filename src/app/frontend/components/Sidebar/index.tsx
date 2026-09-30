import { type MouseEvent, useCallback } from "react";
import { groupSessions, isRunning } from "./sessions";
import { navigateLink, pagePath } from "../../route";
import { LinkButton } from "../ParkUI";
import { Plus } from "lucide-react";
import { SessionGroup } from "./SessionGroup";
import type { SessionInfo } from "../../services/client";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

const panel = css({
    alignItems: "center",
    background: "sidebar",
    borderBlockEndWidth: "hairline",
    borderBottomColor: "line",
    display: "grid",
    gap: "2",
    gridTemplateColumns: "minmax(0, 1fr) auto",
    minHeight: { _coarse: "14", _compact: "14", base: "12" },
    paddingInline: "3",
  }),
  brand = css({
    color: "text",
    textStyle: "sidebarBrand",
  }),
  total = css({
    color: "muted",
    textStyle: "sidebarCount",
  }),
  newButton = css({
    borderColor: "line",
    height: "controlTarget",
    paddingInline: "2.5",
  }),
  list = css({
    alignContent: "start",
    background: "sidebar",
    display: "grid",
    minHeight: "zero",
    overflowX: "hidden",
    overflowY: "auto",
    overscrollBehavior: "contain",
    paddingInline: "2",
    scrollbarGutter: "stable",
    touchAction: "pan-y",
  });
interface SidebarProps {
  sessions: SessionInfo[];
  activeId?: string;
  showCreate: boolean;
  unreadIds: ReadonlySet<string>;
  onCreate: () => void;
  onSelect: (id: string) => void;
}
export function Sidebar({
  sessions,
  activeId,
  showCreate,
  unreadIds,
  onCreate,
  onSelect,
}: SidebarProps) {
  const { t } = useTranslation(),
    hasRunningSessions = sessions.some(isRunning),
    handleCreate = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => navigateLink(event, onCreate),
      [onCreate],
    );
  return (
    <>
      <header className={panel}>
        <h1 className={brand}>
          {t("brand")} <span className={total}>/ {sessions.length}</span>
        </h1>
        {showCreate && (
          <LinkButton
            aria-label={t("newSession")}
            className={newButton}
            href={pagePath({ kind: "new" })}
            onClick={handleCreate}
            title={t("newSession")}
          >
            <Plus size={14} />
            {t("new")}
          </LinkButton>
        )}
      </header>
      <nav aria-label={t("sessions")} className={list}>
        {groupSessions(sessions).map((group) => (
          <SessionGroup
            activeId={activeId}
            group={group}
            hasRunningSessions={hasRunningSessions}
            key={group.workspace}
            unreadIds={unreadIds}
            onSelect={onSelect}
          />
        ))}
      </nav>
    </>
  );
}
