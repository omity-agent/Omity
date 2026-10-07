import { type TOptions, createInstance } from "i18next";
import { resources } from "./resources";

const instance = createInstance();
void instance.init({
  fallbackLng: "zh-CN",
  initAsync: false,
  interpolation: {
    escapeValue: false,
  },
  lng: "zh-CN",
  resources,
});

export function localize(key: string, options?: TOptions) {
  return instance.t(key, options);
}
