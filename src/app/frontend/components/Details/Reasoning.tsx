import { MarkdownInline, MarkdownView } from "../MarkdownView";
import type { ReasoningTranslation, TimelinePart } from "../../../timeline";
import { createElement, useLayoutEffect, useRef } from "react";
import { BrainCircuit } from "lucide-react";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { Frame } from "./Frame";
import { css } from "styled-system/css";
import { useCollapsibleContext } from "@ark-ui/react/collapsible";
import { useTranslation } from "react-i18next";

const content = css({
    borderTopColor: "line",
    borderTopWidth: "1px",
    m: "3",
    minW: 0,
    mt: 0,
    pt: "3",
  }),
  summary = css({
    display: "block",
    overflow: "hidden",
    whiteSpace: "nowrap",
  });
export function Reasoning({
  part,
  fileLinks,
  latest,
  liveTranslation,
}: {
  fileLinks?: FilePathMatch[];
  latest: boolean;
  liveTranslation?: ReasoningTranslation;
  part: Extract<TimelinePart, { type: "reasoning" }>;
}) {
  const { t } = useTranslation(),
    reasoning = translatedReasoning(part, navigator.languages, liveTranslation),
    title = createElement(ReasoningTitle, { label: t("reasoning"), reasoning });
  return (
    <Frame
      expandedInitially={latest}
      icon={BrainCircuit}
      label={t("reasoning")}
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
  const { open } = useCollapsibleContext(),
    summaryReference = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!open && summaryReference.current) {
      summaryReference.current.scrollLeft = summaryReference.current.scrollWidth;
    }
  });
  return open ? (
    label
  ) : (
    <span className={summary} ref={summaryReference}>
      <MarkdownInline content={singleLineReasoning(reasoning)} />
    </span>
  );
}
export function singleLineReasoning(text: string) {
  return text.replace(/\r\n|[\r\n\u2028\u2029]/g, " ");
}
export function preferredTranslation(
  part: Extract<TimelinePart, { type: "reasoning" }>,
  preferredLanguages: readonly string[],
  liveTranslation?: ReasoningTranslation,
) {
  const translations = [
    ...(part.translations ?? []),
    ...(liveTranslation && liveTranslation.messageId === part.messageId ? [liveTranslation] : []),
  ];
  for (const language of preferredLanguages) {
    const match = translations.find(
      (translation) =>
        translation.source === part.content &&
        new Intl.Locale(translation.targetLanguage).language === new Intl.Locale(language).language,
    );
    if (match) {
      return match;
    }
  }
  return undefined;
}
export function translatedReasoning(
  part: Extract<TimelinePart, { type: "reasoning" }>,
  preferredLanguages: readonly string[],
  liveTranslation?: ReasoningTranslation,
) {
  const exact = preferredTranslation(part, preferredLanguages, liveTranslation);
  if (exact) {
    return exact.translated;
  }
  if (
    !liveTranslation ||
    liveTranslation.messageId !== part.messageId ||
    part.streaming !== true ||
    !part.content.startsWith(liveTranslation.source) ||
    !supportsLanguage(liveTranslation, preferredLanguages)
  ) {
    return part.content;
  }
  return liveTranslation.translated + part.content.slice(liveTranslation.source.length);
}
function supportsLanguage(
  translation: ReasoningTranslation,
  preferredLanguages: readonly string[],
) {
  return preferredLanguages.some(
    (language) =>
      new Intl.Locale(translation.targetLanguage).language === new Intl.Locale(language).language,
  );
}
