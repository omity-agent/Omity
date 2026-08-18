import { css, cx } from "styled-system/css";
import type { AskUserQuestion } from "../../toolActions";
import { ChoiceOptions } from "./Options";
import { MarkdownEditor } from "../../MarkdownEditor";
import { useTranslation } from "react-i18next";

const choiceLayout = css({
    borderColor: "lineStrong",
    borderWidth: "1px",
    display: "grid",
    gridTemplateColumns: { base: "minmax(0, 1fr)", md: "repeat(2, minmax(0, 1fr))" },
    minH: "composerEditor",
    minW: 0,
  }),
  choicePane = css({
    alignContent: "start",
    display: "grid",
    gap: "3",
    minW: 0,
    p: "3",
  }),
  promptLabel = css({
    color: "text",
    fontSize: "sm",
    fontWeight: "medium",
    lineHeight: "1.5",
    m: 0,
    whiteSpace: "pre-wrap",
  }),
  noteLabel = css({ color: "mutedStrong", fontSize: "xs", m: 0 }),
  notePane = css({
    alignContent: "stretch",
    borderLeftColor: { md: "lineStrong" },
    borderLeftWidth: { md: "1px" },
    borderTopColor: { base: "lineStrong", md: "transparent" },
    borderTopWidth: { base: "1px", md: "0" },
    gridTemplateRows: "auto minmax(0, 1fr)",
    minH: 0,
  });
export function AskUserPrompt({
  note,
  question,
  selectedOptions,
  onNoteChange,
  onOptionsChange,
  onSubmit,
}: {
  note: string;
  question: AskUserQuestion;
  selectedOptions: string[];
  onNoteChange: (note: string) => void;
  onOptionsChange: (options: string[]) => void;
  onSubmit: () => void;
}) {
  const { t } = useTranslation();
  if (question.kind === "open_ended") {
    return (
      <div className={css({ display: "grid", gap: "2" })}>
        <p className={promptLabel}>{question.question}</p>
        <MarkdownEditor
          bare
          disabled={false}
          fluid
          label={question.question}
          onChange={onNoteChange}
          onSubmit={onSubmit}
          placeholder={t("answerPlaceholder")}
          value={note}
        />
      </div>
    );
  }
  return (
    <div className={choiceLayout}>
      <section className={choicePane}>
        <p className={promptLabel}>{question.question}</p>
        <ChoiceOptions
          question={question}
          selectedOptions={selectedOptions}
          onOptionsChange={onOptionsChange}
        />
      </section>
      <section className={cx(choicePane, notePane)}>
        <p className={noteLabel}>{t("answerNote")}</p>
        <MarkdownEditor
          bare
          disabled={false}
          fill
          label={t("answerNote")}
          onChange={onNoteChange}
          onSubmit={onSubmit}
          placeholder={t("answerNotePlaceholder")}
          value={note}
        />
      </section>
    </div>
  );
}
