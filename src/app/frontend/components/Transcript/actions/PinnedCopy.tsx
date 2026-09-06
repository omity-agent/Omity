import { type MessageSpan, messageSpans, visibleCopies } from "./messageSpans";
import { useCallback, useLayoutEffect, useMemo, useRef } from "react";
import { CopyButton } from "../../Chat/CopyButton";
import type { Virtualizer } from "@tanstack/react-virtual";
import { css } from "styled-system/css";
import type { segmentTranscript } from "../segments";

type MessageWindow = Virtualizer<HTMLElement, Element>;
interface MountedCopy {
  element: HTMLDivElement;
  span: MessageSpan;
}
const boundary = css({
    '&[data-first="true"]': { pt: { _short: "3", base: "4", md: "6" } },
    '&[data-last="true"]': { pb: { _short: "3", base: "4", md: "6" } },
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    w: "full",
    zIndex: "2",
  }),
  inset = css({
    borderColor: "transparent",
    borderWidth: "1px",
    h: "full",
    maxW: { base: "full", sm: "2/3" },
    pb: "8",
    pt: "4",
    px: "4",
    w: "full",
  }),
  toolbar = css({
    display: "flex",
    justifyContent: "flex-end",
    minH: "8",
    position: "sticky",
    top: "0",
  }),
  button = css({ bg: "surface", color: "statusModel", pointerEvents: "auto" });
function placeCopy(instance: MessageWindow, { element, span }: MountedCopy) {
  const first = instance.measurementsCache[span.first],
    last = instance.measurementsCache[span.last];
  if (first && last) {
    element.style.top = `${first.start.toString()}px`;
    element.style.height = `${(last.end - first.start).toString()}px`;
  }
}
export function useMessageCopies(segments: ReturnType<typeof segmentTranscript>) {
  "use no memo";
  const mounted = useRef(new Map<string, MountedCopy>()),
    spans = useMemo(() => messageSpans(segments), [segments]),
    update = useCallback(
      (instance: MessageWindow) => {
        for (const copy of mounted.current.values()) {
          placeCopy(instance, copy);
        }
      },
      [mounted],
    ),
    register = useCallback(
      (instance: MessageWindow, element: HTMLDivElement, span: MessageSpan) => {
        const copy = { element, span };
        mounted.current.set(span.message.key, copy);
        placeCopy(instance, copy);
        return () => {
          mounted.current.delete(span.message.key);
        };
      },
      [mounted],
    );
  return { register, spans, update };
}
export function MessageCopies({
  instance,
  registry,
  segments,
}: {
  instance: MessageWindow;
  registry: ReturnType<typeof useMessageCopies>;
  segments: ReturnType<typeof segmentTranscript>;
}) {
  useLayoutEffect(() => {
    registry.update(instance);
  });
  return visibleCopies(instance.getVirtualItems(), segments, registry.spans).map((span) => (
    <PinnedCopy
      instance={instance}
      key={span.message.key}
      last={span.last === segments.length - 1}
      register={registry.register}
      span={span}
    />
  ));
}
function PinnedCopy({
  instance,
  last,
  register,
  span,
}: {
  instance: MessageWindow;
  last: boolean;
  register: ReturnType<typeof useMessageCopies>["register"];
  span: MessageSpan;
}) {
  const reference = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = reference.current;
    if (!element) {
      throw new Error("消息复制按钮缺少定位容器");
    }
    return register(instance, element, span);
  }, [instance, register, span]);
  return (
    <div
      className={boundary}
      data-first={span.first === 0}
      data-last={last}
      data-message-actions={span.message.key}
      ref={reference}
    >
      <div className={inset}>
        <div className={toolbar}>
          <CopyButton className={button} value={span.message.content} />
        </div>
      </div>
    </div>
  );
}
