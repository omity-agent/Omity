export async function submitMessage({
  clearPending,
  restore,
  sending,
}: {
  clearPending: () => void;
  restore: () => void;
  sending: Promise<void>;
}) {
  clearPending();
  try {
    await sending;
  } catch (error) {
    restore();
    throw error;
  }
}
