import type { ModelApi } from "../../types";
import type { OutboundFetch } from "../../infrastructure/network/explicitHeaders";
import { modelToolPolicy } from "../../../settings/modelToolPolicy";
import { z } from "zod";

const modelRequestSchema = z.looseObject({
  tools: z.array(z.looseObject({ type: z.string().optional() })).default([]),
});
export function restrictedModelFetch(api: ModelApi, fetch?: OutboundFetch) {
  const restricted: OutboundFetch = async (input, init) => {
    const request = new Request(input, init),
      body = modelRequestSchema.parse(await request.json());
    for (const tool of body.tools) {
      const type = tool.type ?? (api === "messages" ? "custom" : undefined);
      if (!modelToolPolicy.allowedTypes[api].some((allowed) => allowed === type)) {
        throw new Error(`供应商内置工具已禁用：${String(type)}`);
      }
    }
    for (const name of modelToolPolicy.blockedOptions) {
      const value = body[name];
      if (value != null && !(Array.isArray(value) && value.length === 0)) {
        throw new Error(`供应商内置工具已禁用：${name}`);
      }
    }
    if (body.tools.length === 0) {
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
      throw new Error("模型请求不支持绕过统一出站网络层的 preconnect");
    },
  });
}
