import { BrainCircuit } from "lucide-react";
import type { FilePathMatch } from "../../../../fileLinks/types";
import { Frame } from "./Frame";
import { MarkdownView } from "../MarkdownView";
import type { TimelinePart } from "../../../timeline";
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
}: {
  fileLinks?: FilePathMatch[];
  latest: boolean;
  part: Extract<TimelinePart, { type: "reasoning" }>;
}) {
  const { t } = useTranslation(),
    translation = preferredTranslation(part, navigator.languages),
    reasoning = translation?.translated ?? part.content;
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
) {
  for (const language of preferredLanguages) {
    const match = part.translations?.find(
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
