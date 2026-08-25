import { useCallback, useEffect } from "react";

export interface ForkPage {
  beforeMessageId: number;
  kind: "fork";
  sourceSessionId: string;
}
export type Page = ForkPage | { kind: "new" } | { kind: "session"; id: string };
const forkPrefix = "/fork/",
  sessionPrefix = "/sessions/";
export function readPage(): Page {
  return pageFromHash(globalThis.location.hash);
}
export function pageFromHash(hash: string): Page {
  const path = hash.startsWith("#") ? hash.slice(1) : hash;
  if (path === "/new") {
    return { kind: "new" };
  }
  if (path.startsWith(sessionPrefix)) {
    const id = decodeURIComponent(path.slice(sessionPrefix.length));
    if (id) {
      return { id, kind: "session" };
    }
  }
  if (path.startsWith(forkPrefix)) {
    const [source, messageId, extra] = path.slice(forkPrefix.length).split("/"),
      beforeMessageId = Number(messageId);
    if (
      source &&
      extra === undefined &&
      Number.isSafeInteger(beforeMessageId) &&
      beforeMessageId > 0
    ) {
      return {
        beforeMessageId,
        kind: "fork",
        sourceSessionId: decodeURIComponent(source),
      };
    }
  }
  return { kind: "new" };
}
export function pagePath(page: Page) {
  if (page.kind === "new") {
    return "#/new";
  }
  if (page.kind === "fork") {
    return `#/fork/${encodeURIComponent(page.sourceSessionId)}/${page.beforeMessageId.toString()}`;
  }
  return `#/sessions/${encodeURIComponent(page.id)}`;
}
export function writePage(page: Page, replace = false) {
  const path = pagePath(page);
  if (globalThis.location.hash === path) {
    return;
  }
  const method = replace ? "replaceState" : "pushState";
  globalThis.history[method](null, "", path);
}
export function usePageNavigator(setPage: (page: Page) => void) {
  "use no memo";
  return useCallback(
    (nextPage: Page, replace = false) => {
      writePage(nextPage, replace);
      setPage(nextPage);
    },
    [setPage],
  );
}
export function sessionPage(id: string): Page {
  return { id, kind: "session" };
}
export function forkPage(sourceSessionId: string, beforeMessageId: number): ForkPage {
  return { beforeMessageId, kind: "fork", sourceSessionId };
}
export function resolvePage(page: Page, sessions: { id: string }[], ready: boolean) {
  if (!ready) {
    return page;
  }
  if (page.kind === "new") {
    return page;
  }
  const sessionId = page.kind === "session" ? page.id : page.sourceSessionId;
  return sessions.some((session) => session.id === sessionId) ? page : ({ kind: "new" } as const);
}
export function usePageNavigation(page: Page, currentPage: Page, setPage: (page: Page) => void) {
  useEffect(() => {
    const syncPage = () => {
      setPage(readPage());
    };
    globalThis.addEventListener("popstate", syncPage);
    return () => {
      globalThis.removeEventListener("popstate", syncPage);
    };
  }, [setPage]);
  useEffect(() => {
    if (samePage(page, currentPage)) {
      return;
    }
    writePage(currentPage, true);
  }, [currentPage, page]);
}
function samePage(left: Page, right: Page) {
  if (left.kind !== right.kind) {
    return false;
  }
  if (left.kind === "session" && right.kind === "session") {
    return left.id === right.id;
  }
  if (left.kind === "fork" && right.kind === "fork") {
    return (
      left.sourceSessionId === right.sourceSessionId &&
      left.beforeMessageId === right.beforeMessageId
    );
  }
  return true;
}
