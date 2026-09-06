import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from "react";

const DisclosureContext = createContext<Map<string, boolean> | undefined>(undefined);
export function DisclosureProvider({ children }: { children: ReactNode }) {
  const states = useMemo(() => new Map<string, boolean>(), []);
  return <DisclosureContext.Provider value={states}>{children}</DisclosureContext.Provider>;
}
export function useDisclosure(stateKey: string, expandedInitially: boolean) {
  const states = useContext(DisclosureContext);
  if (!states) {
    throw new Error("详情组件缺少会话展开状态上下文");
  }
  const [open, setOpen] = useState(() => states.get(stateKey) ?? expandedInitially),
    onOpenChange = useCallback(
      (details: { open: boolean }) => {
        states.set(stateKey, details.open);
        setOpen(details.open);
      },
      [setOpen, stateKey, states],
    );
  return { onOpenChange, open };
}
