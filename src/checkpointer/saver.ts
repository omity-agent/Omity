import {
  BaseCheckpointSaver,
  type Checkpoint,
  type CheckpointListOptions,
  type CheckpointMetadata,
  type CheckpointTuple,
  type PendingWrite,
  WRITES_IDX_MAP,
  copyCheckpoint,
} from "@langchain/langgraph-checkpoint";
import { checkpointRunId, configIdentity, listIdentity } from "./identity";
import { CheckpointDecoder } from "./decoding";
import type { Database } from "bun:sqlite";
import { RecoveryStore } from "../infrastructure/database/records/restoration";
import type { RunnableConfig } from "@langchain/core/runnables";
import { localize } from "../i18n/server";

export class BunSqliteSaver extends BaseCheckpointSaver {
  private readonly decoder = new CheckpointDecoder();
  private readonly storage: RecoveryStore;
  constructor(readonly db: Database) {
    super();
    this.storage = new RecoveryStore(db);
  }
  async getTuple(config: RunnableConfig): Promise<CheckpointTuple | undefined> {
    const { checkpointId, checkpointNs, runId } = configIdentity(config),
      row = this.storage.get({ checkpointNs, runId });
    if (!row) {
      return undefined;
    }
    if (checkpointId !== undefined && checkpointId !== row.checkpointId) {
      throw new Error(localize("checkpoint:saver.checkpointUnavailable", { value0: checkpointId }));
    }
    return this.decoder.decode(row, this.serde);
  }
  async *list(
    config: RunnableConfig,
    options?: CheckpointListOptions,
  ): AsyncGenerator<CheckpointTuple> {
    for (const row of this.storage.list(listIdentity(config, options))) {
      yield await this.decoder.decode(row, this.serde);
    }
  }
  async put(
    config: RunnableConfig,
    checkpoint: Checkpoint,
    metadata: CheckpointMetadata,
  ): Promise<RunnableConfig> {
    const identity = configIdentity(config),
      [[type, value], [metadataType, metadataValue]] = await Promise.all([
        this.serde.dumpsTyped(copyCheckpoint(checkpoint)),
        this.serde.dumpsTyped(metadata),
      ]);
    if (type !== metadataType) {
      throw new Error(localize("checkpoint:saver.metadataTypeMismatch"));
    }
    this.storage.put(
      {
        ...identity,
        checkpoint: Buffer.from(value),
        checkpointId: checkpoint.id,
        metadata: Buffer.from(metadataValue),
        type,
      },
      identity.checkpointId,
    );
    return {
      configurable: {
        checkpoint_id: checkpoint.id,
        checkpoint_ns: identity.checkpointNs,
        thread_id: identity.runId.toString(),
      },
    };
  }
  async putWrites(config: RunnableConfig, writes: PendingWrite[], taskId: string) {
    const identity = configIdentity(config);
    if (!identity.checkpointId) {
      throw new Error(localize("checkpoint:saver.idMissing"));
    }
    const { checkpointId } = identity,
      rows = await Promise.all(
        writes.map(async ([channel, value], index) => {
          const [type, serialized] = await this.serde.dumpsTyped(value);
          return {
            channel,
            index: WRITES_IDX_MAP[channel] ?? index,
            replace: channel in WRITES_IDX_MAP,
            taskId,
            type,
            value: Buffer.from(serialized),
          };
        }),
      );
    this.storage.putWrites({ ...identity, checkpointId }, rows);
  }
  async deleteThread(threadId: string) {
    this.storage.delete(checkpointRunId(threadId));
  }
}
