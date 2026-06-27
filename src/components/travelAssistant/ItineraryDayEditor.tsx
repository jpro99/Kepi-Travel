"use client";

import {
  classifyDayLine,
  parseDayLines,
  serializeDayLines,
} from "@/lib/travelAssistant/dayPlanLines";

interface ItineraryDayEditorProps {
  dateKey: string;
  value: string;
  stayCity?: string | null;
  onChange: (value: string) => void;
  onPlanDay?: () => void;
  onPlanHotel?: () => void;
}

const QUICK_LINES = [
  { label: "+ Dinner", prefix: "Dinner at " },
  { label: "+ Hotel", prefix: "Hotel in " },
  { label: "+ Activity", prefix: "Visit " },
  { label: "+ Line", prefix: "" },
] as const;

export function ItineraryDayEditor({
  value,
  stayCity,
  onChange,
  onPlanDay,
  onPlanHotel,
}: ItineraryDayEditorProps) {
  const lines = parseDayLines(value);
  const displayLines = lines.length > 0 ? lines : [""];

  const updateLines = (nextLines: string[]): void => {
    onChange(serializeDayLines(nextLines.filter((line, index) => line.trim() || index < nextLines.length - 1)));
  };

  const setLine = (index: number, text: string): void => {
    const next = [...displayLines];
    next[index] = text;
    updateLines(next);
  };

  const addQuickLine = (prefix: string): void => {
    const seed =
      prefix === "Hotel in " && stayCity
        ? `Hotel in ${stayCity}`
        : prefix === "Dinner at "
          ? "Dinner at "
          : prefix;
    const next = [...lines.filter(Boolean), seed];
    onChange(serializeDayLines(next));
  };

  const removeLine = (index: number): void => {
    const next = displayLines.filter((_, i) => i !== index);
    updateLines(next.length > 0 ? next : [""]);
  };

  return (
    <div className="space-y-1.5">
      {displayLines.map((line, index) => {
        const classified = line.trim() ? classifyDayLine(line) : null;
        return (
          <div key={`${index}-${line.slice(0, 8)}`} className="flex items-start gap-1.5">
            <span className="mt-1.5 w-4 shrink-0 text-center text-[11px]" aria-hidden>
              {classified?.icon ?? "·"}
            </span>
            <input
              type="text"
              value={line}
              placeholder={
                index === 0
                  ? "e.g. In Rome · Fly to Venice"
                  : "Dinner at Roscioli, museum, etc."
              }
              onChange={(event) => setLine(index, event.target.value)}
              className="min-w-0 flex-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[12px] text-slate-900 placeholder:text-slate-400 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
            />
            {displayLines.length > 1 || line.trim() ? (
              <button
                type="button"
                onClick={() => removeLine(index)}
                className="mt-0.5 shrink-0 rounded px-1 text-[10px] font-bold text-slate-400 hover:text-red-500"
                aria-label="Remove line"
              >
                ×
              </button>
            ) : null}
          </div>
        );
      })}

      <div className="flex flex-wrap gap-1 pt-0.5">
        {QUICK_LINES.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => addQuickLine(item.prefix)}
            className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600 hover:bg-sky-50 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-0.5">
        {stayCity ? (
          <span className="text-[10px] font-medium text-sky-700 dark:text-sky-300">📍 {stayCity}</span>
        ) : null}
        {onPlanHotel && stayCity ? (
          <button
            type="button"
            onClick={onPlanHotel}
            className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-900 dark:text-amber-200"
          >
            Hotels in {stayCity}
          </button>
        ) : null}
        {onPlanDay ? (
          <button
            type="button"
            onClick={onPlanDay}
            className="rounded bg-sky-600 px-2 py-0.5 text-[10px] font-bold text-white"
          >
            Plan day
          </button>
        ) : null}
      </div>
    </div>
  );
}
