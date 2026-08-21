"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode, type PointerEvent as ReactPointerEvent } from "react";

interface MobileBottomSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** Initial snap: peek shows ~45% of screen */
  initialSnap?: "peek" | "full";
}

export function MobileBottomSheet({
  open,
  title,
  onClose,
  children,
  initialSnap = "peek",
}: MobileBottomSheetProps) {
  const [snap, setSnap] = useState<"peek" | "full">(initialSnap);
  const dragRef = useRef<{ startY: number; startOffset: number } | null>(null);
  const [dragOffset, setDragOffset] = useState(0);

  useEffect(() => {
    if (open) {
      setSnap(initialSnap);
      setDragOffset(0);
    }
  }, [open, initialSnap]);

  const handlePointerDown = useCallback((e: ReactPointerEvent) => {
    dragRef.current = { startY: e.clientY, startOffset: dragOffset };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [dragOffset]);

  const handlePointerMove = useCallback((e: ReactPointerEvent) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    setDragOffset(Math.max(-80, dragRef.current.startOffset + dy));
  }, []);

  const handlePointerUp = useCallback(() => {
    if (!dragRef.current) return;
    if (dragOffset > 120) {
      onClose();
    } else if (dragOffset < -60) {
      setSnap("full");
    } else if (snap === "full" && dragOffset > 40) {
      setSnap("peek");
    }
    setDragOffset(0);
    dragRef.current = null;
  }, [dragOffset, onClose, snap]);

  if (!open) return null;

  const heightClass = snap === "full" ? "h-[92dvh]" : "h-[58dvh]";

  return (
    <div className="fixed inset-0 z-[8000] flex flex-col justify-end pointer-events-auto overscroll-contain">
      <button
        type="button"
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] overscroll-contain"
        aria-label="Close sheet"
        onClick={onClose}
      />
      <section
        className={`relative z-[8001] flex ${heightClass} max-h-[92dvh] w-full flex-col rounded-t-[28px] border border-[var(--border-default)] bg-[var(--bg-base)] shadow-[0_-12px_48px_rgba(0,0,0,0.25)] transition-transform`}
        style={{ transform: `translateY(${Math.max(0, dragOffset)}px)` }}
      >
        <div
          className="flex shrink-0 cursor-grab flex-col items-center px-4 pb-2 pt-3 active:cursor-grabbing"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          <span className="mb-3 h-1 w-10 rounded-full bg-[var(--border-default)]" />
          <div className="flex w-full items-center justify-between gap-2">
            <h2 className="text-[20px] font-bold tracking-tight text-[var(--text-primary)]">{title}</h2>
            <button
              type="button"
              onClick={() => setSnap(snap === "full" ? "peek" : "full")}
              className="rounded-full px-3 py-1.5 text-[13px] font-semibold text-[var(--accent)]"
            >
              {snap === "full" ? "Collapse" : "Expand"}
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-28 pt-1">
          {children}
        </div>
      </section>
    </div>
  );
}
