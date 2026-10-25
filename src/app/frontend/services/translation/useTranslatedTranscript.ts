import { skipToken, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useEffectEvent, useMemo, useRef } from "react";
import { useTranslation } from "react-i18next";

import type { ReasoningTranslation, TimelineMessage } from "../../../timeline";
import { saveReasoningTranslation } from "../client";
import { reportError } from "../errors";
import { transcriptKey } from "../transcript/query";
import { browserTranslationSupported, preferredTranslationLanguage } from "./browser";
import { ReasoningTranslationCoordinator } from "./coordinator";
import { reasoningCandidates, rememberTranslation, withReasoningTranslations } from "./overlay";

interface TranslationSettings {
  enabled: boolean;
  highConfidenceThreshold: number;
  minimumIntervalMs: number;
}
let unsupportedWarningPrinted = false;
const emptyTranslations: ReasoningTranslation[] = [],
  reasoningTranslationsKey = (sessionId: string) =>
    [...transcriptKey(sessionId), "reasoningTranslations"] as const;
export function useTranslatedTranscript(
  sessionId: string,
  view: TimelineMessage[],
  settings?: TranslationSettings,
) {
  const { t } = useTranslation(),
    queryClient = useQueryClient(),
    coordinator = useRef<ReasoningTranslationCoordinator | undefined>(undefined),
    { data: translations = emptyTranslations } = useQuery<ReasoningTranslation[]>({
      queryFn: skipToken,
      queryKey: reasoningTranslationsKey(sessionId),
    }),
    initialize = useEffectEvent((translation: ReasoningTranslationCoordinator) => {
      translation.update(reasoningCandidates(view));
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
          queryClient.setQueryData<ReasoningTranslation[]>(
            reasoningTranslationsKey(sessionId),
            (current = emptyTranslations) => rememberTranslation(current, result),
          );
        },
        persist: (result) => saveReasoningTranslation(sessionId, result),
        reportError,
        targetLanguage,
      });
    coordinator.current = translation;
    initialize(translation);
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
    coordinator.current?.update(reasoningCandidates(view));
  }, [view]);
  return useMemo(
    () => (settings?.enabled ? withReasoningTranslations(view, translations) : view),
    [settings?.enabled, translations, view],
  );
}
function warnUnsupportedBrowser(message: string) {
  if (unsupportedWarningPrinted) {
    return;
  }
  unsupportedWarningPrinted = true;
  console.warn(message);
}
