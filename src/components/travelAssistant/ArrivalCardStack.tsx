"use client";

import { useCallback, useState } from "react";
import type { ArrivalCoachCard } from "@/lib/airportNav/gateConfidence";
import { ArrivalTransportOptionsCard } from "@/components/travelAssistant/ArrivalTransportOptionsCard";
import type { ArrivalTransportOption } from "@/lib/travelAssistant/airportNavigation";

export interface ArrivalCardStackProps {
  cards: ArrivalCoachCard[];
  activeIndex: number;
  iata: string;
  flightLabel?: string | null;
  uberUrl?: string | null;
  hotelLabel?: string | null;
  onShowMap?: () => void;
  mapVisible?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export function ArrivalCardStack({
  cards,
  activeIndex,
  iata,
  flightLabel,
  uberUrl,
  hotelLabel,
  onShowMap,
  mapVisible = true,
  className = "",
  style,
}: ArrivalCardStackProps) {
  const [stackIndex, setStackIndex] = useState(activeIndex);
  const safeIndex = Math.min(Math.max(0, stackIndex), Math.max(0, cards.length - 1));
  const current = cards[safeIndex];

  const goNext = useCallback(() => {
    setStackIndex((idx) => Math.min(idx + 1, cards.length - 1));
  }, [cards.length]);

  const goPrev = useCallback(() => {
    setStackIndex((idx) => Math.max(idx - 1, 0));
  }, []);

  if (!current || cards.length === 0) return null;

  const transportOptions: ArrivalTransportOption[] =
    current.transportOptions?.map((o) => ({
      id: o.id,
      label: o.label,
      detail: o.detail,
      href: o.href,
      isDefault: o.isDefault,
    })) ?? [];

  return (
    <div
      data-testid="arrival-card-stack"
      className={`pointer-events-auto ${className}`}
      style={style}
    >
      <div className="relative">
        {cards.slice(safeIndex + 1, safeIndex + 3).map((card, offset) => (
          <div
            key={card.id}
            aria-hidden
            className="absolute inset-x-2 rounded-2xl border border-white/10 bg-slate-900/60"
            style={{
              top: `${(offset + 1) * 6}px`,
              height: "calc(100% - 6px)",
              zIndex: 10 - offset,
            }}
          />
        ))}
        <div
          data-testid={`arrival-card-${current.id}`}
          className="relative z-20 rounded-2xl border border-sky-400/30 bg-slate-950/92 px-4 py-3.5 shadow-xl backdrop-blur-md"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/80">
              {flightLabel ? `${flightLabel} · ` : ""}
              {iata} arrival · {safeIndex + 1}/{cards.length}
            </p>
            <span className="text-lg" aria-hidden>
              {current.icon}
            </span>
          </div>
          <p className="mt-1 text-xl font-black text-white">{current.title}</p>
          {current.detail ? (
            <p className="mt-1.5 text-[14px] leading-relaxed text-sky-100/90">{current.detail}</p>
          ) : null}

          {current.id === "ride" && transportOptions.length > 0 ? (
            <div className="mt-3">
              <ArrivalTransportOptionsCard
                options={transportOptions}
                uberUrl={uberUrl}
                hotelLabel={hotelLabel}
                scheduleNote={current.scheduleNote}
              />
            </div>
          ) : current.scheduleNote ? (
            <p
              data-testid="arrival-card-schedule-note"
              className="mt-2 rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 text-xs leading-relaxed text-amber-100/90"
            >
              {current.scheduleNote}
            </p>
          ) : null}

          <div className="mt-3 flex items-center gap-2">
            {safeIndex > 0 ? (
              <button
                type="button"
                onClick={goPrev}
                className="rounded-xl bg-white/10 px-3 py-2 text-[12px] font-bold text-white"
              >
                Back
              </button>
            ) : null}
            {safeIndex < cards.length - 1 ? (
              <button
                type="button"
                data-testid="arrival-card-next"
                onClick={goNext}
                className="flex-1 rounded-xl bg-sky-600 px-3 py-2 text-[12px] font-bold text-white"
              >
                Next: {cards[safeIndex + 1]?.title}
              </button>
            ) : null}
            {onShowMap && !mapVisible ? (
              <button
                type="button"
                data-testid="arrival-card-show-map"
                onClick={onShowMap}
                className="rounded-xl bg-white/10 px-3 py-2 text-[12px] font-bold text-white"
              >
                Show map
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
