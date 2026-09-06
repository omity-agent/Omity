import { type VirtualItem, type Virtualizer } from "@tanstack/react-virtual";
import type { ComponentProps } from "react";
import { Message } from "../Chat/Message";
import { css } from "styled-system/css";

const row = css({
  '&[data-index="0"]': { pt: { _short: "3", base: "4", md: "6" } },
  '&[data-last="true"]': { pb: { _short: "3", base: "4", md: "6" } },
  display: "flow-root",
  left: 0,
  position: "absolute",
  top: 0,
  w: "full",
});
export function WindowedSegment({
  canFork,
  forkDisabled,
  item,
  last,
  latestReasoningIndex,
  latestToolIndex,
  liveTranslation,
  measure,
  onCancelTool,
  onFork,
  partIndex,
  virtualItem,
}: ComponentProps<typeof Message> & {
  last: boolean;
  virtualItem: VirtualItem;
  measure: Virtualizer<HTMLElement, Element>["measureElement"];
}) {
  return (
    <div className={row} data-index={virtualItem.index} data-last={last} ref={measure}>
      <Message
        canFork={canFork}
        forkDisabled={forkDisabled}
        item={item}
        latestReasoningIndex={latestReasoningIndex}
        latestToolIndex={latestToolIndex}
        liveTranslation={liveTranslation}
        onCancelTool={onCancelTool}
        onFork={onFork}
        partIndex={partIndex}
      />
    </div>
  );
}
