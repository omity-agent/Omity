import { type ProbeMode, fileLinkProbeUnits } from "./probeUnits";
import type { FilePathMatch } from "../../../fileLinks/types";
import { probeFileLinks } from "../../services/client";
import { useFileLinkSession } from "./context";
import { useMemo } from "react";
import { useQueries } from "@tanstack/react-query";

export interface FileLinkMatches {
  matches: FilePathMatch[];
  positionSettled: (start: number, end: number) => boolean;
}
export function useFileLinkMatches(
  text: string,
  mode: ProbeMode,
  complete: boolean,
  identity: string,
): FileLinkMatches {
  const sessionId = useFileLinkSession();
  const units = useMemo(() => fileLinkProbeUnits(text, mode, complete), [complete, mode, text]);
  const queries = useQueries({
    queries: units.map((unit) => ({
      gcTime: Number.POSITIVE_INFINITY,
      queryFn: ({ signal }: { signal: AbortSignal }) =>
        probeFileLinks(sessionId, unit.text, signal),
      queryKey: ["file-links", sessionId, identity, unit.key, unit.text],
      refetchOnWindowFocus: false,
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    })),
  });
  const matches = units
    .flatMap((unit, index) =>
      (requiredQuery(queries.at(index)).data?.matches ?? []).map((match): FilePathMatch => ({
        kind: match.kind,
        path: match.path,
        position: {
          end: unit.start + match.position.end,
          start: unit.start + match.position.start,
        },
      })),
    )
    .toSorted((left, right) => left.position.start - right.position.start);
  return {
    matches,
    positionSettled: (start: number, end: number) =>
      units.some((unit, index) => {
        const query = requiredQuery(queries.at(index));
        return start >= unit.start && end <= unit.end && !query.isPending && !query.isFetching;
      }),
  };
}
function requiredQuery<T>(query: T | undefined): T {
  if (query === undefined) {
    throw new Error("文件链接探测结果与文本单元不一致");
  }
  return query;
}
