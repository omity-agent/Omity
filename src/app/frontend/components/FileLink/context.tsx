import { type ReactNode, createContext, useContext } from "react";
import { localize } from "../../i18n";

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
    throw new Error(localize("frontend:fileLink.sessionContextMissing"));
  }
  return sessionId;
}
