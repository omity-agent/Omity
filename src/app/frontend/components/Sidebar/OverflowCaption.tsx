import { useCallback, useEffect, useRef, useState } from "react";
import { css } from "styled-system/css";

const viewport = css({ flex: "1", minW: 0, overflow: "hidden" }),
  content = css({
    display: "block",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  });
export function OverflowCaption({ text, className }: { text: string; className: string }) {
  const ref = useRef<HTMLSpanElement>(null),
    [hovered, setHovered] = useState(false),
    enter = useCallback(() => setHovered(true), [setHovered]),
    leave = useCallback(() => setHovered(false), [setHovered]);
  useEffect(() => {
    if (!hovered || text.length === 0) {
      return undefined;
    }
    const element = ref.current;
    if (!element) {
      throw new Error("会话标题元素未挂载");
    }
    const motion = globalThis.matchMedia(
      "(hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)",
    );
    let animation: Animation | undefined;
    const stop = () => {
        animation?.cancel();
        animation = undefined;
        element.style.removeProperty("overflow");
      },
      start = () => {
        stop();
        const distance = element.scrollWidth - element.clientWidth;
        if (!motion.matches || distance <= 0) {
          return;
        }
        const duration = distance * 35 + 1600,
          pause = 800 / duration,
          end = `translateX(-${distance}px)`;
        element.style.overflow = "visible";
        animation = element.animate(
          [
            { offset: 0, transform: "translateX(0)" },
            { offset: pause, transform: "translateX(0)" },
            { offset: 1 - pause, transform: end },
            { offset: 1, transform: end },
          ],
          { direction: "alternate", duration, easing: "linear", iterations: Infinity },
        );
      },
      observer = new ResizeObserver(start);
    observer.observe(element);
    motion.addEventListener("change", start);
    document.fonts.addEventListener("loadingdone", start);
    start();
    return () => {
      observer.disconnect();
      motion.removeEventListener("change", start);
      document.fonts.removeEventListener("loadingdone", start);
      stop();
    };
  }, [hovered, text]);
  return (
    <span className={className} onMouseEnter={enter} onMouseLeave={leave}>
      <span className={viewport}>
        <span className={content} ref={ref}>
          {text}
        </span>
      </span>
    </span>
  );
}
