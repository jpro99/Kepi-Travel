"use client";

import { useMemo } from "react";
import {
  classifyDayLine,
  parseDayIntentFromLines,
  parseDayLines,
  parseDayLinesForEditor,
  serializeDayLines,
  serializeDayLinesForEditor,
} from "@/lib/travelAssistant/dayPlanLines";
import { buildDayStayTimeline } from "@/lib/travelAssistant/dayStayTimeline";
import { formatLetterDayHeading } from "@/lib/travelAssistant/letterDayPlan";

interface ItineraryDayEditorProps {
  dateKey: string;
  value: string;
  stayCity?: string | null;
  tripStartDate?: string | null;
  tripEndDate?: string | null;
  onChange: (value: string) => void;
  onPlanDay?: () => void;
  onPlanHotel?: () => void;
}

const LINE_TEMPLATES = [
  { label: "Staying in…", text: "Stay in " },
  { label: "Travel to…", text: "Go to " },
  { label: "Leave city", text: "Leave " },
  { label: "Hotel", text: "Hotel in " },
  { label: "Dinner", text: "Dinner at " },
] as const;

function intentChipClass(kind: string | undefined): string {
  if (kind === "move" || kind === "depart") return "bg-amber-100 text-amber-950 dark:bg-amber-950/50 dark:text-amber-100";
  if (kind === "arrive" || kind === "stay") return "bg-sky-100 text-sky-950 dark:bg-sky-950/50 dark:text-sky-100";
  return "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200";
}

export function ItineraryDayEditor({
  dateKey,
  value,
  stayCity,
  tripStartDate,
  tripEndDate,
  onChange,
  onPlanDay,
  onPlanHotel,
}: ItineraryDayEditorProps) {
  const lines = parseDayLines(value);
  const displayLines = useMemo(() => {
    const editorLines = parseDayLinesForEditor(value);
    return editorLines.length > 0 ? editorLines : [""];
  }, [value]);
  const parsedIntent = useMemo(() => parseDayIntentFromLines(value), [value]);

  const daySnapshot = useMemo(() => {
    if (!tripStartDate || !tripEndDate) return null;
    return buildDayStayTimeline(tripStartDate, tripEndDate, { [dateKey]: value }).get(dateKey) ?? null;
  }, [dateKey, tripEndDate, tripStartDate, value]);

  const updateLines = (nextLines: string[]): void => {
    onChange(serializeDayLinesForEditor(nextLines));
  };

  const setLine = (index: number, text: string): void => {
    const next = [...displayLines];
    next[index] = text;
    updateLines(next);
  };

  const addTemplate = (seed: string): void => {
    const text =
      seed === "Hotel in " && stayCity
        ? `Hotel in ${stayCity}`
        : seed;
    onChange(serializeDayLinesForEditor([...parseDayLinesForEditor(value).filter((line) => line.trim()), text]));
  };

  const removeLine = (index: number): void => {
    const next = displayLines.filter((_, i) => i !== index);
    updateLines(next.length > 0 ? next : [""]);
  };

  const headline = daySnapshot?.headline ?? parsedIntent?.summary ?? null;
  const letterHeading = formatLetterDayHeading(dateKey);

  return (
    <div className="space-y-3">
      <h3 className="text-[20px] font-bold text-[#1D1D1F]">{letterHeading}</h3>
      {headline ? (
        <div className={`rounded-xl px-3 py-2 text-sm font-semibold ${intentChipClass(parsedIntent?.kind)}`}>
          {headline}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[#E8E0D4] bg-[#FAF6EF] px-3 py-2 text-[15px] text-[#6E6E73]">
          Add a line the way you would in a Word itinerary — boat tour, gelato, checkout.
        </p>
      )}

      <div className="space-y-2">
        {displayLines.map((line, index) => {
          const classified = line.trim() ? classifyDayLine(line) : null;
          return (
            <div
              key={`${index}-${line.slice(0, 12)}`}
              className="rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-700 dark:bg-slate-950"
            >
              <div className="mb-1.5 flex items-center justify-between gap-2 px-1">
                <span className="text-xs font-bold text-slate-500">
                  {classified ? `${classified.icon} ${classified.kind}` : "Line"}
                </span>
                {displayLines.length > 1 || line.trim() ? (
                  <button
                    type="button"
                    onClick={() => removeLine(index)}
                    className="rounded-lg px-2 py-0.5 text-xs font-bold text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label="Remove line"
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <textarea
                value={line}
                rows={2}
                placeholder={
                  index === 0
                    ? "Stay in Monopoli\nLeave Ortisei, go to Munich"
                    : "Dinner at Roscioli, museum visit, etc."
                }
                onChange={(event) => setLine(index, event.target.value)}
                className="min-h-[3.25rem] w-full resize-y rounded-xl border-0 bg-slate-50 px-3 py-2.5 text-base leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-400 dark:bg-slate-900 dark:text-slate-100"
              />
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {LINE_TEMPLATES.map((item) => (
          <button
            key={item.label}
            type="button"
            onClick={() => addTemplate(item.text)}
            className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:border-sky-300 hover:text-sky-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {stayCity ? (
          <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-bold text-sky-900 dark:bg-sky-950 dark:text-sky-100">
            Overnight: {stayCity}
          </span>
        ) : daySnapshot?.phase === "depart" ? (
          <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-100">
            Travel / checkout day
          </span>
        ) : null}
        {onPlanHotel && stayCity ? (
          <button
            type="button"
            onClick={onPlanHotel}
            className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white"
          >
            Hotels in {stayCity.split(",")[0]?.trim() ?? stayCity}
          </button>
        ) : null}
        {onPlanDay ? (
          <button
            type="button"
            onClick={onPlanDay}
            className="rounded-full bg-sky-600 px-3 py-1.5 text-xs font-black text-white"
          >
            Plan this day
          </button>
        ) : null}
      </div>
    </div>
  );
}
