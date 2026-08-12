const markerName = "LNBRK";
interface LineBreakMarker {
  lineBreak: string;
  token: string;
}
export function encodeTranslationLineBreaks(source: string) {
  const nonce = availableNonce(source),
    markers: LineBreakMarker[] = [],
    encoded = source.replaceAll(/\r\n|\n|\r/g, (lineBreak) => {
      const token = `[[${markerName}_${nonce.toString()}_${markers.length.toString()}_${lineBreakKind(lineBreak)}]]`;
      markers.push({ lineBreak, token });
      return token;
    });
  return {
    encoded,
    restore: (translated: string) => restoreLineBreaks(translated, markers),
  };
}
function availableNonce(source: string) {
  for (let nonce = 0; Number.isSafeInteger(nonce); nonce += 1) {
    if (!source.includes(`[[${markerName}_${nonce.toString()}_`)) {
      return nonce;
    }
  }
  throw new Error("无法生成思维链翻译换行标记");
}
function lineBreakKind(value: string) {
  if (value === "\n") {
    return "LF";
  }
  if (value === "\r\n") {
    return "CRLF";
  }
  if (value === "\r") {
    return "CR";
  }
  throw new Error("思维链翻译包含未知换行符");
}
function restoreLineBreaks(translated: string, markers: LineBreakMarker[]) {
  let cursor = 0,
    restored = translated;
  for (const marker of markers) {
    const position = translated.indexOf(marker.token, cursor);
    if (position === -1) {
      throw new Error(`思维链翻译丢失换行标记：${marker.token}`);
    }
    if (translated.includes(marker.token, position + marker.token.length)) {
      throw new Error(`思维链翻译重复换行标记：${marker.token}`);
    }
    cursor = position + marker.token.length;
    restored = restored.replace(marker.token, marker.lineBreak);
  }
  return restored;
}
