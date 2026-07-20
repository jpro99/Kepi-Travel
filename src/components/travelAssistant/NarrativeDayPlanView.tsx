"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildNarrativeDaySections,
  bulletsToDayNotes,
  formatNarrativePrettyDate,
  type NarrativeHotelStay,
} from "@/lib/travelAssistant/narrativeItineraryExport";
import type { ItineraryPlansData } from "@/lib/travelAssistant/itineraryDayPlan";
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
    () => reservations.filter((r) => (r.type ?? "") === "hotel"),
    [reservations],
  );

  const rangeLabel =
    tripStartDate && tripEndDate
      ? `${formatNarrativePrettyDate(dateOnly(tripStartDate))} – ${formatNarrativePrettyDate(dateOnly(tripEndDate))}`
      : "Set trip dates";

  const [drag, setDrag] = useState<{ dateKey: string; index: number } | null>(null);

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = document.getElementById(`narrative-day-${selectedDateKey}`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedDateKey]);

  const reorderBullets = (dateKey: string, from: number, to: number): void => {
    const section = sections.find((s) => s.dateKey === dateKey);
    if (!section) return;
    const next = [...section.bullets];
    if (from < 0 || from >= next.length || to < 0 || to >= next.length || from === to) return;
    const [moved] = next.splice(from, 1);
    if (moved === undefined) return;
    next.splice(to, 0, moved);
    onDayNoteChange(dateKey, bulletsToDayNotes(next));
  };

  const updateBullet = (dateKey: string, index: number, value: string): void => {
    const section = sections.find((s) => s.dateKey === dateKey);
    if (!section) return;
    const next = [...section.bullets];
    next[index] = value;
    onDayNoteChange(dateKey, bulletsToDayNotes(next));
  };

  const removeBullet = (dateKey: string, index: number): void => {
    const section = sections.find((s) => s.dateKey === dateKey);
    if (!section) return;
    const next = section.bullets.filter((_, i) => i !== index);
    onDayNoteChange(dateKey, bulletsToDayNotes(next));
  };

  const addBullet = (dateKey: string): void => {
    const section = sections.find((s) => s.dateKey === dateKey);
    const next = [...(section?.bullets ?? []), ""];
    onDayNoteChange(dateKey, bulletsToDayNotes(next));
  };

  return (
    <article
      className="rounded-2xl bg-white px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] ring-1 ring-[#E5E5EA]"
      style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
    >
      <header className="mb-5 border-b border-[#E5E5EA] pb-4">
        <h2
          className="text-[26px] font-bold leading-tight text-[#1d4ed8]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          {tripName || "Trip itinerary"}
        </h2>
        <p
          className="mt-1 text-[13px] text-[#475569]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          {rangeLabel}
          {destination ? ` · ${destination}` : ""}
        </p>
        <p
          className="mt-2 text-[11px] text-[#94a3b8]"
          style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
        >
          Day-plan view — drag the ⋮⋮ handle to reorder lines. Same layout as Day plan PDF.
        </p>
      </header>

      {hotels.length > 0 ? (
        <section className="mb-6 border-b border-[#E5E5EA] pb-4">
          <h3
            className="mb-2 text-[15px] font-semibold text-[#0f172a]"
            style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
          >
            Where you&apos;re staying
          </h3>
          <ul className="space-y-3">
            {hotels.map((hotel, index) => {
              const name = reservationPropertyName({
                type: "hotel",
                title: hotel.title,
                provider: hotel.provider,
                location: hotel.location,
                notes: hotel.notes,
              });
              const checkIn = dateOnly(hotel.localTime);
              const checkOut = dateOnly(hotel.checkOutDate);
              return (
                <li key={`${hotel.confirmationCode || hotel.title}-${index}`} className="text-[14px] leading-snug text-[#1a1a1a]">
                  <p className="font-bold">{name}</p>
                  {hotel.location ? <p className="text-[13px] text-[#475569]">{hotel.location}</p> : null}
                  {checkIn || checkOut ? (
                    <p className="text-[13px] text-[#64748b]">
                      Check-in {checkIn || "—"} · Check-out {checkOut || "—"}
                    </p>
                  ) : null}
                  {hotel.confirmationCode ? (
                    <p className="text-[12px] text-[#64748b]">
                      Confirmation {hotel.confirmationCode}
                      {hotel.provider ? ` · via ${hotel.provider}` : ""}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <div className="space-y-6">
        {sections.map((section) => {
          const isSelected = selectedDateKey === section.dateKey;
          return (
            <section
              key={section.dateKey}
              id={`narrative-day-${section.dateKey}`}
              className={`rounded-xl px-1 py-1 ${isSelected ? "bg-[#eff6ff]" : ""}`}
            >
              <h3
                className="mb-2 text-[15px] font-semibold text-[#0f172a]"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
              >
                {section.heading}
              </h3>
              {section.hotelLine ? (
                <p className="mb-1 text-[12px] text-[#64748b]">{section.hotelLine}</p>
              ) : null}
              {section.bookingLines.length > 0 ? (
                <ul className="mb-2 space-y-1 text-[13px] text-[#334155]">
                  {section.bookingLines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              ) : null}

              <ul className="space-y-1.5">
                {section.bullets.length === 0 ? (
                  <li className="text-[13px] italic text-[#94a3b8]">
                    Open day — add a line below, or forward a Word itinerary.
                  </li>
                ) : (
                  section.bullets.map((bullet, index) => (
                    <li
                      key={`${section.dateKey}-${index}`}
                      draggable
                      onDragStart={() => setDrag({ dateKey: section.dateKey, index })}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (!drag || drag.dateKey !== section.dateKey) return;
                        reorderBullets(section.dateKey, drag.index, index);
                        setDrag(null);
                      }}
                      onDragEnd={() => setDrag(null)}
                      className="flex items-start gap-2 rounded-lg border border-transparent px-1 py-1 hover:border-[#E5E5EA] hover:bg-[#FAFAFA]"
                    >
                      <span
                        className="mt-1.5 cursor-grab select-none text-[11px] leading-none text-[#94a3b8] active:cursor-grabbing"
                        title="Drag to reorder"
                        aria-hidden
                      >
                        ⋮⋮
                      </span>
                      <span className="mt-0.5 text-[#64748b]" aria-hidden>
                        •
                      </span>
                      <input
                        value={bullet}
                        onChange={(event) => updateBullet(section.dateKey, index, event.target.value)}
                        className="min-w-0 flex-1 border-0 bg-transparent text-[14px] leading-snug text-[#1a1a1a] outline-none"
                        placeholder="Plan for this day"
                      />
                      <button
                        type="button"
                        onClick={() => removeBullet(section.dateKey, index)}
                        className="shrink-0 text-[11px] font-semibold text-[#94a3b8] hover:text-rose-600"
                        aria-label="Remove line"
                      >
                        ✕
                      </button>
                    </li>
                  ))
                )}
              </ul>
              <button
                type="button"
                onClick={() => addBullet(section.dateKey)}
                className="mt-2 text-[12px] font-semibold text-[#1d4ed8]"
                style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif' }}
              >
                + Add line
              </button>
            </section>
          );
        })}
      </div>
    </article>
  );
}
