import { BrainCircuit } from "lucide-react";
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
  complete,
  content: reasoning,
  fileLinkIdentity,
  latest,
}: {
  complete: boolean;
  content: string;
  fileLinkIdentity: string;
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
        <MarkdownView
          complete={complete}
          content={reasoning}
          fileLinkIdentity={fileLinkIdentity}
          preserveLineBreaks
        />
      </div>
    </Frame>
  );
}
