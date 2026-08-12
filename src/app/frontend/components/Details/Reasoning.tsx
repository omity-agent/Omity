import type { ReasoningTranslation, TimelinePart } from "../../../timeline";
import { BrainCircuit } from "lucide-react";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { Frame } from "./Frame";
import { MarkdownView } from "../MarkdownView";
import { css } from "styled-system/css";
import { useTranslation } from "react-i18next";

const content = css({
  borderTopColor: "line",
  borderTopWidth: "1px",
  m: "3",
  minW: 0,
  mt: 0,
  pt: "3",
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
    reasoning = translatedReasoning(part, navigator.languages, liveTranslation);
  return (
    <Frame
      expandedInitially={latest}
      icon={BrainCircuit}
      label={t("reasoning")}
      title={t("reasoning")}
      tone="model"
    >
      <div className={content}>
        <MarkdownView content={reasoning} fileLinks={fileLinks} preserveLineBreaks />
      </div>
    </Frame>
  );
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
