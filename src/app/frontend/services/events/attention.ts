import { useEffect, useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { SessionInfo } from "../client";
import type { SessionStatus } from "../../../../types";

type Listener = () => void;
const stores = new WeakMap<QueryClient, SessionAttentionStore>();
export class SessionAttentionStore {
  private activeId?: string;
  private readonly listeners = new Set<Listener>();
  private statuses = new Map<string, SessionStatus>();
  private unread: ReadonlySet<string> = new Set();
  replace(sessions: Pick<SessionInfo, "id" | "status">[]) {
    this.statuses = new Map(sessions.map(({ id, status }) => [id, status]));
    this.updateUnread(
      new Set(
        [...this.unread].filter((id) => {
          const status = this.statuses.get(id);
          return id !== this.activeId && status !== undefined && !isRunningStatus(status);
        }),
      ),
    );
  }
  upsert(session: Pick<SessionInfo, "id" | "status">) {
    const previousStatus = this.statuses.get(session.id);
    this.statuses.set(session.id, session.status);
    const unread = new Set(this.unread);
    if (session.id === this.activeId || isRunningStatus(session.status)) {
      unread.delete(session.id);
    } else if (previousStatus && isRunningStatus(previousStatus)) {
      unread.add(session.id);
    }
    this.updateUnread(unread);
  }
  remove(sessionId: string) {
    this.statuses.delete(sessionId);
    const unread = new Set(this.unread);
    unread.delete(sessionId);
    this.updateUnread(unread);
  }
  view(sessionId?: string) {
    this.activeId = sessionId;
    if (!sessionId || !this.unread.has(sessionId)) {
      return;
    }
    const unread = new Set(this.unread);
    unread.delete(sessionId);
    this.updateUnread(unread);
  }
  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  snapshot = () => this.unread;
  private updateUnread(unread: ReadonlySet<string>) {
    if (sameSet(this.unread, unread)) {
      return;
    }
    this.unread = unread;
    for (const listener of this.listeners) {
      listener();
    }
  }
}
export function isRunningStatus(status: SessionStatus) {
  return status === "model" || status === "pausing" || status === "tool";
}
export function sessionAttentionStore(queryClient: QueryClient) {
  const existing = stores.get(queryClient);
  if (existing) {
    return existing;
  }
  const store = new SessionAttentionStore();
  stores.set(queryClient, store);
  return store;
}
export function useSessionAttention(queryClient: QueryClient, activeId?: string) {
  const store = sessionAttentionStore(queryClient);
  const unread = useSyncExternalStore(store.subscribe, store.snapshot);
  useEffect(() => {
    store.view(activeId);
  }, [activeId, store]);
  return unread;
}
function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>) {
  return left.size === right.size && [...left].every((id) => right.has(id));
}
