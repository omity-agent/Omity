import type { Database } from "bun:sqlite";

import type { BaseMessage } from "@langchain/core/messages";

import { messageFileLinkSources } from "../../../fileLinks/messageSources";
import { probeFileLinks } from "../../../fileLinks/probe";
import type { FileLinkSurface, FilePathMatch } from "../../../fileLinks/types";
import { readStreamLinks, type StoredFileLinkSet } from "../records/transcript/matchedFiles";
import { queryAll } from "../sqlite/connection";

interface StreamState {
  inputId: number;
  matches: FilePathMatch[];
  offset: number;
  pending: string;
}
export class FileLinkIndexer {
  private readonly indexedSessions = new Set<string>();
  private readonly streams = new Map<string, StreamState>();
  constructor(private readonly db: Database) {}
  async prepareDelta(options: {
    delta: string;
    ownerId: string;
    inputId: number;
    sessionId: string;
    surface: Extract<FileLinkSurface, "content" | "reasoning">;
    workspace: string;
  }) {
    const key = `${options.sessionId}\0${options.ownerId}\0${options.surface}`,
      current = this.streams.get(key) ?? this.loadStream(options),
      { complete, pending } = splitPrefix(current.pending + options.delta),
      additions = complete ? await probeFileLinks(complete, options.workspace) : [],
      matches = [
        ...current.matches,
        ...additions.map((match) => ({
          ...match,
          position: {
            end: current.offset + match.position.end,
            start: current.offset + match.position.start,
          },
        })),
      ],
      next: StreamState = {
        inputId: options.inputId,
        matches,
        offset: current.offset + complete.length,
        pending,
      },
      links: StoredFileLinkSet[] =
        additions.length > 0
          ? [
              {
                inputId: options.inputId,
                matches,
                ownerId: options.ownerId,
                surface: options.surface,
              },
            ]
          : [];
    return {
      commit: () => this.streams.set(key, next),
      links,
    };
  }
  async prepareHistory(options: {
    sessionId: string;
    workspace: string;
    messages: BaseMessage[];
    updated: BaseMessage[];
  }) {
    const replaceAll = !this.indexedSessions.has(options.sessionId),
      sources = messageFileLinkSources(replaceAll ? options.messages : options.updated),
      links: StoredFileLinkSet[] = [];
    for (const source of sources) {
      const matches = await probeFileLinks(source.text, options.workspace);
      if (matches.length > 0) {
        links.push({
          inputId: null,
          matches,
          ownerId: source.ownerId,
          surface: source.surface,
        });
      }
    }
    return {
      commit: () => {
        this.discardSession(options.sessionId);
        this.indexedSessions.add(options.sessionId);
      },
      links,
      replaceAll,
    };
  }
  discardSession(sessionId: string) {
    this.indexedSessions.delete(sessionId);
    for (const key of this.streams.keys()) {
      if (key.startsWith(`${sessionId}\0`)) {
        this.streams.delete(key);
      }
    }
  }
  discardInputs(inputIds: Iterable<number>) {
    const discarded = new Set(inputIds);
    for (const [key, state] of this.streams) {
      if (discarded.has(state.inputId)) {
        this.streams.delete(key);
      }
    }
  }
  private loadStream(options: {
    ownerId: string;
    inputId: number;
    sessionId: string;
    surface: Extract<FileLinkSurface, "content" | "reasoning">;
  }): StreamState {
    const kind =
        options.surface === "content" ? "assistant_text_delta" : "assistant_reasoning_delta",
      text = queryAll<{ text: string }>(
        this.db,
        `SELECT json_extract(payload_json, '$') AS text FROM events
         WHERE session_id = ? AND message_id = ? AND kind = ? ORDER BY id`,
        options.sessionId,
        options.ownerId,
        kind,
      )
        .map((row) => row.text)
        .join(""),
      { complete, pending } = splitPrefix(text);
    return {
      inputId: options.inputId,
      matches: readStreamLinks(this.db, options.sessionId, options.ownerId, options.surface),
      offset: complete.length,
      pending,
    };
  }
}
function splitPrefix(text: string) {
  const offset = Math.max(text.lastIndexOf("\r"), text.lastIndexOf("\n")) + 1;
  return { complete: text.slice(0, offset), pending: text.slice(offset) };
}
