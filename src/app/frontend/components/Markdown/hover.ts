import { type PointerEvent, useCallback, useRef, useState } from "react";

export function useSourceHover() {
  const regionReference = useRef<HTMLDivElement>(null),
    [showSource, setShowSource] = useState(false),
    [menuOpen, setMenuOpen] = useState(false),
    handlePointerEnter = useCallback(() => {
      setShowSource(true);
    }, [setShowSource]),
    handlePointerLeave = useCallback(() => {
      if (!menuOpen) {
        setShowSource(false);
      }
    }, [menuOpen, setShowSource]),
    handlePointerMove = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        if (!showSource || menuOpen) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          setShowSource(false);
        }
      },
      [menuOpen, showSource, setShowSource],
    ),
    onMenuOpenChange = useCallback(
      (open: boolean) => {
        setMenuOpen(open);
        if (!open && regionReference.current?.matches(":hover") !== true) {
          setShowSource(false);
        }
      },
      [setMenuOpen, setShowSource],
    );
  return {
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    onMenuOpenChange,
    regionReference,
    showSource,
  };
}
