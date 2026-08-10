import { type StoredFileLinkUnit, loadStoredFileLinkUnits } from "./records/fileLinks";
import { type TextUnit, outputUnit, splitTextUnits } from "../../fileLinks/units";
import type { Database } from "bun:sqlite";
import type { FileLinkSource } from "../../fileLinks/messageSources";
import type { FileLinkSurface } from "../../fileLinks/types";
import { probeFileLinks } from "../../fileLinks/probe";
import { queryAll } from "./connection";

interface StreamState {
  nextOffset: number;
  nextUnitIndex: number;
  queueId: number;
  text: string;
}
export interface PreparedFileLinks {
  commit: () => void;
  units: StoredFileLinkUnit[];
}
export class FileLinkIndexer {
  private readonly streams = new Map<string, StreamState>();
  constructor(private readonly db: Database) {}
  async prepareDelta(options: {
    delta: string;
    ownerId: string;
    queueId: number;
    sessionId: string;
    surface: Extract<FileLinkSurface, "content" | "reasoning">;
    workspace: string;
  }): Promise<PreparedFileLinks> {
    const key = streamKey(options.sessionId, options.ownerId, options.surface),
      current = this.streams.get(key) ?? this.loadStream(options);
    if (current.queueId !== options.queueId) {
      throw new Error(`文件链接流跨越多个队列：${options.ownerId}`);
    }
    const text = current.text + options.delta,
      candidates = splitTextUnits(text, current.nextOffset, current.nextUnitIndex, false),
      units = await probeUnits(candidates, options, options.workspace),
      last = candidates.at(-1),
      next: StreamState = {
        nextOffset: last?.nextOffset ?? current.nextOffset,
        nextUnitIndex: current.nextUnitIndex + candidates.length,
        queueId: current.queueId,
        text,
      };
    return {
      commit: () => {
        this.streams.set(key, next);
      },
      units,
    };
  }
  async prepareSources(
    sessionId: string,
    workspace: string,
    sources: FileLinkSource[],
  ): Promise<StoredFileLinkUnit[]> {
    const result: StoredFileLinkUnit[] = [];
    for (const source of sources) {
      const candidates =
          source.mode === "output"
            ? [outputUnit(source.text)]
            : splitTextUnits(source.text, 0, 0, true),
        existing = loadStoredFileLinkUnits(this.db, sessionId, source.ownerId, source.surface);
      assertExistingUnits(existing, candidates, source);
      const missing = candidates.slice(existing.length);
      result.push(
        ...(await probeUnits(
          missing,
          { ownerId: source.ownerId, queueId: null, sessionId, surface: source.surface },
          workspace,
        )),
      );
    }
    return result;
  }
  discardQueue(queueId: number) {
    for (const [key, state] of this.streams) {
      if (state.queueId === queueId) {
        this.streams.delete(key);
      }
    }
  }
  private loadStream(options: {
    ownerId: string;
    queueId: number;
    sessionId: string;
    surface: Extract<FileLinkSurface, "content" | "reasoning">;
  }): StreamState {
    const kind =
        options.surface === "content" ? "assistant_text_delta" : "assistant_reasoning_delta",
      text = queryAll<{ payload_json: string }>(
        this.db,
        `SELECT payload_json FROM events
       WHERE session_id = ? AND message_id = ? AND kind = ? ORDER BY id`,
        options.sessionId,
        options.ownerId,
        kind,
      )
        .map((row) => JSON.parse(row.payload_json) as unknown)
        .map((value) => {
          if (typeof value !== "string") {
            throw new Error("文本流事件内容不是字符串");
          }
          return value;
        })
        .join(""),
      existing = loadStoredFileLinkUnits(
        this.db,
        options.sessionId,
        options.ownerId,
        options.surface,
      ),
      last = existing.at(-1);
    if ((last?.nextOffset ?? 0) > text.length) {
      throw new Error(`文件链接索引超出文本范围：${options.ownerId}`);
    }
    return {
      nextOffset: last?.nextOffset ?? 0,
      nextUnitIndex: existing.length,
      queueId: options.queueId,
      text,
    };
  }
}
async function probeUnits(
  candidates: TextUnit[],
  owner: {
    ownerId: string;
    queueId: number | null;
    sessionId: string;
    surface: FileLinkSurface;
  },
  workspace: string,
) {
  return Promise.all(
    candidates.map(async (unit): Promise<StoredFileLinkUnit> => ({
      ...unit,
      matches: unit.text ? await probeFileLinks(unit.text, workspace) : [],
      ownerId: owner.ownerId,
      queueId: owner.queueId,
      surface: owner.surface,
    })),
  );
}
function assertExistingUnits(
  existing: StoredFileLinkUnit[],
  candidates: TextUnit[],
  source: FileLinkSource,
) {
  if (existing.length > candidates.length) {
    throw new Error(`文件链接索引单元多于消息文本：${source.ownerId}`);
  }
  for (const [index, unit] of existing.entries()) {
    const candidate = candidates[index];
    if (
      !candidate ||
      candidate.start !== unit.start ||
      candidate.end !== unit.end ||
      candidate.nextOffset !== unit.nextOffset ||
      candidate.text !== unit.text
    ) {
      throw new Error(`文件链接索引与消息文本不一致：${source.ownerId}`);
    }
  }
}
function streamKey(sessionId: string, ownerId: string, surface: FileLinkSurface) {
  return `${sessionId}\0${ownerId}\0${surface}`;
}
