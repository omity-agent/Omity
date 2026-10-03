import { api, request } from "../../../services/httpTransport";
import { useQuery } from "@tanstack/react-query";
import { useReducer } from "react";
import { z } from "../../../services/validation";

const capabilitySchema = z.object({
    description: z.string().optional(),
    enable: z.boolean(),
    id: z.string().min(1),
  }),
  sessionOptionsSchema = z.object({
    hooks: z.array(capabilitySchema),
    mcpServers: z.array(capabilitySchema),
    model: z.string().min(1),
  });
export type CapabilityOption = z.infer<typeof capabilitySchema>;
interface ProfilePreferences {
  hooks?: ReadonlyMap<string, boolean>;
  mcpServers?: ReadonlyMap<string, boolean>;
  model?: string;
}
type PreferenceUpdate = { profile?: string } & (
  | { kind: "model"; value: string }
  | { enable: boolean; id: string; kind: "hooks" | "mcpServers" }
);
function updatePreferences(
  current: Map<string | undefined, ProfilePreferences>,
  update: PreferenceUpdate,
) {
  const next = new Map(current),
    preferences = next.get(update.profile);
  if (update.kind === "model") {
    next.set(update.profile, { ...preferences, model: update.value });
  } else {
    const values = new Map(preferences?.[update.kind]);
    values.set(update.id, update.enable);
    next.set(update.profile, { ...preferences, [update.kind]: values });
  }
  return next;
}
async function readSessionOptions(profile?: string, signal?: AbortSignal) {
  return request(
    api["session-options"].$get({ query: { profile } }, { init: { signal } }),
    sessionOptionsSchema,
  );
}
function resolveCapabilities(
  options: CapabilityOption[],
  overrides?: ReadonlyMap<string, boolean>,
) {
  return options.map((option) => ({
    ...option,
    enable: overrides?.get(option.id) ?? option.enable,
  }));
}
export function useSessionPreferences(profile?: string) {
  const [selections, dispatch] = useReducer(
      updatePreferences,
      undefined,
      () => new Map<string | undefined, ProfilePreferences>(),
    ),
    query = useQuery({
      queryFn: ({ signal }) => readSessionOptions(profile, signal),
      queryKey: ["sessionOptions", profile ?? null],
    }),
    selected = selections.get(profile),
    hooks = resolveCapabilities(query.data?.hooks ?? [], selected?.hooks),
    mcpServers = resolveCapabilities(query.data?.mcpServers ?? [], selected?.mcpServers),
    model = selected?.model ?? query.data?.model ?? "",
    ready = query.isSuccess && !query.isFetching,
    handleHookChange = (id: string, enable: boolean) =>
      dispatch({ enable, id, kind: "hooks", profile }),
    handleServerChange = (id: string, enable: boolean) =>
      dispatch({ enable, id, kind: "mcpServers", profile }),
    handleModelChange = (value: string) => dispatch({ kind: "model", profile, value });
  return {
    error: query.error,
    handleHookChange,
    handleModelChange,
    handleServerChange,
    hookOverrides: Object.fromEntries(hooks.map(({ id, enable }) => [id, enable])),
    hooks,
    mcpOverrides: Object.fromEntries(mcpServers.map(({ id, enable }) => [id, enable])),
    mcpServers,
    model,
    ready,
    reload: () => query.refetch(),
    valid: ready && model.trim().length > 0,
  };
}
