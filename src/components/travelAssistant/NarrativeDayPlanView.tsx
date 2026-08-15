"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildNarrativeDaySections,
  bulletsToDayNotes,
  type NarrativeHotelStay,
} from "@/lib/travelAssistant/narrativeItineraryExport";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import {
  buildLetterCityRanges,
  dayHasLetterContent,
  letterTitleLine,
} from "@/lib/travelAssistant/letterDayPlan";

interface NarrativeDayPlanViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  destination?: string | null;
  reservations: NarrativeHotelStay[];
  dayNotes: Record<string, string>;
  itineraryPlans: ItineraryPlansData;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onPasteDayPlan?: (sourceText: string) => void | Promise<void>;
  onReservationTap?: (id: string) => void;
  selectedDateKey?: string | null;
}

export function NarrativeDayPlanView({
  tripName,
  tripStartDate,
  tripEndDate = null,
  destination = null,
  reservations,
  dayNotes,
  itineraryPlans,
  onDayNoteChange,
  onPasteDayPlan,
  selectedDateKey = null,
}: NarrativeDayPlanViewProps) {
  const sections = useMemo(
    () =>
      buildNarrativeDaySections({
        tripStartDate,
        tripEndDate,
        itineraryPlans,
        dayNotes,
        reservations,
      }),
    [dayNotes, itineraryPlans, reservations, tripEndDate, tripStartDate],
  );

  const cityRanges = useMemo(() => buildLetterCityRanges(sections), [sections]);
  const rangeForDay = (dateKey: string) =>
    cityRanges.find((range) => range.startKey === dateKey) ?? null;

  const title = letterTitleLine(
    tripName,
    tripStartDate,
    tripEndDate,
    itineraryPlans.letterHeader?.title,
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteBusy, setPasteBusy] = useState(false);

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = document.getElementById(`narrative-day-${selectedDateKey}`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedDateKey]);

  const commitBullets = (dateKey: string, bullets: string[]): void => {
    onDayNoteChange(dateKey, bulletsToDayNotes(bullets.map((line) => line.trim()).filter(Boolean)));
  };

  const updateBullet = (dateKey: string, index: number, value: string): void => {
    const section = sections.find((item) => item.dateKey === dateKey);
    const next = [...(section?.bullets ?? [])];
    next[index] = value;
    commitBullets(dateKey, next);
  };

  const removeBullet = (dateKey: string, index: number): void => {
    const section = sections.find((item) => item.dateKey === dateKey);
    commitBullets(
      dateKey,
      (section?.bullets ?? []).filter((_, itemIndex) => itemIndex !== index),
    );
  };

  const addBullet = (dateKey: string): void => {
    const typed = (drafts[dateKey] ?? "").trim();
    const section = sections.find((item) => item.dateKey === dateKey);
    const next = [...(section?.bullets ?? [])];
    if (typed) {
      next.push(typed);
      setDrafts((prev) => ({ ...prev, [dateKey]: "" }));
    } else {
      next.push("");
    }
    commitBullets(dateKey, next);
  };

  return (
    <article
      className="rounded-2xl px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)]"
      style={{
        background: "#FAF6EF",
        fontFamily: "Georgia, 'Times New Roman', serif",
        color: "#1a1a1a",
      }}
    >
      <header className="mb-5 border-b border-[#E8E0D4] pb-4">
        <h2 className="text-[26px] font-bold leading-tight text-[#1D1D1F]">{title}</h2>
        {destination ? (
          <p className="mt-1 text-[15px] text-[#6E6E73]">{destination}</p>
        ) : null}
      </header>

      <div className="space-y-7">
        {sections.map((section) => {
          const range = rangeForDay(section.dateKey);
          const isSelected = selectedDateKey === section.dateKey;
          const hasContent = dayHasLetterContent(section);
          return (
            <section
              key={section.dateKey}
              id={`narrative-day-${section.dateKey}`}
              className={isSelected ? "rounded-xl bg-white/70 px-2 py-1" : ""}
            >
              {range ? (
                <p className="mb-3 text-[17px] font-semibold text-[#1D1D1F]">{range.label}</p>
              ) : null}
              <h3 className="mb-2 text-[20px] font-bold text-[#1D1D1F]">{section.heading}</h3>
              {section.bookingLines.length > 0 ? (
                <ul className="mb-2 space-y-1 text-[16px] leading-snug text-[#1D1D1F]">
                  {section.bookingLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              {section.stayFacts.length > 0 ? (
                <ul className="mb-3 space-y-1 text-[16px] leading-snug text-[#1D1D1F]">
                  {section.stayFacts.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : section.hotelLine ? (
                <p className="mb-3 text-[16px] leading-snug text-[#1D1D1F]">{section.hotelLine}</p>
              ) : null}
              {section.activityFacts.length > 0 ? (
                <ul className="mb-3 space-y-1 text-[16px] leading-snug text-[#1D1D1F]">
                  {section.activityFacts.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="space-y-2">
                {!hasContent ? (
                  <li className="text-[16px] italic text-[#8E8E93]">Nothing on this day yet.</li>
                ) : (
                  section.bullets.map((bullet, index) => (
                    <li key={`${section.dateKey}-${index}`} className="flex items-start gap-2">
                      <span className="mt-1.5 text-[#1D1D1F]" aria-hidden>
                        •
                      </span>
                      <input
                        value={bullet}
                        onChange={(event) => updateBullet(section.dateKey, index, event.target.value)}
                        className="min-h-[44px] min-w-0 flex-1 border-0 bg-transparent text-[17px] leading-snug text-[#1D1D1F] outline-none"
                        placeholder="What are you doing?"
                      />
                      <button
                        type="button"
                        onClick={() => removeBullet(section.dateKey, index)}
                        className="min-h-[44px] shrink-0 px-2 text-[15px] font-semibold text-[#8E8E93]"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[#1D1D1F]" aria-hidden>
                  •
                </span>
                <input
                  value={drafts[section.dateKey] ?? ""}
                  onChange={(event) =>
                    setDrafts((prev) => ({ ...prev, [section.dateKey]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addBullet(section.dateKey);
                    }
                  }}
                  className="min-h-[44px] min-w-0 flex-1 border-0 bg-transparent text-[17px] leading-snug text-[#1D1D1F] outline-none"
                  placeholder="Add a line — boat tour, gelato, checkout…"
                />
                <button
                  type="button"
                  onClick={() => addBullet(section.dateKey)}
                  className="min-h-[44px] shrink-0 text-[15px] font-semibold text-[#007AFF]"
                >
                  Add
                </button>
              </div>
            </section>
          );
        })}
      </div>
      {onPasteDayPlan ? (
        <footer className="mt-8 border-t border-[#E8E0D4] pt-4">
          {pasteOpen ? (
            <div className="space-y-3">
              <p
                className="text-[15px] text-[#6E6E73]"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
              >
                Paste the Word / email day plan (Sept 3 boat tour, viewpoints, gelato). Hotel
                confirmations stay as they are.
              </p>
              <textarea
                value={pasteText}
                onChange={(event) => setPasteText(event.target.value)}
                rows={8}
                className="w-full rounded-xl border border-[#E8E0D4] bg-white px-3 py-3 text-[16px] leading-snug text-[#1D1D1F] outline-none"
                placeholder="Puglia Itinerary: SEPT 2–12&#10;Sept 3:&#10;• Boat tour — 10 am GetYourGuide"
              />
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={pasteBusy || !pasteText.trim()}
                  onClick={() => {
                    setPasteBusy(true);
                    void Promise.resolve(onPasteDayPlan(pasteText))
                      .then(() => {
                        setPasteText("");
                        setPasteOpen(false);
                      })
                      .finally(() => setPasteBusy(false));
                  }}
                  className="min-h-[44px] rounded-full bg-[#007AFF] px-4 text-[15px] font-semibold text-white disabled:opacity-50"
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
                >
                  {pasteBusy ? "Adding…" : "Add to Plan"}
                </button>
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  className="min-h-[44px] rounded-full px-4 text-[15px] font-semibold text-[#6E6E73]"
                  style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPasteOpen(true)}
              className="min-h-[44px] text-[15px] font-semibold text-[#007AFF]"
              style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
            >
              Paste itinerary
            </button>
          )}
        </footer>
      ) : null}
    </article>
  );
}
