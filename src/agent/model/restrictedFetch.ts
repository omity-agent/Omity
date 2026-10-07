import type { ModelApi } from "../../types";
import type { OutboundFetch } from "../../infrastructure/network/explicitHeaders";
import { localize } from "../../i18n/server";
import { modelToolPolicy } from "../../../settings/modelToolPolicy";
import { z } from "zod";

const modelRequestSchema = z.looseObject({
    tools: z.array(z.looseObject({ type: z.string().optional() })).default([]),
  }),
  generateContentToolSchema = z.strictObject({
    functionDeclarations: z.array(z.looseObject({ name: z.string().min(1) })).min(1),
  }),
  objectSchema = z.record(z.string(), z.unknown());
export function restrictedModelFetch(api: ModelApi, fetch?: OutboundFetch) {
  const restricted: OutboundFetch = async (input, init) => {
    const request = new Request(input, init),
      body = modelRequestSchema.parse(await request.json());
    for (const tool of body.tools) {
      const types =
        api === "generate-content"
          ? Object.keys(tool)
          : [tool.type ?? (api === "messages" ? "custom" : undefined)];
      for (const type of types) {
        if (!modelToolPolicy.allowedTypes[api].some((allowed) => allowed === type)) {
          throw new Error(localize("agent:model.toolTypeDisabled", { value0: String(type) }));
        }
      }
      if (api === "generate-content") {
        generateContentToolSchema.parse(tool);
      }
    }
    for (const name of modelToolPolicy.blockedOptions) {
      const value = body[name];
      if (value != null && !(Array.isArray(value) && value.length === 0)) {
        throw new Error(localize("agent:model.optionDisabled", { value0: name }));
      }
    }
    if (api === "interactions" || api === "generate-content") {
      configureGeminiTools(body, api);
    } else if (body.tools.length === 0) {
      body["tool_choice"] = api === "messages" ? { type: "none" } : "none";
    } else {
      body["tool_choice"] ??= api === "messages" ? { type: "auto" } : "auto";
    }
    const headers = new Headers(request.headers),
      serializedBody = JSON.stringify(body);
    headers.delete("content-length");
    return (fetch ?? globalThis.fetch)(
      new Request(request, { body: serializedBody, headers, method: request.method }),
      { body: serializedBody, method: request.method },
    );
  };
  return Object.assign(restricted, {
    preconnect() {
      throw new Error(localize("agent:model.preconnectUnsupported"));
    },
  });
}
function configureGeminiTools(body: z.infer<typeof modelRequestSchema>, api: ModelApi) {
  if (body.tools.length === 0) {
    // Gemini rejects function-calling configuration without function declarations.
    Reflect.deleteProperty(body, "tools");
    return;
  }
  if (api === "interactions") {
    const configuration = objectSchema.parse(body["generation_config"] ?? {});
    configuration["tool_choice"] ??= "auto";
    body["generation_config"] = configuration;
    return;
  }
  const configuration = objectSchema.parse(body["toolConfig"] ?? {}),
    functionCalling = objectSchema.parse(configuration["functionCallingConfig"] ?? {});
  functionCalling["mode"] ??= "AUTO";
  configuration["functionCallingConfig"] = functionCalling;
  body["toolConfig"] = configuration;
}
