import type { BuiltInPreferences } from "./metadata";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function createTitleTool(settings: NonNullable<BuiltInPreferences["update_title"]>) {
  const { title } = settings.parameters,
    segmenter = new Intl.Segmenter("und", { granularity: "grapheme" }),
    range = `${title.minLength.toString()}–${title.maxLength.toString()}`,
    titleTool = tool(
      ({ title: input }, config) => {
        config.signal?.throwIfAborted();
        const normalized = input.trim(),
          { length } = [...segmenter.segment(normalized)];
        if (length < title.minLength || length > title.maxLength) {
          throw new Error(`${settings.errors.invalidLength} (${range})`);
        }
        return "ok";
      },
      {
        description: settings.description,
        metadata: { builtInTool: "update_title" },
        name: settings.name,
        schema: z.strictObject({
          title: z.string().describe(title.description),
        }),
      },
    );
  return titleTool;
}
