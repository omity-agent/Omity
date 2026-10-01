import type { BuiltInPreferences } from "./metadata";
import { countTokens } from "../../runtime/tokenizer";
import { tool } from "@langchain/core/tools";
import { z } from "zod";

export function createTitleTool(settings: NonNullable<BuiltInPreferences["update_title"]>) {
  const { title } = settings.parameters,
    range = `${title.minTokens.toString()}–${title.maxTokens.toString()} tokens`,
    titleTool = tool(
      ({ title: input }, config) => {
        config.signal?.throwIfAborted();
        const normalized = input.trim(),
          tokens = countTokens(normalized);
        if (tokens < title.minTokens || tokens > title.maxTokens) {
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
