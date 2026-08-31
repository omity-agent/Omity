import type { SharedV4ProviderOptions as ProviderOptions } from "@ai-sdk/provider";

export function omitToolItemIds(value: ProviderOptions): ProviderOptions | undefined {
  const providers = Object.entries(value).flatMap(([provider, options]) => {
    const entries = Object.entries(options).filter(([key]) => key !== "itemId");
    return entries.length > 0 ? [[provider, Object.fromEntries(entries)] as const] : [];
  });
  return providers.length > 0 ? Object.fromEntries(providers) : undefined;
}
