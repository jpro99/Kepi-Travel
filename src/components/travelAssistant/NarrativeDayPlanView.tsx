"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildNarrativeDaySections,
  bulletsToDayNotes,
  notesToBullets,
  type NarrativeHotelStay,
} from "@/lib/travelAssistant/narrativeItineraryExport";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
import {
  buildLetterCityRanges,
  letterTitleLine,
  splitLetterStayAndActivities,
} from "@/lib/travelAssistant/letterDayPlan";
import { reservationPropertyName } from "@/lib/travelAssistant/reservationDisplayLabel";
import { dateOnly } from "@/lib/travelAssistant/tripWindow";

interface NarrativeDayPlanViewProps {
  tripName: string;
  tripStartDate: string | null;
  tripEndDate?: string | null;
  destination?: string | null;
  reservations: NarrativeHotelStay[];
  dayNotes: Record<string, string>;
  itineraryPlans: ItineraryPlansData;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onReservationTap?: (id: string) => void;
  selectedDateKey?: string | null;
}

function hotelStayLines(hotel: NarrativeHotelStay): string[] {
  const lines: string[] = [];
  const name = reservationPropertyName({
    type: "hotel",
    title: hotel.title,
    provider: hotel.provider,
    location: hotel.location,
    notes: hotel.notes,
  });
  if (name) lines.push(name);
  if (hotel.location?.trim()) lines.push(hotel.location.trim());
  const checkIn = dateOnly(hotel.localTime);
  const checkOut = dateOnly(hotel.checkOutDate);
  if (checkIn || checkOut) {
    lines.push(`Check-in ${checkIn || "—"} · Check-out ${checkOut || "—"}`);
  }
  if (hotel.confirmationCode?.trim()) {
    lines.push(
      `Confirmation ${hotel.confirmationCode.trim()}${
        hotel.provider?.trim() ? ` · via ${hotel.provider.trim()}` : ""
      }`,
    );
  }
  return lines;
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

  const hotels = useMemo(
    () => reservations.filter((reservation) => (reservation.type ?? "") === "hotel"),
    [reservations],
  );

  const cityRanges = useMemo(() => buildLetterCityRanges(sections), [sections]);
  const rangeForDay = (dateKey: string) =>
    cityRanges.find((range) => range.startKey === dateKey) ?? null;

  const stayLines = useMemo(() => {
    const fromLetter = itineraryPlans.letterHeader?.lines ?? [];
    const fromDays = sections.flatMap((section) => section.stayLines);
    const fromHotels = hotels.flatMap((hotel) => hotelStayLines(hotel));
    const seen = new Set<string>();
    const merged: string[] = [];
    for (const line of [...fromLetter, ...fromDays, ...fromHotels]) {
      const key = line.trim().toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(line.trim());
    }
    return merged;
  }, [hotels, itineraryPlans.letterHeader?.lines, sections]);

  const title = letterTitleLine(
    tripName,
    tripStartDate,
    tripEndDate,
    itineraryPlans.letterHeader?.title,
  );

  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const cleanedDateKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = document.getElementById(`narrative-day-${selectedDateKey}`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedDateKey]);

  useEffect(() => {
    for (const section of sections) {
      if (cleanedDateKeysRef.current.has(section.dateKey)) continue;
      const planNotes = itineraryPlans.dayPlans[section.dateKey]?.notes ?? "";
      const noteNotes = dayNotes[section.dateKey] ?? "";
      const source = planNotes.trim() || noteNotes;
      if (!source.trim()) continue;
      cleanedDateKeysRef.current.add(section.dateKey);
      const raw = notesToBullets(source);
      const activities = splitLetterStayAndActivities(raw).activityLines;
      if (raw.length !== activities.length) {
        onDayNoteChange(section.dateKey, bulletsToDayNotes(activities));
      }
    }
  }, [dayNotes, itineraryPlans.dayPlans, onDayNoteChange, sections]);

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

      {stayLines.length > 0 ? (
        <section className="mb-6 border-b border-[#E8E0D4] pb-4">
          <ul className="space-y-1.5 text-[16px] leading-snug">
            {stayLines.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>
      ) : hotels.length === 0 ? (
        <p className="mb-6 text-[15px] leading-relaxed text-[#6E6E73]">
          Forward a Word itinerary or add the stay address here. Check-in, late fees, and tax stay
          visible — they are not hidden behind Details.
        </p>
      ) : null}

      <div className="space-y-7">
        {sections.map((section) => {
          const range = rangeForDay(section.dateKey);
          const isSelected = selectedDateKey === section.dateKey;
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
                <ul className="mb-2 space-y-1 text-[15px] text-[#6E6E73]">
                  {section.bookingLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}
              <ul className="space-y-2">
                {section.bullets.length === 0 ? (
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
    </article>
  );
}
