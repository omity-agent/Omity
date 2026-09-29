import { ArrowLeft, PanelsTopLeft } from "lucide-react";
import { type ComponentProps, type ReactNode, useCallback, useId } from "react";
import { layout, main, panelCaption, panelToolbar, sidebar } from "../../design";
import { IconButton } from "../ParkUI";
import { Sidebar } from "../Sidebar";
import { cx } from "styled-system/css";
import { usePanelNavigation } from "./navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useSessionAttention } from "../../services/events/attention";
import { useTranslation } from "react-i18next";

type Props = Omit<ComponentProps<typeof Sidebar>, "unreadIds"> & {
  children: ReactNode;
  pageKey: string;
  title?: string;
};
export function ApplicationFrame({
  activeId,
  children,
  onCreate,
  onSelect,
  pageKey,
  sessions,
  showCreate,
  title,
}: Props) {
  const { t } = useTranslation(),
    queryClient = useQueryClient(),
    { buttonRef, showMain, showSessions, toggle } = usePanelNavigation(pageKey),
    sidebarId = useId(),
    unreadIds = useSessionAttention(queryClient, showSessions ? undefined : activeId),
    toggleLabel = t(showSessions ? "returnToMain" : "sessions"),
    create = useCallback(() => {
      showMain();
      onCreate();
    }, [onCreate, showMain]),
    select = useCallback(
      (id: string) => {
        showMain();
        onSelect(id);
      },
      [onSelect, showMain],
    );
  return (
    <div className={cx("dark", layout)} data-panel={showSessions ? "sessions" : "main"}>
      <header className={panelToolbar}>
        <IconButton
          aria-controls={sidebarId}
          aria-expanded={showSessions}
          aria-label={toggleLabel}
          onClick={toggle}
          ref={buttonRef}
          title={toggleLabel}
          type="button"
        >
          {showSessions ? <ArrowLeft aria-hidden /> : <PanelsTopLeft aria-hidden />}
        </IconButton>
        <span className={panelCaption} title={title}>
          {showSessions ? t("sessions") : (title ?? t("newSession"))}
        </span>
      </header>
      <aside className={sidebar} id={sidebarId}>
        <Sidebar
          activeId={activeId}
          showCreate={showCreate}
          sessions={sessions}
          unreadIds={unreadIds}
          onCreate={create}
          onSelect={select}
        />
      </aside>
      <main className={main}>{children}</main>
    </div>
  );
}
