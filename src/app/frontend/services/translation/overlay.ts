import { replaceEqualDeep } from "@tanstack/react-query";
import { groupBy } from "es-toolkit";

import type { ReasoningTranslation, TimelineMessage, TimelinePart } from "../../../timeline";

export function rememberTranslation(
  current: ReasoningTranslation[],
  incoming: ReasoningTranslation,
) {
  const sameTarget = (translation: ReasoningTranslation) =>
    translation.messageId === incoming.messageId &&
    translation.targetLanguage === incoming.targetLanguage;
  if (
    current.some(
      (translation) => sameTarget(translation) && translation.source.startsWith(incoming.source),
    )
  ) {
    return current;
  }
  return [
    ...current.filter(
      (translation) => !sameTarget(translation) || !incoming.source.startsWith(translation.source),
    ),
    incoming,
  ];
}
export function withReasoningTranslations(
  view: TimelineMessage[],
  translations: ReasoningTranslation[],
) {
  const byMessage = groupBy(translations, (translation) => translation.messageId);
  return replaceEqualDeep(
    view,
    view.map((message) => ({
      ...message,
      parts: message.parts.map((part) => {
        if (part.type !== "reasoning" || !part.messageId) {
          return part;
        }
        const matching = byMessage[part.messageId]?.filter((translation) =>
          part.content.startsWith(translation.source),
        );
        return matching?.length
          ? {
              ...part,
              translations: [...(part.translations ?? []), ...matching],
            }
          : part;
      }),
    })),
  );
}
export function reasoningCandidates(view: TimelineMessage[]) {
  const parts = view.flatMap((message) =>
    message.parts.filter(
      (part): part is Extract<TimelinePart, { type: "reasoning" }> => part.type === "reasoning",
    ),
  );
  return [...new Map(parts.map((part) => [part.messageId, part])).values()];
}
