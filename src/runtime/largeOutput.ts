import { type MessageContent, ToolMessage } from "@langchain/core/messages";
import { claimShortIdAsync } from "../infrastructure/randomId";
import { countTokens } from "./tokenizer";
import { inspectToolTextContent } from "./outputText";
import { isPlainObject as isRecord } from "es-toolkit";
import { join } from "node:path";
import { localize } from "../i18n/server";
import { mkdirSync } from "node:fs";
import { resolveSessionPaths } from "../infrastructure/configuration/sessionPaths";
import { writeFile } from "node:fs/promises";

interface LargeToolOutputOptions {
  maxTokens: number;
  sessionId: string;
}
export async function redirectLargeToolOutput(
  message: ToolMessage,
  options: LargeToolOutputOptions,
) {
  if (message.status === "error") {
    return message;
  }
  const normalized = inspectToolTextContent(message.content);
  if (normalized === null || normalized.isError) {
    return message;
  }
  const original = normalized.text,
    tokens = countTokens(original),
    normalizedMessage =
      normalized.normalized === message.content
        ? message
        : copyToolMessage(message, normalized.normalized);
  if (tokens <= options.maxTokens) {
    return normalizedMessage;
  }
  const outputPath = await writeLargeToolOutput(original, options.sessionId),
    content = localize("runtime:output.tooLarge", {
      value0: tokens.toString(),
      value1: outputPath,
    });
  return copyToolMessage(message, normalized.replaceText(content), {
    path: outputPath,
    tokens,
  });
}
function copyToolMessage(
  message: ToolMessage,
  content: MessageContent,
  largeOutput?: { path: string; tokens: number },
) {
  const copy = new ToolMessage({
    artifact: message.artifact,
    content,
    id: message.id,
    metadata: mergeMetadata(message.metadata, largeOutput),
    name: message.name,
    response_metadata: message.response_metadata,
    status: message.status,
    tool_call_id: message.tool_call_id,
  });
  copy.additional_kwargs = message.additional_kwargs;
  return copy;
}
function mergeMetadata(
  metadata: unknown,
  largeOutput: { path: string; tokens: number } | undefined,
) {
  if (metadata !== undefined && !isRecord(metadata)) {
    throw new Error(localize("runtime:output.metadataInvalid"));
  }
  return { ...metadata, ...(largeOutput ? { largeOutput } : {}) };
}
async function writeLargeToolOutput(content: string, sessionId: string) {
  const dir = join(resolveSessionPaths(sessionId).dir, "large_output");
  mkdirSync(dir, { recursive: true });
  let path = "";
  await claimShortIdAsync(async (id) => {
    path = join(dir, `${id}.txt`);
    try {
      await writeFile(path, content, { encoding: "utf8", flag: "wx" });
      return true;
    } catch (error) {
      if (isExistsError(error)) {
        return false;
      }
      throw error;
    }
  });
  return path;
}
function isExistsError(error: unknown) {
  return (
    error instanceof Error &&
    "code" in error &&
    (error as Error & { code?: unknown }).code === "EEXIST"
  );
}
