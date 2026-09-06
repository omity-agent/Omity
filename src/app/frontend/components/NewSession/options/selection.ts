import { useCallback, useState } from "react";
import { request } from "../../../services/request";
import { useQuery } from "@tanstack/react-query";
import { z } from "../../../services/validation";

const hookOptionsSchema = z.object({
  hooks: z.array(
    z.object({
      description: z.string().optional(),
      enable: z.boolean(),
      id: z.string().min(1),
    }),
  ),
});
export type HookOption = z.infer<typeof hookOptionsSchema>["hooks"][number];
export async function readHookOptions(profile?: string, signal?: AbortSignal) {
  const query = new URLSearchParams();
  if (profile !== undefined) {
    query.set("profile", profile);
  }
  return request(`api/hooks?${query.toString()}`, hookOptionsSchema, { signal });
}
export function resolveHookSelection(hooks: HookOption[], overrides: ReadonlyMap<string, boolean>) {
  return hooks.map((hook) => ({ ...hook, enable: overrides.get(hook.id) ?? hook.enable }));
}
export function useHookSelection(profile?: string) {
  const [selections, setSelections] = useState(
      () => new Map<string | undefined, ReadonlyMap<string, boolean>>(),
    ),
    query = useQuery({
      queryFn: ({ signal }) => readHookOptions(profile, signal),
      queryKey: ["hookOptions", profile ?? null],
    }),
    hooks = resolveHookSelection(query.data?.hooks ?? [], selections.get(profile) ?? new Map()),
    ready = query.isSuccess && !query.isFetching,
    handleChange = useCallback(
      (id: string, enable: boolean) => {
        setSelections((current) => {
          const next = new Map(current),
            values = new Map(next.get(profile));
          values.set(id, enable);
          next.set(profile, values);
          return next;
        });
      },
      [profile, setSelections],
    );
  return {
    error: query.error,
    handleChange,
    hooks,
    overrides: Object.fromEntries(hooks.map(({ id, enable }) => [id, enable])),
    ready,
    reload: () => query.refetch(),
  };
}
