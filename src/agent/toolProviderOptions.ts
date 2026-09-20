import { isJSONObject, isPlainObject, omit } from "es-toolkit";
import type { SharedV4ProviderOptions as ProviderOptions } from "@ai-sdk/provider";

export function isProviderOptions(value: unknown): value is ProviderOptions {
  return isPlainObject(value) && Object.values(value).every(isJSONObject);
}
export function omitToolItemIds(value: ProviderOptions): ProviderOptions | undefined {
  const providers = Object.entries(value).flatMap(([provider, options]) => {
    const cleaned = omit(options, ["itemId"]);
    return Object.keys(cleaned).length > 0 ? [[provider, cleaned] as const] : [];
  });
  return providers.length > 0 ? Object.fromEntries(providers) : undefined;
}
