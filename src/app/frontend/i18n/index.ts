import { type TOptions, t, use } from "i18next";
import LanguageDetector from "i18next-browser-languagedetector";
import { initReactI18next } from "react-i18next";
import { resources } from "../../../i18n/resources";

export const i18nReady = use(LanguageDetector)
  .use(initReactI18next)
  .init({
    defaultNS: "app",
    fallbackLng: "zh-CN",
    interpolation: {
      escapeValue: false,
    },
    resources,
  });

export function localize(key: string, options?: TOptions) {
  return t(key, options);
}
