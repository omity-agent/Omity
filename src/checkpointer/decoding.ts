/* oxlint-disable unicorn/prefer-structured-clone -- 检查点需要保留 LangChain 消息的原型。 */
import type {
  Checkpoint,
  CheckpointMetadata,
  CheckpointTuple,
  SerializerProtocol,
} from "@langchain/langgraph-checkpoint";
import { BaseMessage } from "@langchain/core/messages";
import type { RecoverySnapshot } from "../infrastructure/database/records/restoration";
import { cloneDeepWith } from "es-toolkit";
import { z } from "zod";

interface DecodedHead {
  checkpoint: Checkpoint;
  metadata: CheckpointMetadata;
  row: RecoverySnapshot;
  serde: SerializerProtocol;
}
export class CheckpointDecoder {
  private head?: DecodedHead;
  async decode(row: RecoverySnapshot, serde: SerializerProtocol): Promise<CheckpointTuple> {
    let { head } = this;
    if (
      !head ||
      head.serde !== serde ||
      head.row.type !== row.type ||
      !sameBytes(head.row.checkpoint, row.checkpoint) ||
      !sameBytes(head.row.metadata, row.metadata)
    ) {
      const [checkpoint, metadata] = await Promise.all([
        serde.loadsTyped(row.type, row.checkpoint),
        serde.loadsTyped(row.type, row.metadata),
      ]);
      head = {
        checkpoint: checkpointSchema.parse(checkpoint),
        metadata: metadataSchema.parse(metadata),
        row,
        serde,
      };
      this.head = head;
    }
    const pendingWrites = await Promise.all(
      row.pendingWrites.map(async (write) => {
        const value = await serde.loadsTyped(write.type, write.value);
        return [write.taskId, write.channel, value] as [string, string, unknown];
      }),
    );
    return {
      checkpoint: cloneDeepWith(head.checkpoint, cloneMessage),
      config: {
        configurable: {
          checkpoint_id: row.checkpointId,
          checkpoint_ns: row.checkpointNs,
          thread_id: row.runId.toString(),
        },
      },
      metadata: cloneDeepWith(head.metadata, cloneMessage),
      pendingWrites,
    };
  }
}
function cloneMessage(value: unknown): unknown {
  if (BaseMessage.isInstance(value)) {
    return Reflect.construct(value.constructor, [cloneDeepWith(value.toDict().data, cloneMessage)]);
  }
  return undefined;
}
function sameBytes(left: Uint8Array, right: Uint8Array) {
  return Buffer.from(left.buffer, left.byteOffset, left.byteLength).equals(right);
}
const channelVersionSchema = z.union([z.number(), z.string()]),
  channelVersionsSchema = z.record(z.string(), channelVersionSchema),
  checkpointSchema: z.ZodType<Checkpoint> = z.looseObject({
    channel_values: z.record(z.string(), z.unknown()),
    channel_versions: channelVersionsSchema,
    id: z.string(),
    ts: z.string(),
    v: z.number(),
    versions_seen: z.record(z.string(), channelVersionsSchema),
  }),
  metadataSchema: z.ZodType<CheckpointMetadata> = z.looseObject({
    parents: z.record(z.string(), z.string()),
    source: z.enum(["input", "loop", "update", "fork"]),
    step: z.number(),
  });
