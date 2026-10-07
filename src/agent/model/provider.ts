import type { ModelApi, ModelSettings, Settings } from "../../types";
import type { SharedV4ProviderOptions } from "@ai-sdk/provider";
import { conversationHeaders } from "../../infrastructure/openai/conversationHeaders";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCodexClientFields } from "../../infrastructure/openai/codexAuthentication";
import { createOpenAI } from "@ai-sdk/openai";
import { createResponsesWebsocketFetch } from "./responsesWebsocket";
import { localize } from "../../i18n/server";
import { restrictedModelFetch } from "./restrictedFetch";

export function buildAiModel(settings: Settings, codexVersion?: string) {
  return buildConfiguredAiModel(settings.model, codexVersion);
}
export function buildConfiguredAiModel(model: ModelSettings, codexVersion?: string) {
  if (configuredModelApi(model) === "messages") {
    return createAnthropic(providerOptions(model, codexVersion))(model.model);
  }
  const provider = createOpenAI(providerOptions(model, codexVersion));
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
      throw new Error(localize("agent:model.messagesReasoningEffortUnsupported"));
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
      throw new Error(localize("agent:model.structuredReasoningEffortUnsupported"));
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
function configuredModelApi(model: ModelSettings): ModelApi {
  switch (model.adapter) {
    case "codex":
    case "responses-sse":
    case "responses-websocket": {
      return "responses";
    }
    case "completions":
    case "messages": {
      return model.adapter;
    }
    default: {
      throw new Error(localize("agent:model.adapterBranchMissing"));
    }
  }
}
function providerOptions(model: ModelSettings, codexVersion?: string) {
  if (model.adapter === "codex") {
    const fields = createCodexClientFields({ codexVersion });
    return {
      apiKey: fields.apiKey,
      baseURL: fields.configuration.baseURL,
      fetch: restrictedModelFetch("responses", createResponsesWebsocketFetch(fields.websocket)),
    };
  }
  const apiKey = process.env[model.apiKeyEnv];
  if (!apiKey) {
    throw new Error(localize("agent:model.apiKeyEnvironmentMissing", { value0: model.apiKeyEnv }));
  }
  const api = configuredModelApi(model),
    fetch =
      model.adapter === "responses-websocket"
        ? restrictedModelFetch(api, createResponsesWebsocketFetch({ apiKey }))
        : restrictedModelFetch(api);
  return {
    apiKey,
    ...(model.baseURL ? { baseURL: model.baseURL } : {}),
    fetch,
  };
}
