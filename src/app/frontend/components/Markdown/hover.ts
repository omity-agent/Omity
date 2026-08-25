import { type PointerEvent, useCallback, useMemo, useRef, useState } from "react";

export function useSourceHover() {
  const regionReference = useRef<HTMLDivElement>(null),
    [renderedHeight, setRenderedHeight] = useState<number>(),
    [menuOpen, setMenuOpen] = useState(false),
    style = useMemo(
      () => (renderedHeight === undefined ? undefined : { height: renderedHeight }),
      [renderedHeight],
    ),
    handlePointerEnter = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        setRenderedHeight(event.currentTarget.getBoundingClientRect().height);
      },
      [setRenderedHeight],
    ),
    handlePointerLeave = useCallback(() => {
      if (!menuOpen) {
        setRenderedHeight(undefined);
      }
    }, [menuOpen, setRenderedHeight]),
    handlePointerMove = useCallback(
      (event: PointerEvent<HTMLDivElement>) => {
        if (renderedHeight === undefined || menuOpen) {
          return;
        }
        const bounds = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < bounds.left ||
          event.clientX > bounds.right ||
          event.clientY < bounds.top ||
          event.clientY > bounds.bottom
        ) {
          setRenderedHeight(undefined);
        }
      },
      [menuOpen, renderedHeight, setRenderedHeight],
    ),
    onMenuOpenChange = useCallback(
      (open: boolean) => {
        setMenuOpen(open);
        if (!open && regionReference.current?.matches(":hover") !== true) {
          setRenderedHeight(undefined);
        }
      },
      [setMenuOpen, setRenderedHeight],
    );
  return {
    handlePointerEnter,
    handlePointerLeave,
    handlePointerMove,
    onMenuOpenChange,
    regionReference,
    renderedHeight,
    style,
  };
}
