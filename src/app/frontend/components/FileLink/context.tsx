import { type ReactNode, createContext, useContext } from "react";

const SessionContext = createContext<string | undefined>(undefined);
export function FileLinkProvider({
  children,
  sessionId,
}: {
  children: ReactNode;
  sessionId: string;
}) {
  return <SessionContext value={sessionId}>{children}</SessionContext>;
}
export function useFileLinkSession() {
  const sessionId = useContext(SessionContext);
  if (sessionId === undefined) {
    throw new Error("文件链接组件缺少 Session 上下文");
  }
  return sessionId;
}
