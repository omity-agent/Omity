import { Button, LinkButton } from "../ParkUI";
import { type SessionGroup as Group, isRunning, workspaceLabel } from "./sessions";
import { type MouseEvent, useCallback, useState } from "react";
import {
  caption,
  chevron,
  collapsedChevron,
  counts,
  header,
  historyToggle,
  item,
  root,
  row,
  runningCount,
  selected,
  selectedCaption,
  sessions,
  time,
  unreadCaption,
  workspaceName,
} from "./groupStyles";
import { navigateLink, pagePath } from "../../route";
import { ChevronDown } from "lucide-react";
import { OverflowCaption } from "./OverflowCaption";
import { RelativeTime } from "./RelativeTime";
import { Status } from "./Status";
import { cx } from "styled-system/css";
import { useTranslation } from "react-i18next";

interface Props {
  group: Group;
  activeId?: string;
  hasRunningSessions?: boolean;
  unreadIds: ReadonlySet<string>;
  onSelect: (id: string) => void;
}
interface SessionItemProps {
  active: boolean;
  language: string;
  onSelect: Props["onSelect"];
  session: Group["sessions"][number];
  unread: boolean;
}
function SessionItem({ active, language, onSelect, session, unread }: SessionItemProps) {
  const { t } = useTranslation(),
    title = session.title === session.id ? session.id.toUpperCase() : session.title,
    handleSelect = useCallback(
      (event: MouseEvent<HTMLAnchorElement>) => {
        navigateLink(event, () => onSelect(session.id));
      },
      [onSelect, session.id],
    );
  return (
    <div className={cx("group", item, active && selected)}>
      <LinkButton
        aria-current={active ? "page" : undefined}
        aria-label={unread ? `${title}, ${t("sessionStoppedUnread")}` : title}
        className={row}
        href={pagePath({ id: session.id, kind: "session" })}
        onClick={handleSelect}
        title={unread ? `${title} · ${t("sessionStoppedUnread")}` : title}
        variant="ghost"
      >
        <OverflowCaption
          className={cx(caption, active && selectedCaption, unread && unreadCaption)}
          text={title}
        />
        <Status compact error={session.error} status={session.status} />
        <RelativeTime className={time} locale={language} updatedAt={session.updatedAt} />
      </LinkButton>
    </div>
  );
}
export function SessionGroup({
  group,
  activeId,
  hasRunningSessions = false,
  unreadIds,
  onSelect,
}: Props) {
  const { t, i18n } = useTranslation(),
    [expanded, setExpanded] = useState(true),
    [historyExpanded, setHistoryExpanded] = useState(false),
    toggleExpanded = useCallback(() => {
      setExpanded((value) => !value);
    }, []),
    toggleHistory = useCallback(() => {
      setHistoryExpanded((value) => !value);
    }, []),
    runningSessions = group.sessions.filter(isRunning),
    historySessions = group.sessions.filter((session) => !isRunning(session)),
    selectedHistory = historySessions.find(({ id }) => id === activeId),
    compactHistory = historySessions.filter(
      ({ id }) => id === selectedHistory?.id || unreadIds.has(id),
    ),
    visibleSessions =
      runningSessions.length > 0
        ? [...runningSessions, ...(historyExpanded ? historySessions : compactHistory)]
        : group.sessions,
    hiddenHistoryCount = historySessions.length - compactHistory.length,
    visibleExpanded = expanded && (!hasRunningSessions || group.runningCount > 0);
  return (
    <section className={root}>
      <button className={header} onClick={toggleExpanded} title={group.workspace} type="button">
        <ChevronDown className={cx(chevron, !visibleExpanded && collapsedChevron)} size={13} />
        <span className={workspaceName}>{workspaceLabel(group.workspace)}</span>
        <span className={counts}>
          {group.runningCount > 0 && <span className={runningCount}>● {group.runningCount}</span>}
          <span>{group.sessions.length}</span>
        </span>
      </button>
      {visibleExpanded && (
        <div className={sessions}>
          {visibleSessions.map((session) => (
            <SessionItem
              active={session.id === activeId}
              key={session.id}
              language={i18n.language}
              onSelect={onSelect}
              session={session}
              unread={unreadIds.has(session.id)}
            />
          ))}
          {runningSessions.length > 0 && hiddenHistoryCount > 0 && (
            <Button className={historyToggle} onClick={toggleHistory} type="button" variant="ghost">
              {t(historyExpanded ? "hideHistory" : "showHistory", {
                count: hiddenHistoryCount,
              })}
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
