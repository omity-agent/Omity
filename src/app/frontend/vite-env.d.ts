/// <reference types="vite/client" />

type BuiltInAiAvailability = "available" | "downloadable" | "downloading" | "unavailable";
interface BuiltInAiMonitor {
  addEventListener: (type: "downloadprogress", listener: (event: ProgressEvent) => void) => void;
}
interface LanguageDetectionResult {
  confidence: number;
  detectedLanguage: string;
}
interface LanguageDetectorInstance {
  destroy: () => void;
  detect: (input: string, options?: { signal?: AbortSignal }) => Promise<LanguageDetectionResult[]>;
}
interface LanguageDetectorFactory {
  availability: () => Promise<BuiltInAiAvailability>;
  create: (options?: {
    monitor?: (monitor: BuiltInAiMonitor) => void;
    signal?: AbortSignal;
  }) => Promise<LanguageDetectorInstance>;
}
interface TranslatorInstance {
  destroy: () => void;
  translate: (input: string, options?: { signal?: AbortSignal }) => Promise<string>;
}
interface TranslatorFactory {
  availability: (options: {
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<BuiltInAiAvailability>;
  create: (options: {
    monitor?: (monitor: BuiltInAiMonitor) => void;
    signal?: AbortSignal;
    sourceLanguage: string;
    targetLanguage: string;
  }) => Promise<TranslatorInstance>;
}
declare const LanguageDetector: LanguageDetectorFactory;
declare const Translator: TranslatorFactory;
