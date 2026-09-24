import type { ModelApi, Settings } from "../../types";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { conversationHeaders } from "../../infrastructure/openai/conversationHeaders";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCodexClientFields } from "../../infrastructure/openai/codexAuthentication";
import { createOpenAI } from "@ai-sdk/openai";

export function buildAiModel(settings: Settings) {
  if (modelApi(settings) === "messages") {
    return createAnthropic(providerOptions(settings))(settings.model.model);
  }
  const provider = createOpenAI(providerOptions(settings));
  return modelApi(settings) === "completions"
    ? provider.chat(settings.model.model)
    : provider.responses(settings.model.model);
}
export function aiRequestOptions(
  settings: Settings,
  sessionId: string,
  turnId?: string,
): {
  headers?: Record<string, string>;
  instructions?: string;
  providerOptions: SharedV4ProviderOptions;
} {
  if (modelApi(settings) === "messages") {
    const effort = settings.model.reasoning_effort;
    if (effort === "minimal") {
      throw new Error("Messages API 不支持 reasoning_effort: minimal");
    }
    return {
      instructions: settings.agent.systemPrompt,
      providerOptions: {
        anthropic:
          effort === undefined
            ? {}
            : effort === "none"
              ? { thinking: { type: "disabled" } }
              : { effort, thinking: { display: "summarized", type: "adaptive" } },
      },
    };
  }
  const openai = {
    forceReasoning: settings.model.reasoning_effort !== undefined,
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
        ...(settings.model.adapter === "codex"
          ? { headers: conversationHeaders(sessionId, turnId) }
          : {}),
        providerOptions: {
          openai: {
            ...openai,
            instructions: settings.agent.systemPrompt,
          },
        },
      };
}
export function modelApi(settings: Settings): ModelApi {
  return settings.model.adapter === "codex" ? "responses" : settings.model.adapter;
}
function providerOptions(settings: Settings) {
  if (settings.model.adapter === "codex") {
    const fields = createCodexClientFields();
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
