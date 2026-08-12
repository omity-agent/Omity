import type { ReasoningTranslation, TimelineMessage, TimelinePart } from "../../../timeline";
import { browserTranslationSupported, preferredTranslationLanguage } from "./browser";
import { useEffect, useMemo, useRef, useState } from "react";
import { ReasoningTranslationCoordinator } from "./coordinator";
import { reportError } from "../errors";
import { saveReasoningTranslation } from "../client";
import { useTranslation } from "react-i18next";

interface TranslationSettings {
  enabled: boolean;
  minimumIntervalMs: number;
}
interface LiveTranslation {
  sessionId: string;
  value: ReasoningTranslation;
}
let unsupportedWarningPrinted = false;
export function useReasoningTranslation(
  sessionId: string,
  view: TimelineMessage[],
  settings?: TranslationSettings,
) {
  const { t } = useTranslation(),
    coordinator = useRef<ReasoningTranslationCoordinator | undefined>(undefined),
    part = useMemo(() => translationCandidate(view), [view]),
    [liveTranslation, setLiveTranslation] = useState<LiveTranslation | undefined>();
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
        onTranslation: (result) => {
          setLiveTranslation({ sessionId, value: result });
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
  }, [sessionId, settings?.enabled, settings?.minimumIntervalMs, t]);
  useEffect(() => {
    if (part) {
      coordinator.current?.update(part);
    }
  }, [part]);
  return settings?.enabled &&
    liveTranslation?.sessionId === sessionId &&
    part &&
    isUsableLiveTranslation(liveTranslation.value, part)
    ? liveTranslation.value
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
