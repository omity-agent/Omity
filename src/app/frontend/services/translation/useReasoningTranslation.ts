import type { TimelineMessage, TimelinePart } from "../../../timeline";
import { browserTranslationSupported, preferredTranslationLanguage } from "./browser";
import { useEffect, useMemo, useRef } from "react";
import { ReasoningTranslationCoordinator } from "./coordinator";
import { reportError } from "../errors";
import { saveReasoningTranslation } from "../client";
import { useTranslation } from "react-i18next";

interface TranslationSettings {
  enabled: boolean;
  minimumIntervalMs: number;
}
let unsupportedWarningPrinted = false;
export function useReasoningTranslation(
  sessionId: string,
  view: TimelineMessage[],
  settings?: TranslationSettings,
) {
  const { t } = useTranslation(),
    coordinator = useRef<ReasoningTranslationCoordinator | undefined>(undefined),
    part = useMemo(() => translationCandidate(view), [view]);
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
        minimumIntervalMs: settings.minimumIntervalMs,
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
  }, [sessionId, settings?.enabled, settings?.minimumIntervalMs, t]);
  useEffect(() => {
    if (part) {
      coordinator.current?.update(part);
    }
  }, [part]);
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
