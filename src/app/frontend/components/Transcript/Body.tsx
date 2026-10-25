import type { TimelineMessage } from "../../../timeline";
import { Reasoning } from "../Details/Reasoning";
import { ToolCall } from "../Details/ToolCall";
import { MarkdownView } from "../MarkdownView";

export function Body({
  item,
  latestReasoningIndex,
  latestToolIndex,
  onCancelTool,
  partIndex,
}: {
  item: TimelineMessage;
  latestReasoningIndex?: number;
  latestToolIndex?: number;
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
