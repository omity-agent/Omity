import type { LanguageModelV4CallOptions, SharedV4ProviderOptions } from "@ai-sdk/provider";
import type { ModelApi, ModelSettings, Settings } from "../../types";
import { conversationHeaders } from "../../infrastructure/openai/conversationHeaders";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createCodexClientFields } from "../../infrastructure/openai/codexAuthentication";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { createResponsesWebsocketFetch } from "./responsesWebsocket";
import { localize } from "../../i18n/server";
import { restrictedModelFetch } from "./restrictedFetch";

export function buildAiModel(settings: Settings, codexVersion?: string) {
  return buildConfiguredAiModel(settings.model, codexVersion);
}
export function buildConfiguredAiModel(model: ModelSettings, codexVersion?: string) {
  const api = configuredModelApi(model);
  if (api === "messages") {
    return createAnthropic(providerOptions(model, codexVersion))(model.model);
  }
  if (api === "interactions" || api === "generate-content") {
    const provider = createGoogle(providerOptions(model, codexVersion));
    return api === "interactions" ? provider.interactions(model.model) : provider(model.model);
  }
  const provider = createOpenAI(providerOptions(model, codexVersion));
  return api === "completions" ? provider.chat(model.model) : provider.responses(model.model);
}
export function aiRequestOptions(
  settings: Settings,
  sessionId: string,
  turnId?: string,
): {
  headers?: Record<string, string>;
  instructions?: string;
  reasoning?: LanguageModelV4CallOptions["reasoning"];
  providerOptions: SharedV4ProviderOptions;
} {
  const api = modelApi(settings);
  if (api === "messages" || api === "interactions" || api === "generate-content") {
    return {
      instructions: settings.agent.systemPrompt,
      ...structuredRequestOptions(settings.model),
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
  return api === "completions"
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
  reasoning?: LanguageModelV4CallOptions["reasoning"];
  providerOptions: SharedV4ProviderOptions;
} {
  const api = configuredModelApi(model),
    effort = model.reasoning_effort;
  if (api === "generate-content") {
    return {
      providerOptions: { google: { thinkingConfig: { includeThoughts: true } } },
      reasoning: effort,
    };
  }
  if (api === "interactions") {
    if (effort === "none" || effort === "xhigh" || effort === "max") {
      throw new Error(
        localize("agent:model.interactionsReasoningEffortUnsupported", { value0: effort }),
      );
    }
    return {
      providerOptions: {
        google: { store: false, thinkingLevel: effort, thinkingSummaries: "auto" },
      },
    };
  }
  if (api === "messages") {
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
    case "messages":
    case "interactions":
    case "generate-content": {
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
