import type { ReasoningTranslation, TimelineMessage, TimelinePart } from "../../../timeline";
import { browserTranslationSupported, preferredTranslationLanguage } from "./browser";
import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef } from "react";
import { ReasoningTranslationCoordinator } from "./coordinator";
import { reportError } from "../errors";
import { saveReasoningTranslation } from "../client";
import { transcriptKey } from "../transcript/query";
import { useTranslation } from "react-i18next";

interface TranslationSettings {
  enabled: boolean;
  highConfidenceThreshold: number;
  minimumIntervalMs: number;
}
let unsupportedWarningPrinted = false;
export const reasoningTranslationKey = (sessionId: string) =>
  [...transcriptKey(sessionId), "reasoningTranslation"] as const;
export function useReasoningTranslation(
  sessionId: string,
  view: TimelineMessage[],
  settings?: TranslationSettings,
) {
  const { t } = useTranslation(),
    queryClient = useQueryClient(),
    coordinator = useRef<ReasoningTranslationCoordinator | undefined>(undefined),
    part = useMemo(() => translationCandidate(view), [view]),
    { data: liveTranslation } = useQuery<ReasoningTranslation>({
      queryFn: skipToken,
      queryKey: reasoningTranslationKey(sessionId),
    });
  useEffect(() => {
    coordinator.current?.close();
    coordinator.current = undefined;
    if (!settings?.enabled) {
      return undefined;
    }
    if (!browserTranslationSupported()) {
      warnUnsupportedBrowser(t("reasoningTranslationUnsupported"));
      return undefined;
    }
    const targetLanguage = preferredTranslationLanguage(),
      translation = new ReasoningTranslationCoordinator({
        highConfidenceThreshold: settings.highConfidenceThreshold,
        minimumIntervalMs: settings.minimumIntervalMs,
        onTranslation: (result) => {
          queryClient.setQueryData(reasoningTranslationKey(sessionId), result);
        },
        persist: (result) => saveReasoningTranslation(sessionId, result),
        reportError,
        targetLanguage,
      });
    coordinator.current = translation;
    return () => {
      translation.close();
      if (coordinator.current === translation) {
        coordinator.current = undefined;
      }
    };
  }, [
    queryClient,
    sessionId,
    settings?.enabled,
    settings?.highConfidenceThreshold,
    settings?.minimumIntervalMs,
    t,
  ]);
  useEffect(() => {
    if (part) {
      coordinator.current?.update(part);
    }
  }, [part]);
  return settings?.enabled &&
    liveTranslation &&
    part &&
    isUsableLiveTranslation(liveTranslation, part)
    ? liveTranslation
    : undefined;
}
function warnUnsupportedBrowser(message: string) {
  if (unsupportedWarningPrinted) {
    return;
  }
  unsupportedWarningPrinted = true;
  console.warn(message);
}
function translationCandidate(
  view: TimelineMessage[],
): Extract<TimelinePart, { type: "reasoning" }> | undefined {
  const parts = view.flatMap((message) =>
      message.parts.filter(
        (part): part is Extract<TimelinePart, { type: "reasoning" }> => part.type === "reasoning",
      ),
    ),
    streaming = parts.findLast((part) => part.streaming && part.messageId !== undefined);
  return streaming ?? parts.at(-1);
}
function isUsableLiveTranslation(
  translation: ReasoningTranslation,
  part: Extract<TimelinePart, { type: "reasoning" }>,
) {
  return (
    translation.messageId === part.messageId &&
    (translation.source === part.content ||
      (part.streaming === true && part.content.startsWith(translation.source)))
  );
}
