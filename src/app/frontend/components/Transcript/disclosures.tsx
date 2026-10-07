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
import { localize } from "../../i18n";

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
    throw new Error(localize("frontend:transcript.disclosureContextMissing"));
  }
  const { registerDetail, states } = context,
    [open, setOpen] = useState(() => states.current.get(stateKey) ?? expandedInitially),
    onOpenChange = useCallback(
      ({ open: next }: { open: boolean }) => {
        states.current.set(stateKey, next);
        setOpen(next);
      },
      [setOpen, stateKey, states],
    );
  return { onOpenChange, open, registerDetail };
}
