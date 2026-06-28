"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { clampDualPriceRange, priceFromTrackRatio } from "@/lib/hotels/priceRangeSlider";

interface HotelPriceRangeSliderProps {
  minBound: number;
  maxBound: number;
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
  disabled?: boolean;
}

const THUMB_INSET_PX = 12;

export function HotelPriceRangeSlider({
  minBound,
  maxBound,
  valueMin,
  valueMax,
  onChange,
  disabled = false,
}: HotelPriceRangeSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const activeThumbRef = useRef<"min" | "max" | null>(null);
  const minRef = useRef(valueMin);
  const maxRef = useRef(valueMax);
  const onChangeRef = useRef(onChange);
  const [activeThumb, setActiveThumb] = useState<"min" | "max" | null>(null);

  const floor = Math.floor(minBound);
  const ceiling = Math.ceil(maxBound);
  const span = Math.max(1, ceiling - floor);
  const { min, max } = clampDualPriceRange(floor, ceiling, valueMin, valueMax);

  minRef.current = min;
  maxRef.current = max;
  onChangeRef.current = onChange;

  const valueFromClientX = useCallback(
    (clientX: number): number => {
      const track = trackRef.current;
      if (!track) return floor;
      const rect = track.getBoundingClientRect();
      const innerWidth = Math.max(1, rect.width - THUMB_INSET_PX * 2);
      const ratio = (clientX - rect.left - THUMB_INSET_PX) / innerWidth;
      return priceFromTrackRatio(floor, ceiling, ratio);
    },
    [floor, ceiling],
  );

  const applyThumbValue = useCallback((thumb: "min" | "max", value: number) => {
    if (thumb === "min") {
      onChangeRef.current(Math.min(value, maxRef.current - 1), maxRef.current);
      return;
    }
    onChangeRef.current(minRef.current, Math.max(value, minRef.current + 1));
  }, []);

  const nearestThumb = useCallback((value: number): "min" | "max" => {
    const minDist = Math.abs(value - minRef.current);
    const maxDist = Math.abs(value - maxRef.current);
    return minDist <= maxDist ? "min" : "max";
  }, []);

  const beginDrag = useCallback(
    (thumb: "min" | "max", clientX: number) => {
      if (disabled) return;
      activeThumbRef.current = thumb;
      setActiveThumb(thumb);
      applyThumbValue(thumb, valueFromClientX(clientX));
    },
    [applyThumbValue, disabled, valueFromClientX],
  );

  const endDrag = useCallback(() => {
    activeThumbRef.current = null;
    setActiveThumb(null);
  }, []);

  useEffect(() => {
    if (activeThumb === null) return;

    const handleMove = (event: PointerEvent) => {
      const thumb = activeThumbRef.current;
      if (!thumb || disabled) return;
      event.preventDefault();
      applyThumbValue(thumb, valueFromClientX(event.clientX));
    };

    const handleUp = () => {
      endDrag();
    };

    window.addEventListener("pointermove", handleMove, { passive: false });
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
    return () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
  }, [activeThumb, applyThumbValue, disabled, endDrag, valueFromClientX]);

  const insetTrack = (pctFromLeft: number) =>
    `calc(${THUMB_INSET_PX}px + ${pctFromLeft / 100} * (100% - ${THUMB_INSET_PX * 2}px))`;

  const minPct = ((min - floor) / span) * 100;
  const maxPct = ((max - floor) / span) * 100;

  const onTrackPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const target = event.target as HTMLElement;
    if (target.dataset.thumb) return;
    beginDrag(nearestThumb(valueFromClientX(event.clientX)), event.clientX);
  };

  const onThumbPointerDown = (thumb: "min" | "max") => (event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    beginDrag(thumb, event.clientX);
  };

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
        className={`relative mx-1 h-9 touch-none select-none overflow-visible ${disabled ? "opacity-50" : ""}`}
        onPointerDown={onTrackPointerDown}
        role="group"
        aria-label="Nightly budget range"
      >
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700"
          style={{ left: THUMB_INSET_PX, right: THUMB_INSET_PX }}
        />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500"
          style={{
            left: insetTrack(minPct),
            right: insetTrack(100 - maxPct),
          }}
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
          className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            activeThumb === "min" ? "z-30 scale-110 cursor-grabbing" : "z-20 cursor-grab"
          }`}
          style={{ left: insetTrack(minPct) }}
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
          className={`absolute top-1/2 h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400 ${
            activeThumb === "max" ? "z-30 scale-110 cursor-grabbing" : "z-20 cursor-grab"
          }`}
          style={{ left: insetTrack(maxPct) }}
        />
      </div>
    </div>
  );
}
