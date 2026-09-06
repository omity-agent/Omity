import { type MouseEvent, startTransition, useCallback, useEffect } from "react";
import { isEqual } from "es-toolkit";

export function navigateLink(
  event: Pick<
    MouseEvent<HTMLAnchorElement>,
    "altKey" | "button" | "ctrlKey" | "defaultPrevented" | "metaKey" | "preventDefault" | "shiftKey"
  >,
  navigate: () => void,
) {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }
  event.preventDefault();
  navigate();
}
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
function writePage(page: Page, replace = false) {
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
      startTransition(() => setPage(nextPage));
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
export function pageSessionId(page: Page) {
  if (page.kind === "new") {
    return undefined;
  }
  return page.kind === "session" ? page.id : page.sourceSessionId;
}
export function resolvePage(page: Page, sessions: { id: string }[], ready: boolean) {
  if (!ready) {
    return page;
  }
  if (page.kind === "new") {
    return page;
  }
  const sessionId = pageSessionId(page);
  return sessions.some((session) => session.id === sessionId) ? page : ({ kind: "new" } as const);
}
export function usePageNavigation(page: Page, currentPage: Page, setPage: (page: Page) => void) {
  useEffect(() => {
    const syncPage = () => {
      startTransition(() => setPage(readPage()));
    };
    globalThis.addEventListener("popstate", syncPage);
    return () => {
      globalThis.removeEventListener("popstate", syncPage);
    };
  }, [setPage]);
  useEffect(() => {
    if (isEqual(page, currentPage)) {
      return;
    }
    writePage(currentPage, true);
  }, [currentPage, page]);
}
