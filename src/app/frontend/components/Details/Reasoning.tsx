/* oxlint-disable @pandacss/no-margin-properties -- Reasoning content uses a deliberate inset and native reset. */
import { useCollapsibleContext } from "@ark-ui/react/collapsible";
import { BrainCircuit } from "lucide-react";
import { createElement } from "react";
import { useTranslation } from "react-i18next";
import { css } from "styled-system/css";

import type { FilePathMatch } from "../../../../fileLinks/types";
import type { ReasoningTranslation, TimelinePart } from "../../../timeline";
import { MarkdownInline, MarkdownView } from "../MarkdownView";
import { Frame } from "./Frame";

const content = css({
    borderBlockStartWidth: "hairline",
    borderTopColor: "line",
    layerStyle: "reasoningText",
    marginBlockEnd: "3",
    marginBlockStart: "zero",
    marginInline: "3",
    minWidth: "zero",
    paddingBlockStart: "3",
  }),
  summary = css({
    display: "flex",
    justifyContent: "flex-end",
    minWidth: "zero",
    overflow: "hidden",
  }),
  summaryText = css({
    display: "block",
    flexShrink: 0,
    layerStyle: "reasoningText",
    minWidth: "full",
    whiteSpace: "nowrap",
    width: "intrinsicContent",
  });
export function Reasoning({
  part,
  detailKey,
  fileLinks,
  latest,
}: {
  detailKey: string;
  fileLinks?: FilePathMatch[];
  latest: boolean;
  part: Extract<TimelinePart, { type: "reasoning" }>;
}) {
  const { t } = useTranslation(),
    reasoning = translatedReasoning(part, navigator.languages),
    title = createElement(ReasoningTitle, { label: t("reasoning"), reasoning });
  return (
    <Frame
      expandedInitially={latest}
      icon={BrainCircuit}
      label={t("reasoning")}
      stateKey={detailKey}
      title={title}
      tone="model"
    >
      <div className={content}>
        <MarkdownView content={reasoning} fileLinks={fileLinks} preserveLineBreaks />
      </div>
    </Frame>
  );
}
function ReasoningTitle({ label, reasoning }: { label: string; reasoning: string }) {
  const { open } = useCollapsibleContext();
  return open ? (
    label
  ) : (
    <span className={summary}>
      <span className={summaryText}>
        <MarkdownInline content={singleLineReasoning(reasoning)} />
      </span>
    </span>
  );
}
function singleLineReasoning(text: string) {
  return text.replace(/\r\n|[\r\n\u2028\u2029]/g, " ");
}
function preferredTranslation(
  part: Extract<TimelinePart, { type: "reasoning" }>,
  preferredLanguages: readonly string[],
) {
  for (const language of preferredLanguages) {
    let match: ReasoningTranslation | undefined;
    for (const translation of part.translations ?? []) {
      if (
        translation.messageId === part.messageId &&
        part.content.startsWith(translation.source) &&
        new Intl.Locale(translation.targetLanguage).language ===
          new Intl.Locale(language).language &&
        (!match || translation.source.length > match.source.length)
      ) {
        match = translation;
      }
    }
    if (match) {
      return match;
    }
  }
  return undefined;
}
function translatedReasoning(
  part: Extract<TimelinePart, { type: "reasoning" }>,
  preferredLanguages: readonly string[],
) {
  const translation = preferredTranslation(part, preferredLanguages);
  return translation
    ? translation.translated + part.content.slice(translation.source.length)
    : part.content;
}
