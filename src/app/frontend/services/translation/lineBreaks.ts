const markerPattern =
  /(?:[{[<(@%]+[\t\p{Zs}]*)?lnbrk[\t\p{Zs}]*[-_:./\\]*[\t\p{Zs}]*(?<index>\d+)(?:[\t\p{Zs}]*[}\]>)@%]+)?/giu;
interface LineBreakMarker {
  index: number;
  token: string;
}
interface MarkerMatch {
  end: number;
  index: number;
  start: number;
}
export function encodeTranslationLineBreaks(source: string) {
  const lineBreakCount = source.match(/\r\n|\n|\r/g)?.length ?? 0,
    firstIndex = availableMarkerIndex(source, lineBreakCount),
    markers: LineBreakMarker[] = [],
    encoded = source.replaceAll(/\r\n|\n|\r/g, () => {
      const index = firstIndex + markers.length,
        token = ` {{lnbrk_${index.toString()}}} `;
      markers.push({ index, token });
      return token;
    });
  return {
    encoded,
    restore: (translated: string) => restoreLineBreaks(translated, markers),
  };
}
function availableMarkerIndex(source: string, markerCount: number) {
  const occupied = new Set(markerMatches(source).map((marker) => marker.index));
  for (let firstIndex = 0; Number.isSafeInteger(firstIndex + markerCount - 1); firstIndex += 1) {
    let available = true;
    for (let offset = 0; offset < markerCount; offset += 1) {
      if (occupied.has(firstIndex + offset)) {
        available = false;
        break;
      }
    }
    if (available) {
      return firstIndex;
    }
  }
  throw new Error("无法生成思维链翻译换行标记");
}
function markerMatches(value: string): MarkerMatch[] {
  return [...value.matchAll(markerPattern)].flatMap((match) => {
    const index = Number(match.groups?.["index"]);
    if (!Number.isSafeInteger(index)) {
      return [];
    }
    return [{ end: match.index + match[0].length, index, start: match.index }];
  });
}
function restoreLineBreaks(translated: string, markers: LineBreakMarker[]) {
  const matchesByIndex = Map.groupBy(markerMatches(translated), (match) => match.index),
    missing: LineBreakMarker[] = [],
    matches = markers.flatMap((marker) => {
      const found = matchesByIndex.get(marker.index) ?? [];
      if (found.length === 0) {
        missing.push(marker);
        return [];
      }
      if (found.length > 1) {
        throw new Error(`思维链翻译重复换行标记：${marker.token}`);
      }
      return { marker, match: found[0]! };
    });
  if (missing.length > 0) {
    console.warn("思维链翻译丢失换行标记", {
      markers: missing.map((marker) => marker.token),
    });
  }
  for (let index = 1; index < matches.length; index += 1) {
    if (matches[index]!.match.start < matches[index - 1]!.match.end) {
      throw new Error(`思维链翻译换行标记顺序错误：${matches[index]!.marker.token}`);
    }
  }
  let cursor = 0,
    restored = "";
  for (const { match } of matches) {
    const start = isHorizontalSpace(translated[match.start - 1]) ? match.start - 1 : match.start,
      end = isHorizontalSpace(translated[match.end]) ? match.end + 1 : match.end;
    restored += `${translated.slice(cursor, Math.max(cursor, start))}\n`;
    cursor = end;
  }
  return restored + translated.slice(cursor);
}
function isHorizontalSpace(value: string | undefined) {
  return value !== undefined && /[\t\p{Zs}]/u.test(value);
}
