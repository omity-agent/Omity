import { encodeTranslationLineBreaks } from "./lineBreaks";
import { t } from "i18next";

interface BrowserTranslator {
  translate: (text: string, signal?: AbortSignal) => Promise<string | null>;
}
export class UnsupportedLanguagePairError extends Error {
  constructor(
    readonly sourceLanguage: string,
    readonly targetLanguage: string,
    readonly confidence: number,
  ) {
    super(t("translationPairUnavailable", { confidence, sourceLanguage, targetLanguage }));
    this.name = "UnsupportedLanguagePairError";
  }
}
export function browserTranslationSupported() {
  return "LanguageDetector" in globalThis && "Translator" in globalThis;
}
export function preferredTranslationLanguage() {
  const language = navigator.languages.find(Boolean) ?? navigator.language;
  if (!language) {
    throw new Error(t("translationPreferredLanguageMissing"));
  }
  return Intl.getCanonicalLocales(language)[0] ?? language;
}
export async function createBrowserTranslator(
  targetLanguage: string,
  text: string,
  signal?: AbortSignal,
): Promise<BrowserTranslator> {
  const { detectedLanguage: sourceLanguage, confidence } = await detectReasoningLanguage(
    text,
    signal,
  );
  if (sameBaseLanguage(sourceLanguage, targetLanguage)) {
    return { translate: () => Promise.resolve(null) };
  }
  const availability = await Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === "unavailable") {
    throw new UnsupportedLanguagePairError(sourceLanguage, targetLanguage, confidence);
  }
  const translator = await Translator.create({ signal, sourceLanguage, targetLanguage });
  return {
    async translate(input, translationSignal) {
      const protectedInput = encodeTranslationLineBreaks(input),
        translated = await translator.translate(protectedInput.encoded, {
          signal: translationSignal,
        });
      return protectedInput.restore(translated);
    },
  };
}
async function detectReasoningLanguage(text: string, signal?: AbortSignal) {
  const detector = await LanguageDetector.create({ signal });
  try {
    const [result] = await detector.detect(text, { signal });
    if (!result?.detectedLanguage) {
      throw new Error(t("translationDetectionFailed"));
    }
    if (!Number.isFinite(result.confidence) || result.confidence < 0 || result.confidence > 1) {
      throw new Error(t("translationConfidenceInvalid"));
    }
    return result;
  } finally {
    detector.destroy();
  }
}
function sameBaseLanguage(left: string, right: string) {
  return new Intl.Locale(left).language === new Intl.Locale(right).language;
}
