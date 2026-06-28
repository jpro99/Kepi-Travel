"use client";

import { useCallback, useRef, useState } from "react";
import { clampDualPriceRange, priceFromTrackRatio } from "@/lib/hotels/priceRangeSlider";

interface HotelPriceRangeSliderProps {
  minBound: number;
  maxBound: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  disabled?: boolean;
}

export function HotelPriceRangeSlider({
  minBound,
  maxBound,
  valueMin,
  valueMax,
  onChange,
  disabled = false,
}: HotelPriceRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);

  const floor = Math.floor(minBound);
  const ceiling = Math.ceil(maxBound);
  const span = Math.max(1, ceiling - floor);
  const { min, max } = clampDualPriceRange(floor, ceiling, valueMin, valueMax);

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return floor;
      const rect = track.getBoundingClientRect();
      if (rect.width <= 0) return floor;
      return priceFromTrackRatio(floor, ceiling, (clientX - rect.left) / rect.width);
    },
    [floor, ceiling],
  );

  const nearestThumb = useCallback(
    (value: number): "min" | "max" => {
      const minDist = Math.abs(value - min);
      const maxDist = Math.abs(value - max);
      return minDist <= maxDist ? "min" : "max";
    },
    [min, max],
  );

  const applyThumbValue = useCallback(
    (thumb: "min" | "max", value: number) => {
      if (thumb === "min") {
        onChange(Math.min(value, max - 1), max);
      } else {
        onChange(min, Math.max(value, min + 1));
      }
    },
    [min, max, onChange],
  );

  const onDragPointerMove = (event: React.PointerEvent) => {
    if (disabled || activeThumb === null) return;
    applyThumbValue(activeThumb, valueFromClientX(event.clientX));
  };

  const endDrag = (event: React.PointerEvent) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    setActiveThumb(null);
  };

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.dataset.thumb) return;

    const value = valueFromClientX(event.clientX);
    const thumb = nearestThumb(value);
    setActiveThumb(thumb);
    event.currentTarget.setPointerCapture(event.pointerId);
    applyThumbValue(thumb, value);
  };

  const onThumbPointerDown = (thumb: "min" | "max") => (event: React.PointerEvent<HTMLButtonElement>) => {
    if (disabled) return;
    event.stopPropagation();
    setActiveThumb(thumb);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const minPct = ((min - floor) / span) * 100;
  const maxPct = ((max - floor) / span) * 100;

  return (
    <div className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:min-w-[14rem]">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
        <span>${min}</span>
        <span className="text-sky-700 dark:text-sky-300">
          ${min} – ${max} / night
        </span>
        <span>${max}</span>
      </div>
      <div
        ref={trackRef}
        className={`relative h-8 touch-none select-none ${disabled ? "opacity-50" : ""}`}
        onPointerDown={onTrackPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        role="group"
        aria-label="Nightly budget range"
      >
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500"
          style={{ left: `${minPct}%`, right: `${100 - maxPct}%` }}
        />
        <button
          type="button"
          data-thumb="min"
          disabled={disabled}
          aria-label="Minimum price per night"
          aria-valuemin={floor}
          aria-valuemax={max - 1}
          aria-valuenow={min}
          onPointerDown={onThumbPointerDown("min")}
          onPointerMove={onDragPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            activeThumb === "min" ? "scale-110 cursor-grabbing" : "cursor-grab"
          }`}
          style={{ left: `${minPct}%` }}
        />
        <button
          type="button"
          data-thumb="max"
          disabled={disabled}
          aria-label="Maximum price per night"
          aria-valuemin={min + 1}
          aria-valuemax={ceiling}
          aria-valuenow={max}
          onPointerDown={onThumbPointerDown("max")}
          onPointerMove={onDragPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          className={`absolute top-1/2 z-20 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            activeThumb === "max" ? "scale-110 cursor-grabbing" : "cursor-grab"
          }`}
          style={{ left: `${maxPct}%` }}
        />
      </div>
    </div>
  );
}
