import type { ModelApi, ModelSettings, Settings } from "../../types";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { conversationHeaders } from "../../infrastructure/openai/conversationHeaders";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCodexClientFields } from "../../infrastructure/openai/codexAuthentication";
import { createOpenAI } from "@ai-sdk/openai";

export function buildAiModel(settings: Settings) {
  return buildConfiguredAiModel(settings.model);
}
export function buildConfiguredAiModel(model: ModelSettings) {
  if (configuredModelApi(model) === "messages") {
    return createAnthropic(providerOptions(model))(model.model);
  }
  const provider = createOpenAI(providerOptions(model));
  return configuredModelApi(model) === "completions"
    ? provider.chat(model.model)
    : provider.responses(model.model);
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
export function structuredRequestOptions(model: ModelSettings): {
  providerOptions: SharedV4ProviderOptions;
} {
  if (configuredModelApi(model) === "messages") {
    const effort = model.reasoning_effort;
    if (effort === "minimal") {
      throw new Error("Messages API 不支持 reasoning_effort: minimal");
    }
    return {
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
  return {
    providerOptions: {
      openai: {
        reasoningEffort: model.reasoning_effort,
        store: false,
      },
    },
  };
}
export function modelApi(settings: Settings): ModelApi {
  return configuredModelApi(settings.model);
}
export function configuredModelApi(model: ModelSettings): ModelApi {
  return model.adapter === "codex" ? "responses" : model.adapter;
}
function providerOptions(model: ModelSettings) {
  if (model.adapter === "codex") {
    const fields = createCodexClientFields();
    return {
      apiKey: fields.apiKey,
      baseURL: fields.configuration.baseURL,
      fetch: fields.configuration.fetch,
    };
  }
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(`缺少环境变量 ${model.apiKeyEnv}`);
  }
  return {
    apiKey,
    ...(model.baseURL ? { baseURL: model.baseURL } : {}),
  };
}
