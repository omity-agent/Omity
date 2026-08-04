import { formatUpdatedAt, updatedAtRefreshDelay } from "./sessions";
import { useEffect, useState } from "react";

interface Props {
  className?: string;
  locale: string;
  updatedAt: number;
}
export function RelativeTime({ className, locale, updatedAt }: Props) {
  return (
    <RelativeTimeValue
      className={className}
      key={updatedAt}
      locale={locale}
      updatedAt={updatedAt}
    />
  );
}
function RelativeTimeValue({ className, locale, updatedAt }: Props) {
  const now = useUpdatedAtClock(updatedAt);
  return (
    <time className={className} dateTime={new Date(updatedAt * 1000).toISOString()}>
      {formatUpdatedAt(updatedAt, locale, now)}
    </time>
  );
}
function useUpdatedAtClock(updatedAt: number) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const delay = updatedAtRefreshDelay(updatedAt, now);
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (delay !== undefined) {
      timer = setTimeout(() => {
        setNow(Date.now());
      }, delay);
    }
    return () => {
      if (timer !== undefined) {
        clearTimeout(timer);
      }
    };
  }, [now, updatedAt]);
  return now;
}
