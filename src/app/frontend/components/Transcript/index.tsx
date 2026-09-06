import {
  type ComponentProps,
  useCallback,
  useDeferredValue,
  useLayoutEffect,
  useMemo,
  useRef,
} from "react";
import { MessageCopies, useMessageCopies } from "./actions/PinnedCopy";
import { css, cx } from "styled-system/css";
import {
  measureItemHeight,
  scrollWithMeasuredExtent,
} from "../../services/scheduling/scrollGeometry";
import { DisclosureProvider } from "./disclosures";
import type { TimelineMessage } from "../../../timeline";
import { WindowedSegment } from "./WindowedSegment";
import { findLatestDetails } from "../Chat/detailFocus";
import { observePinnedViewport } from "./viewport";
import { scroll } from "../../design";
import { segmentTranscript } from "./segments";
import { transcriptWindow } from "../../../../../settings/rendering";
import { useVirtualizer } from "@tanstack/react-virtual";

const viewport = css({ containerType: "size", overflowAnchor: "none" }),
  content = css({ minH: "full", minW: 0, position: "relative", w: "full" });
type MessageActions = Pick<
  ComponentProps<typeof WindowedSegment>,
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
  "use no memo";
  const messages = useDeferredValue(incomingMessages),
    segments = useMemo(() => segmentTranscript(messages), [messages]),
    copies = useMessageCopies(segments),
    scrollRef = useRef<HTMLElement>(null),
    firstUserMessageId = messages.find((item) => item.role === "user")?.id,
    latestDetails = findLatestDetails(messages),
    getItemKey = useCallback((index: number) => segments[index]!.key, [segments]),
    // oxlint-disable-next-line react/incompatible-library
    virtualizer = useVirtualizer({
      anchorTo: "end",
      count: segments.length,
      directDomUpdates: true,
      estimateSize: () => transcriptWindow.estimatedMessageHeight,
      followOnAppend: true,
      getItemKey,
      getScrollElement: () => scrollRef.current,
      initialOffset: () => segments.length * transcriptWindow.estimatedMessageHeight,
      measureElement: measureItemHeight,
      observeElementRect: observePinnedViewport,
      onChange: copies.update,
      overscan: transcriptWindow.overscan,
      scrollEndThreshold: transcriptWindow.followThreshold,
      scrollToFn: scrollWithMeasuredExtent,
      useFlushSync: false,
    });
  useLayoutEffect(() => {
    virtualizer.scrollToEnd();
  }, [virtualizer]);
  return (
    <DisclosureProvider>
      <section className={cx(scroll, viewport)} ref={scrollRef}>
        <div className={content} ref={virtualizer.containerRef}>
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const { message: item, partIndex } = segments[virtualItem.index]!;
            return (
              <WindowedSegment
                canFork={
                  allowFork && item.role === "user" && item.id > 0 && item.id !== firstUserMessageId
                }
                forkDisabled={forkDisabled}
                item={item}
                key={virtualItem.key}
                last={virtualItem.index === segments.length - 1}
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
                virtualItem={virtualItem}
                measure={virtualizer.measureElement}
              />
            );
          })}
          <MessageCopies instance={virtualizer} registry={copies} segments={segments} />
        </div>
      </section>
    </DisclosureProvider>
  );
}
