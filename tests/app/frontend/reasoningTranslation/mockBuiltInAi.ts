import { mock, spyOn } from "bun:test";

export function mockBuiltInAi() {
  const detect = mock<LanguageDetectorInstance["detect"]>(() =>
      Promise.resolve([{ confidence: 1, detectedLanguage: "en" }]),
    ),
    destroyDetector = mock(() => undefined),
    createDetector = mock<LanguageDetectorFactory["create"]>(() =>
      Promise.resolve({ destroy: destroyDetector, detect }),
    ),
    availability = mock<TranslatorFactory["availability"]>(() => Promise.resolve("available")),
    translate = mock<TranslatorInstance["translate"]>((text) =>
      Promise.resolve(`translated:${text}`),
    ),
    createTranslator = mock<TranslatorFactory["create"]>(() =>
      Promise.resolve({ destroy: () => undefined, translate }),
    ),
    warning = spyOn(console, "warn").mockReturnValue(undefined),
    factories = {
      LanguageDetector: {
        availability: () => Promise.resolve("available"),
        create: createDetector,
      },
      Translator: { availability, create: createTranslator },
    } satisfies { LanguageDetector: LanguageDetectorFactory; Translator: TranslatorFactory },
    originals = Object.keys(factories).map((name) => ({
      descriptor: Object.getOwnPropertyDescriptor(globalThis, name),
      name,
    }));
  for (const [name, value] of Object.entries(factories)) {
    Object.defineProperty(globalThis, name, { configurable: true, value });
  }
  return {
    availability,
    createDetector,
    createTranslator,
    destroyDetector,
    detect,
    restore() {
      warning.mockRestore();
      for (const { name, descriptor } of originals) {
        if (descriptor) {
          Object.defineProperty(globalThis, name, descriptor);
        } else {
          Reflect.deleteProperty(globalThis, name);
        }
      }
    },
    translate,
    warning,
  };
}
