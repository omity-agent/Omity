export function conversationHeaders(sessionId: string, turnId?: string) {
  return {
    "session-id": sessionId,
    "thread-id": sessionId,
    "x-client-request-id": sessionId,
    "x-codex-window-id": sessionId,
    ...(turnId
      ? {
          "x-codex-turn-metadata": JSON.stringify({
            session_id: sessionId,
            thread_id: sessionId,
            turn_id: turnId,
          }),
        }
      : {}),
  };
}
