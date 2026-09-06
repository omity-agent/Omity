import { closeDatabase, configureDatabase } from "../database/connection";
import type { BuiltInPreferences } from "./metadata";
import { Database } from "bun:sqlite";
import { resolveSessionPaths } from "../configuration/sessionPaths";
import { tool } from "@langchain/core/tools";
import { writeTitleRecord } from "../database/records/sessions";
import { z } from "zod";

export function createTitleTool(
  settings: NonNullable<BuiltInPreferences["update_title"]>,
  changed?: (sessionId: string) => void,
) {
  const { title } = settings.parameters,
    segmenter = new Intl.Segmenter("und", { granularity: "grapheme" }),
    range = `${title.minLength.toString()}–${title.maxLength.toString()}`;
  return tool(
    ({ title: input }, config) => {
      config.signal?.throwIfAborted();
      const normalized = input.trim(),
        { length } = [...segmenter.segment(normalized)];
      if (length < title.minLength || length > title.maxLength) {
        throw new Error(`${settings.errors.invalidLength} (${range})`);
      }
      const sessionId = config.configurable?.["sessionId"];
      if (typeof sessionId !== "string" || sessionId.length === 0) {
        throw new Error(settings.errors.missingSession);
      }
      const db = new Database(resolveSessionPaths(sessionId).dbPath, {
        create: false,
        strict: true,
      });
      try {
        configureDatabase(db);
        writeTitleRecord(db, sessionId, normalized);
      } finally {
        closeDatabase(db);
      }
      changed?.(sessionId);
      return "ok";
    },
    {
      description: settings.description,
      name: settings.name,
      schema: z.strictObject({
        title: z.string().describe(title.description),
      }),
    },
  );
}
