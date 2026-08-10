import type { ModelApi, Settings } from "../types";
import { codexClientFields } from "../infrastructure/openai/codexAuthentication";
import { createOpenAI } from "@ai-sdk/openai";

export function buildAiModel(settings: Settings) {
  const provider = createOpenAI(providerOptions(settings));
  return modelApi(settings) === "completions"
    ? provider.chat(settings.model.model)
    : provider.responses(settings.model.model);
}
export function aiRequestOptions(settings: Settings, sessionId: string) {
  const openai = {
    include: ["reasoning.encrypted_content"],
    promptCacheKey: sessionId,
    reasoningEffort: settings.model.reasoning_effort,
    reasoningSummary: "detailed" as const,
    store: false,
  };
  return modelApi(settings) === "completions"
    ? {
        instructions: settings.agent.systemPrompt,
        providerOptions: { openai },
      }
    : {
        providerOptions: {
          openai: {
            ...openai,
            instructions: settings.agent.systemPrompt,
          },
        },
      };
}
export function modelApi(settings: Settings): ModelApi {
  return settings.model.adapter === "completions" ? "completions" : "responses";
}
function providerOptions(settings: Settings) {
  if (settings.model.adapter === "codex") {
    const fields = codexClientFields();
    return {
      apiKey: fields.apiKey,
      baseURL: fields.configuration.baseURL,
      fetch: fields.configuration.fetch,
    };
  }
  const apiKey = process.env[settings.model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${settings.model.apiKeyEnv}`);
  }
  return {
    apiKey,
    ...(settings.model.baseURL ? { baseURL: settings.model.baseURL } : {}),
  };
}
