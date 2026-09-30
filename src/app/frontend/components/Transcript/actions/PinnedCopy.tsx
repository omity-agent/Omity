import { type MessageSpan, messageSpans, visibleCopies } from "./messageSpans";
import { type RefObject, useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { CopyButton } from "../../Chat/CopyButton";
import type { VirtualizerHandle } from "virtua";
import { css } from "styled-system/css";
import type { segmentTranscript } from "../segments";

interface MountedCopy {
  element: HTMLDivElement;
  span: MessageSpan;
}
const boundary = css({
    '&[data-first="true"]': { paddingBlockStart: { _short: "3", base: "4", md: "6" } },
    '&[data-last="true"]': { paddingBlockEnd: { _short: "3", base: "4", md: "6" } },
    insetBlockStart: "zero",
    insetInlineStart: "zero",
    pointerEvents: "none",
    position: "absolute",
    width: "full",
    zIndex: "pinned",
  }),
  inset = css({
    borderColor: "clear",
    borderWidth: "hairline",
    height: "full",
    maxWidth: { base: "full", sm: "twoThirds" },
    paddingBlockEnd: "8",
    paddingBlockStart: "4",
    paddingInline: "4",
    width: "full",
  }),
  toolbar = css({
    display: "flex",
    insetBlockStart: "zero",
    justifyContent: "flex-end",
    minHeight: "8",
    position: "sticky",
  }),
  button = css({ background: "surface", color: "statusModel", pointerEvents: "auto" });
function placeCopy(instance: VirtualizerHandle, { element, span }: MountedCopy) {
  const first = instance.getItemOffset(span.first),
    end = instance.getItemOffset(span.last) + instance.getItemSize(span.last);
  element.style.top = `${first.toString()}px`;
  element.style.height = `${(end - first).toString()}px`;
}
export function useMessageCopies(segments: ReturnType<typeof segmentTranscript>) {
  const mounted = useRef(new Map<string, MountedCopy>()),
    spans = useMemo(() => messageSpans(segments), [segments]),
    [range, setRange] = useState({ first: 0, last: -1 }),
    update = useCallback(
      (instance: VirtualizerHandle) => {
        for (const copy of mounted.current.values()) {
          placeCopy(instance, copy);
        }
        const first = instance.findItemIndex(instance.scrollOffset),
          last = instance.findItemIndex(instance.scrollOffset + instance.viewportSize);
        setRange((current) =>
          current.first === first && current.last === last ? current : { first, last },
        );
      },
      [mounted, setRange],
    ),
    register = useCallback(
      (instance: VirtualizerHandle, element: HTMLDivElement, span: MessageSpan) => {
        const copy = { element, span };
        mounted.current.set(span.message.key, copy);
        placeCopy(instance, copy);
        return () => {
          mounted.current.delete(span.message.key);
        };
      },
      [mounted],
    );
  return { range, register, spans, update };
}
export function MessageCopies({
  handleRef,
  registry,
  segments,
}: {
  handleRef: RefObject<VirtualizerHandle | null>;
  registry: ReturnType<typeof useMessageCopies>;
  segments: ReturnType<typeof segmentTranscript>;
}) {
  useLayoutEffect(() => {
    if (handleRef.current) {
      registry.update(handleRef.current);
    }
  });
  return visibleCopies(registry.range, registry.spans).map((span) => (
    <PinnedCopy
      handleRef={handleRef}
      key={span.message.key}
      last={span.last === segments.length - 1}
      register={registry.register}
      span={span}
    />
  ));
}
function PinnedCopy({
  handleRef,
  last,
  register,
  span,
}: {
  handleRef: RefObject<VirtualizerHandle | null>;
  last: boolean;
  register: ReturnType<typeof useMessageCopies>["register"];
  span: MessageSpan;
}) {
  const reference = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = reference.current,
      instance = handleRef.current;
    if (!element || !instance) {
      throw new Error("消息复制按钮缺少定位容器");
    }
    return register(instance, element, span);
  }, [handleRef, register, span]);
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
          <CopyButton className={button} value={span.message.copyContent ?? span.message.content} />
        </div>
      </div>
    </div>
  );
}
