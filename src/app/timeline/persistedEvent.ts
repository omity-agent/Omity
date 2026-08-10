import type {
  StreamEvent,
  StreamEventKind,
} from "../../infrastructure/database/records/streamEvents";
import type { FileLinkUnit } from "../../fileLinks/types";
import type { ToolOutputSnapshot } from "../../runtime/toolOutput";
import { z } from "zod";

export interface PersistedEventRow {
  id: number;
  queue_id: number;
  message_id: string;
  part_id: string;
  kind: StreamEventKind;
  payload_json: string;
  file_links_json: string;
}
const toolOutputSchema: z.ZodType<ToolOutputSnapshot> = z.object({
    content: z.string(),
    images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
    outputTokens: z.number().int().nonnegative().optional(),
  }),
  fileLinkUnitSchema: z.ZodType<FileLinkUnit> = z.object({
    end: z.number().int().nonnegative(),
    matches: z.array(
      z.object({
        kind: z.enum(["directory", "file"]),
        path: z.string(),
        position: z.object({
          end: z.number().int().nonnegative(),
          start: z.number().int().nonnegative(),
        }),
      }),
    ),
    ownerId: z.string(),
    start: z.number().int().nonnegative(),
    surface: z.enum(["content", "reasoning", "tool_input", "tool_output"]),
    unitIndex: z.number().int().nonnegative(),
  }),
  payloadSchema = z.discriminatedUnion("kind", [
    z.object({
      kind: z.enum(["assistant_reasoning_delta", "assistant_text_delta"]),
      value: z.string(),
    }),
    z.object({
      kind: z.literal("tool_call_delta"),
      value: z.object({
        argumentsDelta: z.string().optional(),
        freeform: z.boolean().optional(),
        idDelta: z.string().optional(),
        index: z.number().int().nonnegative(),
        nameDelta: z.string().optional(),
      }),
    }),
    z.object({
      kind: z.literal("tool_finished"),
      value: z.object({
        callId: z.string().min(1),
        output: toolOutputSchema,
      }),
    }),
    z.object({
      kind: z.literal("tool_started"),
      value: z.string().min(1),
    }),
    z.object({ kind: z.literal("user_appended"), value: z.null() }),
  ]);
export function persistedDisplayEvent(row: PersistedEventRow): StreamEvent {
  const parsed = payloadSchema.safeParse({
    kind: row.kind,
    value: JSON.parse(row.payload_json) as unknown,
  });
  if (!parsed.success) {
    throw new Error("流式事件内容无效");
  }
  const links = parseFileLinkUnits(row.file_links_json),
    base = {
      id: row.id,
      messageId: row.message_id,
      partId: row.part_id,
      queueId: row.queue_id,
    },
    shared = links.length > 0 ? { fileLinks: links } : {};
  if (parsed.data.kind === "tool_call_delta") {
    return { ...base, ...shared, kind: parsed.data.kind, value: parsed.data.value };
  }
  if (parsed.data.kind === "tool_finished") {
    return { ...base, ...shared, kind: parsed.data.kind, value: parsed.data.value };
  }
  if (parsed.data.kind === "tool_started") {
    return { ...base, ...shared, kind: parsed.data.kind, value: parsed.data.value };
  }
  if (parsed.data.kind === "user_appended") {
    return { ...base, ...shared, kind: parsed.data.kind, value: parsed.data.value };
  }
  return { ...base, ...shared, kind: parsed.data.kind, value: parsed.data.value };
}
function parseFileLinkUnits(value: string): FileLinkUnit[] {
  const parsed = JSON.parse(value) as unknown,
    result = z.array(fileLinkUnitSchema).safeParse(parsed);
  if (!result.success) {
    throw new Error("流式事件文件链接索引无效");
  }
  return result.data;
}
