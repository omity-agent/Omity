import {
  type ReactNode,
  type RefObject,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";

type RegisterDetail = (element: HTMLDivElement) => () => void;
const DisclosureContext = createContext<
  { registerDetail: RegisterDetail; states: RefObject<Map<string, boolean>> } | undefined
>(undefined);
export function DisclosureProvider({
  children,
  registerDetail,
}: {
  children: ReactNode;
  registerDetail: RegisterDetail;
}) {
  const states = useRef(new Map<string, boolean>()),
    value = useMemo(() => ({ registerDetail, states }), [registerDetail, states]);
  return <DisclosureContext.Provider value={value}>{children}</DisclosureContext.Provider>;
}
export function useDisclosure(stateKey: string, expandedInitially: boolean) {
  const context = useContext(DisclosureContext);
  if (!context) {
    throw new Error("详情组件缺少会话展开状态上下文");
  }
  const { registerDetail, states } = context,
    [open, setOpen] = useState(() => states.current.get(stateKey) ?? expandedInitially),
    toggle = useCallback(() => {
      const next = !(states.current.get(stateKey) ?? expandedInitially);
      states.current.set(stateKey, next);
      setOpen(next);
    }, [expandedInitially, setOpen, stateKey, states]);
  return { open, registerDetail, toggle };
}
