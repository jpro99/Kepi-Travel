"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  flattenDayPlanGroups,
  groupDayPlanBullets,
  type DayPlanBulletGroup,
} from "@/lib/travelAssistant/dayPlanBulletGroups";
import {
  buildNarrativeDaySections,
  bulletsToDayNotes,
  formatNarrativePrettyDate,
  notesToBullets,
  parseDayPlanBulletLines,
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

function hotelDetailLines(hotel: NarrativeHotelStay): string[] {
  const lines: string[] = [];
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
  if (hotel.notes?.trim()) {
    lines.push(...parseDayPlanBulletLines(hotel.notes));
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
    () => reservations.filter((r) => (r.type ?? "") === "hotel"),
    [reservations],
  );

  const rangeLabel =
    tripStartDate && tripEndDate
      ? `${formatNarrativePrettyDate(dateOnly(tripStartDate))} – ${formatNarrativePrettyDate(dateOnly(tripEndDate))}`
      : "Set trip dates";

  const [drag, setDrag] = useState<{ dateKey: string; index: number } | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedHotels, setExpandedHotels] = useState<Record<string, boolean>>({});
  const cleanedDateKeysRef = useRef(new Set<string>());

  useEffect(() => {
    if (!selectedDateKey) return;
    const node = document.getElementById(`narrative-day-${selectedDateKey}`);
    node?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [selectedDateKey]);

  // Persist import dedupe once per day so Day 3 boat-tour doubles leave Redis too.
  useEffect(() => {
    for (const section of sections) {
      if (cleanedDateKeysRef.current.has(section.dateKey)) continue;
      const planNotes = itineraryPlans.dayPlans[section.dateKey]?.notes ?? "";
      const noteNotes = dayNotes[section.dateKey] ?? "";
      const source = planNotes.trim() || noteNotes;
      if (!source.trim()) continue;
      cleanedDateKeysRef.current.add(section.dateKey);
      const raw = parseDayPlanBulletLines(source);
      const cleaned = notesToBullets(source);
      if (
        raw.length !== cleaned.length ||
        raw.some((line, index) => line !== cleaned[index])
      ) {
        onDayNoteChange(section.dateKey, bulletsToDayNotes(cleaned));
      }
    }
  }, [dayNotes, itineraryPlans.dayPlans, onDayNoteChange, sections]);

  const groupsByDate = useMemo(() => {
    const map = new Map<string, DayPlanBulletGroup[]>();
    for (const section of sections) {
      map.set(section.dateKey, groupDayPlanBullets(section.bullets));
    }
    return map;
  }, [sections]);

  const commitGroups = (dateKey: string, groups: DayPlanBulletGroup[]): void => {
    onDayNoteChange(dateKey, bulletsToDayNotes(flattenDayPlanGroups(groups)));
  };

  const toggleGroup = (dateKey: string, index: number): void => {
    const key = `${dateKey}:${index}`;
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const reorderGroups = (dateKey: string, from: number, to: number): void => {
    const groups = [...(groupsByDate.get(dateKey) ?? [])];
    if (from < 0 || from >= groups.length || to < 0 || to >= groups.length || from === to) return;
    const [moved] = groups.splice(from, 1);
    if (moved === undefined) return;
    groups.splice(to, 0, moved);
    commitGroups(dateKey, groups);
  };

  const updateGroupTitle = (dateKey: string, index: number, value: string): void => {
    const groups = [...(groupsByDate.get(dateKey) ?? [])];
    const group = groups[index];
    if (!group) return;
    groups[index] = { ...group, title: value };
    commitGroups(dateKey, groups);
  };

  const updateGroupDetail = (
    dateKey: string,
    groupIndex: number,
    detailIndex: number,
    value: string,
  ): void => {
    const groups = [...(groupsByDate.get(dateKey) ?? [])];
    const group = groups[groupIndex];
    if (!group) return;
    const details = [...group.details];
    details[detailIndex] = value;
    groups[groupIndex] = { ...group, details };
    commitGroups(dateKey, groups);
  };

  const removeGroup = (dateKey: string, index: number): void => {
    const groups = (groupsByDate.get(dateKey) ?? []).filter((_, i) => i !== index);
    commitGroups(dateKey, groups);
  };

  const removeDetail = (dateKey: string, groupIndex: number, detailIndex: number): void => {
    const groups = [...(groupsByDate.get(dateKey) ?? [])];
    const group = groups[groupIndex];
    if (!group) return;
    groups[groupIndex] = {
      ...group,
      details: group.details.filter((_, i) => i !== detailIndex),
    };
    commitGroups(dateKey, groups);
  };

  const addBullet = (dateKey: string): void => {
    const groups = [...(groupsByDate.get(dateKey) ?? []), { title: "", details: [] }];
    commitGroups(dateKey, groups);
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
          Tap a stay or activity to expand details. Drag ⋮⋮ to reorder.
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
          <ul className="space-y-2">
            {hotels.map((hotel, index) => {
              const name = reservationPropertyName({
                type: "hotel",
                title: hotel.title,
                provider: hotel.provider,
                location: hotel.location,
                notes: hotel.notes,
              });
              const hotelKey = `${hotel.confirmationCode || hotel.title || "hotel"}-${index}`;
              const details = hotelDetailLines(hotel);
              const isOpen = Boolean(expandedHotels[hotelKey]);
              return (
                <li key={hotelKey} className="rounded-xl border border-[#E5E5EA] bg-[#FAFAFA] px-3 py-2">
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedHotels((prev) => ({ ...prev, [hotelKey]: !prev[hotelKey] }))
                    }
                    className="flex min-h-[44px] w-full items-center justify-between gap-2 text-left"
                    aria-expanded={isOpen}
                  >
                    <span className="text-[14px] font-bold text-[#1a1a1a]">{name}</span>
                    <span className="shrink-0 text-[12px] font-semibold text-[#1d4ed8]">
                      {details.length === 0 ? "" : isOpen ? "Hide" : "Details"}
                    </span>
                  </button>
                  {isOpen && details.length > 0 ? (
                    <ul className="mt-1 space-y-1 border-t border-[#E5E5EA] pt-2 text-[13px] leading-snug text-[#475569]">
                      {details.map((line) => (
                        <li key={line}>• {line}</li>
                      ))}
                    </ul>
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
          const groups = groupsByDate.get(section.dateKey) ?? [];
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
                {groups.length === 0 ? (
                  <li className="text-[13px] italic text-[#94a3b8]">
                    Open day — add a line below, or forward a Word itinerary.
                  </li>
                ) : (
                  groups.map((group, index) => {
                    const expandKey = `${section.dateKey}:${index}`;
                    const hasDetails = group.details.length > 0;
                    const isOpen = Boolean(expanded[expandKey]);
                    return (
                      <li
                        key={expandKey}
                        draggable
                        onDragStart={() => setDrag({ dateKey: section.dateKey, index })}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          if (!drag || drag.dateKey !== section.dateKey) return;
                          reorderGroups(section.dateKey, drag.index, index);
                          setDrag(null);
                        }}
                        onDragEnd={() => setDrag(null)}
                        className="rounded-lg border border-transparent px-1 py-1 hover:border-[#E5E5EA] hover:bg-[#FAFAFA]"
                      >
                        <div className="flex items-start gap-2">
                          <span
                            className="mt-1.5 cursor-grab select-none text-[11px] leading-none text-[#94a3b8] active:cursor-grabbing"
                            title="Drag to reorder"
                            aria-hidden
                          >
                            ⋮⋮
                          </span>
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleGroup(section.dateKey, index)}
                              className="mt-0.5 shrink-0 rounded px-1 text-[12px] font-bold text-[#1d4ed8]"
                              aria-expanded={isOpen}
                              aria-label={isOpen ? "Collapse details" : "Expand details"}
                            >
                              {isOpen ? "▾" : "▸"}
                            </button>
                          ) : (
                            <span className="mt-0.5 w-4 shrink-0 text-center text-[#64748b]" aria-hidden>
                              •
                            </span>
                          )}
                          <input
                            value={group.title}
                            onChange={(event) =>
                              updateGroupTitle(section.dateKey, index, event.target.value)
                            }
                            className="min-w-0 flex-1 border-0 bg-transparent text-[14px] font-medium leading-snug text-[#1a1a1a] outline-none"
                            placeholder="Plan for this day"
                          />
                          {hasDetails ? (
                            <button
                              type="button"
                              onClick={() => toggleGroup(section.dateKey, index)}
                              className="shrink-0 self-center text-[11px] font-semibold text-[#1d4ed8]"
                            >
                              {isOpen ? "Hide" : "Details"}
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => removeGroup(section.dateKey, index)}
                            className="shrink-0 text-[11px] font-semibold text-[#94a3b8] hover:text-rose-600"
                            aria-label="Remove line"
                          >
                            ✕
                          </button>
                        </div>
                        {hasDetails && isOpen ? (
                          <ul className="mt-1.5 space-y-1 border-l-2 border-[#bfdbfe] pl-6">
                            {group.details.map((detail, detailIndex) => (
                              <li key={`${expandKey}-d-${detailIndex}`} className="flex items-start gap-2">
                                <span className="mt-1 text-[#94a3b8]" aria-hidden>
                                  •
                                </span>
                                <input
                                  value={detail}
                                  onChange={(event) =>
                                    updateGroupDetail(
                                      section.dateKey,
                                      index,
                                      detailIndex,
                                      event.target.value,
                                    )
                                  }
                                  className="min-w-0 flex-1 border-0 bg-transparent text-[13px] leading-snug text-[#475569] outline-none"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeDetail(section.dateKey, index, detailIndex)}
                                  className="shrink-0 text-[11px] font-semibold text-[#94a3b8] hover:text-rose-600"
                                  aria-label="Remove detail"
                                >
                                  ✕
                                </button>
                              </li>
                            ))}
                          </ul>
                        ) : null}
                      </li>
                    );
                  })
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
