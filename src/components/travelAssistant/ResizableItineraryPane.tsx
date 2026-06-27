"use client";

import { useCallback, useEffect, useRef } from "react";

interface ResizableItineraryPaneProps {
  width: number;
  minWidth?: number;
  maxWidth?: number;
  onWidthChange: (width: number) => void;
  children: React.ReactNode;
}

export function ResizableItineraryPane({
  width,
  minWidth = 300,
  maxWidth,
  onWidthChange,
  children,
}: ResizableItineraryPaneProps) {
  const draggingRef = useRef(false);
  const computedMax = maxWidth ?? Math.round(typeof window !== "undefined" ? window.innerWidth * 0.72 : 1200);

  const clamp = useCallback(
    (next: number) => Math.min(computedMax, Math.max(minWidth, next)),
    [computedMax, minWidth],
  );

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      if (!draggingRef.current) return;
      onWidthChange(clamp(event.clientX));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [clamp, onWidthChange]);

  return (
    <aside
      className="sticky top-0 hidden h-screen shrink-0 border-r border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-950 lg:block"
      style={{ width }}
    >
      {children}
      <button
        type="button"
        aria-label="Resize itinerary panel"
        title="Drag to resize"
        onMouseDown={() => {
          draggingRef.current = true;
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
        className="absolute -right-1.5 top-0 z-20 flex h-full w-3 cursor-col-resize items-center justify-center bg-transparent hover:bg-sky-400/25 active:bg-sky-500/35"
      >
        <span className="h-10 w-0.5 rounded-full bg-slate-300 dark:bg-slate-600" aria-hidden />
      </button>
    </aside>
  );
}
