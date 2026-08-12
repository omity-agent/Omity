import { encodeTranslationLineBreaks } from "./lineBreaks";

export interface BrowserTranslator {
  translate: (text: string, signal?: AbortSignal) => Promise<string | null>;
}
export function browserTranslationSupported() {
  return "LanguageDetector" in globalThis && "Translator" in globalThis;
}
export function preferredTranslationLanguage() {
  const language = navigator.languages.find(Boolean) ?? navigator.language;
  if (!language) {
    throw new Error("浏览器未提供首选语言");
  }
  return Intl.getCanonicalLocales(language)[0] ?? language;
}
export async function createBrowserTranslator(
  targetLanguage: string,
  text: string,
  signal?: AbortSignal,
): Promise<BrowserTranslator> {
  const detector = await LanguageDetector.create({ signal }),
    results = await detector.detect(text, { signal }),
    sourceLanguage = results[0]?.detectedLanguage;
  detector.destroy();
  if (!sourceLanguage) {
    throw new Error("浏览器无法检测思维链语言");
  }
  if (sameBaseLanguage(sourceLanguage, targetLanguage)) {
    return { translate: () => Promise.resolve(null) };
  }
  const availability = await Translator.availability({ sourceLanguage, targetLanguage });
  if (availability === "unavailable") {
    throw new Error(`浏览器不支持翻译语言对：${sourceLanguage} → ${targetLanguage}`);
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
function sameBaseLanguage(left: string, right: string) {
  return new Intl.Locale(left).language === new Intl.Locale(right).language;
}
