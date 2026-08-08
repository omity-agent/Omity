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
  content: reasoning,
  fileLinks,
  latest,
}: {
  content: string;
  fileLinks?: FilePathMatch[];
  latest: boolean;
}) {
  const { t } = useTranslation();
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
