import type { ReasoningTranslation, TimelineMessage } from "../../../timeline";
import { MarkdownView } from "../MarkdownView";
import { Reasoning } from "../Details/Reasoning";
import { ToolCall } from "../Details/ToolCall";

export function Body({
  item,
  latestReasoningIndex,
  latestToolIndex,
  liveTranslation,
  onCancelTool,
  partIndex,
}: {
  item: TimelineMessage;
  latestReasoningIndex?: number;
  latestToolIndex?: number;
  liveTranslation?: ReasoningTranslation;
  onCancelTool: (toolCallId: string) => Promise<void>;
  partIndex?: number;
}) {
  const parts = partIndex === undefined ? item.parts : item.parts.slice(partIndex, partIndex + 1);
  return parts.map((part, offset) => {
    const index = partIndex ?? offset;
    if (part.type === "content") {
      return (
        <MarkdownView
          content={part.content}
          fileLinks={part.fileLinks}
          key={`content-${index.toString()}`}
          preserveLineBreaks={item.role === "user" || item.role === "system"}
        />
      );
    }
    const latest = index === (part.type === "reasoning" ? latestReasoningIndex : latestToolIndex);
    if (part.type === "reasoning") {
      return (
        <Reasoning
          detailKey={`${item.key}:reasoning:${index.toString()}:${latest ? "latest" : "settled"}`}
          fileLinks={part.fileLinks}
          key={`reasoning-${index.toString()}-${latest ? "latest" : "settled"}`}
          latest={latest}
          liveTranslation={liveTranslation}
          part={part}
        />
      );
    }
    return (
      <ToolCall
        call={part.call}
        key={`${part.key}-${latest ? "latest" : "settled"}`}
        latest={latest}
        onCancel={onCancelTool}
        output={part.output}
        phase={part.phase}
      />
    );
  });
}
