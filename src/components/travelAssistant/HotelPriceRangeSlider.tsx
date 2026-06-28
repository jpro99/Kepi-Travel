"use client";

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
  const floor = Math.floor(minBound);
  const ceiling = Math.ceil(maxBound);
  const span = Math.max(1, ceiling - floor);
  const min = Math.max(floor, Math.min(valueMin, valueMax - 1));
  const max = Math.min(ceiling, Math.max(valueMax, min + 1));

  return (
    <div className="flex min-w-[10rem] flex-1 flex-col gap-1 sm:min-w-[14rem]">
      <div className="flex items-center justify-between gap-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
        <span>${min}</span>
        <span className="text-sky-700 dark:text-sky-300">${min} – ${max} / night</span>
        <span>${max}</span>
      </div>
      <div className="relative h-6">
        <div className="absolute left-0 right-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-sky-500"
          style={{
            left: `${((min - floor) / span) * 100}%`,
            right: `${100 - ((max - floor) / span) * 100}%`,
          }}
        />
        <input
          type="range"
          min={floor}
          max={ceiling}
          value={min}
          disabled={disabled}
          onChange={(event) => {
            const nextMin = Number(event.target.value);
            onChange(Math.min(nextMin, max - 1), max);
          }}
          className="pointer-events-auto absolute inset-0 z-20 w-full appearance-none bg-transparent opacity-0"
          aria-label="Minimum price per night"
        />
        <input
          type="range"
          min={floor}
          max={ceiling}
          value={max}
          disabled={disabled}
          onChange={(event) => {
            const nextMax = Number(event.target.value);
            onChange(min, Math.max(nextMax, min + 1));
          }}
          className="pointer-events-auto absolute inset-0 z-10 w-full appearance-none bg-transparent opacity-0"
          aria-label="Maximum price per night"
        />
        <span
          className="pointer-events-none absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow"
          style={{ left: `${((min - floor) / span) * 100}%` }}
        />
        <span
          className="pointer-events-none absolute top-1/2 z-30 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-sky-600 shadow"
          style={{ left: `${((max - floor) / span) * 100}%` }}
        />
      </div>
    </div>
  );
}
