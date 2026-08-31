import { fileLinkUnitSchema } from "../../../fileLinks/types";
import { z } from "zod";

export const toolOutputSnapshotSchema = z.object({
    content: z.string(),
    images: z.array(z.object({ mimeType: z.string(), src: z.string() })),
    outputTokens: z.number().int().nonnegative().optional(),
  }),
  streamEventBaseSchema = z.object({
    fileLinks: z.array(fileLinkUnitSchema).optional(),
    id: z.number().int().positive(),
    messageId: z.string().min(1),
    partId: z.string().min(1),
    queueId: z.number().int().positive(),
  });
export const streamEventSchema = z.discriminatedUnion("kind", [
  streamEventBaseSchema.extend({
    kind: z.literal("assistant_reasoning_delta"),
    value: z.string(),
  }),
  streamEventBaseSchema.extend({
    kind: z.literal("assistant_text_delta"),
    value: z.string(),
  }),
  streamEventBaseSchema.extend({
    kind: z.literal("tool_call_delta"),
    value: z.object({
      argumentsDelta: z.string().optional(),
      freeform: z.boolean().optional(),
      idDelta: z.string().optional(),
      index: z.number().int().nonnegative(),
      nameDelta: z.string().optional(),
    }),
  }),
  streamEventBaseSchema.extend({
    kind: z.literal("tool_finished"),
    value: z.object({
      callId: z.string().min(1),
      output: toolOutputSnapshotSchema,
    }),
  }),
  streamEventBaseSchema.extend({
    kind: z.literal("tool_started"),
    value: z.string().min(1),
  }),
  streamEventBaseSchema.extend({
    kind: z.literal("user_appended"),
    partId: z.literal("user"),
    value: z.null(),
  }),
]);
export type ToolOutputSnapshot = z.infer<typeof toolOutputSnapshotSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;
export type StreamEventKind = StreamEvent["kind"];
export type StreamEventValues = {
  [Kind in StreamEventKind]: Extract<StreamEvent, { kind: Kind }>["value"];
};
export type StreamToolCallDelta = StreamEventValues["tool_call_delta"];
export type ToolFinishedEvent = StreamEventValues["tool_finished"];
export type StreamEventDraft = {
  [Kind in StreamEventKind]: Omit<Extract<StreamEvent, { kind: Kind }>, "id">;
}[StreamEventKind];
