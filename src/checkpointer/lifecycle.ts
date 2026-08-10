import type { Database } from "bun:sqlite";

export function deleteThreadData(db: Database, threadId: string) {
  const removeWrites = db.prepare("DELETE FROM checkpoint_writes WHERE thread_id = ?"),
    removeCheckpoint = db.prepare("DELETE FROM checkpoints WHERE thread_id = ?");
  try {
    removeWrites.run(threadId);
    removeCheckpoint.run(threadId);
  } finally {
    removeWrites.finalize();
    removeCheckpoint.finalize();
  }
}
