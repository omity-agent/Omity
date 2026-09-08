import { type ComponentProps, useDeferredValue, useMemo, useRef } from "react";
import { MessageCopies, useMessageCopies } from "./actions/PinnedCopy";
import { Virtualizer, type VirtualizerHandle } from "virtua";
import { css, cx } from "styled-system/css";
import { DisclosureProvider } from "./disclosures";
import { Message } from "../Chat/Message";
import type { TimelineMessage } from "../../../timeline";
import { findLatestDetails } from "../Chat/detailFocus";
import { scroll } from "../../design";
import { segmentTranscript } from "./segments";
import { transcriptWindow } from "../../../../../settings/rendering";
import { useTranscriptScroll } from "./scrolling/viewportTracking";

const viewport = css({ containerType: "size", overflowAnchor: "none" }),
  content = css({ minW: 0, position: "relative", w: "full" }),
  segment = css({
    '&[data-first="true"]': { pt: { _short: "3", base: "4", md: "6" } },
    '&[data-last="true"]': { pb: { _short: "3", base: "4", md: "6" } },
    display: "flow-root",
  });
type MessageActions = Pick<
  ComponentProps<typeof Message>,
  "forkDisabled" | "liveTranslation" | "onCancelTool" | "onFork"
>;
export function Transcript({
  allowFork,
  forkDisabled,
  liveTranslation,
  messages: incomingMessages,
  onCancelTool,
  onFork,
}: MessageActions & {
  allowFork: boolean;
  messages: TimelineMessage[];
}) {
  const messages = useDeferredValue(incomingMessages),
    segments = useMemo(() => segmentTranscript(messages), [messages]),
    copies = useMessageCopies(segments),
    scrollRef = useRef<HTMLElement>(null),
    contentRef = useRef<HTMLDivElement>(null),
    handleRef = useRef<VirtualizerHandle>(null),
    firstUserMessageId = messages.find((item) => item.role === "user")?.id,
    latestDetails = findLatestDetails(messages);
  useTranscriptScroll({
    contentRef,
    handleRef,
    onLayout: copies.update,
    scrollRef,
    segments,
  });
  return (
    <DisclosureProvider>
      <section className={cx(scroll, viewport)} ref={scrollRef}>
        <div className={content} ref={contentRef}>
          <Virtualizer
            bufferSize={transcriptWindow.bufferSize}
            data={segments}
            ref={handleRef}
            scrollRef={scrollRef}
          >
            {({ key, message: item, partIndex }, index) => (
              <div
                className={segment}
                data-first={index === 0}
                data-last={index === segments.length - 1}
                key={key}
              >
                <Message
                  canFork={
                    allowFork &&
                    item.role === "user" &&
                    item.id > 0 &&
                    item.id !== firstUserMessageId
                  }
                  forkDisabled={forkDisabled}
                  item={item}
                  latestReasoningIndex={
                    item.key === latestDetails.reasoning?.messageKey
                      ? latestDetails.reasoning.partIndex
                      : undefined
                  }
                  latestToolIndex={
                    item.key === latestDetails.tool?.messageKey
                      ? latestDetails.tool.partIndex
                      : undefined
                  }
                  liveTranslation={liveTranslation}
                  onCancelTool={onCancelTool}
                  onFork={onFork}
                  partIndex={partIndex}
                />
              </div>
            )}
          </Virtualizer>
          <MessageCopies handleRef={handleRef} registry={copies} segments={segments} />
        </div>
      </section>
    </DisclosureProvider>
  );
}
