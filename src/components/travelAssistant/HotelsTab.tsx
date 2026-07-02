"use client";

import { useState, useMemo } from "react";
import { createPortal } from "react-dom";
import { TripHotelStayMap } from "@/components/travelAssistant/TripHotelStayMap";
import { MobileHotelStayNotebook } from "@/components/travelAssistant/mobile/MobileHotelStayNotebook";
import { TravelFitEarnBar } from "@/components/travelAssistant/TravelFitEarnBar";
import { TripStayPlanner } from "@/components/travelAssistant/TripStayPlanner";
import { TripHotelCityPicker } from "@/components/travelAssistant/TripHotelCityPicker";
import { HotelSearchLauncher, type HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import { segmentsNeedingHotel } from "@/lib/hotels/deriveTripStaySegments";
import {
  formatReservationCostLine,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import {
  reservationAttentionKind,
  reservationAttentionRingClass,
} from "@/lib/travelAssistant/reservationAttention";
import { BOOK_ICON_TILE_CLASS, BOOK_LIST_CARD_CLASS } from "@/components/travelAssistant/bookTabStyles";
import { hotelCardTypography } from "@/lib/ui/mobileTypography";
import { appleBtnText, appleWarningPill } from "@/lib/ui/appleDesign";

interface Reservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode?: string;
  roomType?: string;
  checkOutDate?: string;
  notes?: string;
  plannedOnly?: boolean;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  pointsProgram?: string;
}

interface HotelsTabProps {
  reservations: Reservation[];
  mapReservations?: Reservation[];
  tripName?: string | null;
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAdd: () => void;
  hotelSearchDefaults?: HotelSearchDefaults;
  onLaunchHotelSearch?: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
  onSearchHotels?: () => void;
  onSearchSegment?: (segment: TripStaySegment) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (
    segment: TripStaySegment,
    intent: "needs_hotel" | "skip",
  ) => void | Promise<void>;
  tripId?: string | null;
  usuallySkipsConnections?: boolean;
  /** Trips tab on phone: bigger type, fewer widgets. */
  simplifiedMobile?: boolean;
  hotelNotebookNote?: string;
  onHotelNotebookChange?: (value: string) => void;
  travelFitReservations?: Array<{
    id: string;
    type: string;
    provider?: string;
    title?: string;
    location?: string;
    localTime?: string;
    checkOutDate?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDate?: string;
  }>;
}

function fmtDate(localTime: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime ?? "");
  if (!m) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m[2]-1]} ${+m[3]}, ${m[1]}`;
}

function fmtDateShort(localTime: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(localTime ?? "");
  if (!m) return "—";
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[+m[2]-1]} ${+m[3]}`;
}

function nightsCount(checkIn: string, checkOut: string): number {
  const a = Date.parse(checkIn.slice(0, 10));
  const b = Date.parse(checkOut.slice(0, 10));
  if (isNaN(a) || isNaN(b)) return 0;
  return Math.round((b - a) / 86400_000);
}

function isPastCheckout(checkOut: string): boolean {
  const ms = Date.parse(checkOut?.slice(0, 10) ?? "");
  return !isNaN(ms) && Date.now() > ms + 86400_000;
}

// City emoji lookup
function cityEmoji(location: string): string {
  const l = location.toLowerCase();
  if (l.includes("tokyo") || l.includes("japan")) return "🗼";
  if (l.includes("paris") || l.includes("france")) return "🗼";
  if (l.includes("london")) return "🎡";
  if (l.includes("new york") || l.includes("nyc")) return "🗽";
  if (l.includes("los angeles") || l.includes("la ")) return "🌴";
  if (l.includes("hawaii") || l.includes("honolulu")) return "🌺";
  if (l.includes("dubai")) return "🏙";
  if (l.includes("singapore")) return "🦁";
  if (l.includes("sydney") || l.includes("australia")) return "🦘";
  if (l.includes("rome") || l.includes("italy")) return "🏛";
  if (l.includes("bangkok") || l.includes("thailand")) return "🐘";
  return "🏨";
}

export function HotelsTab({
  reservations,
  mapReservations,
  tripName,
  staySegments = [],
  plannedStayCities = [],
  onPickPlannedCity,
  onReservationTap,
  onCheckStatus,
  onDelete,
  onAdd,
  hotelSearchDefaults,
  onLaunchHotelSearch,
  onSearchHotels,
  onSearchSegment,
  onAddCityStay,
  onSetStayIntent,
  tripId,
  usuallySkipsConnections,
  simplifiedMobile = false,
  hotelNotebookNote = "",
  onHotelNotebookChange,
  travelFitReservations = [],
}: HotelsTabProps) {
  const type = hotelCardTypography(simplifiedMobile);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showPast, setShowPast] = useState(false);
  const [notebookOpen, setNotebookOpen] = useState(false);

  const { upcoming, past } = useMemo(() => ({
    upcoming: reservations.filter(r => !isPastCheckout(r.checkOutDate ?? r.localTime ?? "")),
    past: reservations.filter(r => isPastCheckout(r.checkOutDate ?? r.localTime ?? "")),
  }), [reservations]);

  const shown = showPast ? [...upcoming, ...past] : upcoming;
  const staySegmentsNeedingHotel = segmentsNeedingHotel(staySegments);

  return (
    <section className={`space-y-4 pb-6 ${type.section}`}>
      {!simplifiedMobile && onLaunchHotelSearch ? (
        <HotelSearchLauncher
          tripName={tripName}
          defaults={hotelSearchDefaults}
          onSearch={onLaunchHotelSearch}
        />
      ) : null}

      {simplifiedMobile ? (
        <TripHotelStayMap
          reservations={mapReservations ?? reservations}
          onStayTap={(point) => {
            if (point.reservationId) {
              onReservationTap(point.reservationId);
            }
          }}
          mobileProminent
          sectionId="trip-hotel-map"
          onOpenNotebook={() => setNotebookOpen(true)}
        />
      ) : null}

      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className={type.heading}>Your hotels</h2>
          <p className={type.subheading}>
            {upcoming.length} booked{past.length > 0 ? ` · ${past.length} past` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className={`shrink-0 ${type.addBtn}`}
        >
          Add existing
        </button>
      </div>

      {!simplifiedMobile && travelFitReservations.some((r) => r.type === "hotel") && plannedStayCities.length === 0 ? (
        <TravelFitEarnBar reservations={travelFitReservations.filter((r) => r.type === "hotel")} />
      ) : null}

      {!simplifiedMobile && plannedStayCities.length > 0 && onPickPlannedCity ? (
        <TripHotelCityPicker
          cities={plannedStayCities}
          tripName={tripName}
          onPickCity={onPickPlannedCity}
        />
      ) : null}

      {!simplifiedMobile && staySegmentsNeedingHotel.length > 0 && onSearchSegment && plannedStayCities.length === 0 ? (
        <TripStayPlanner
          segments={staySegments}
          tripName={tripName}
          tripId={tripId}
          usuallySkipsConnections={usuallySkipsConnections}
          onSearchSegment={onSearchSegment}
          onAddCityStay={onAddCityStay}
          onSetStayIntent={onSetStayIntent}
        />
      ) : null}

      {/* Empty state */}
      {shown.length === 0 && (
        <div className="rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-10 text-center">
          <p className="text-4xl mb-3">🏨</p>
          <p className="font-semibold text-slate-900 dark:text-white">No hotels yet</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 mb-4">
            Use the search box above to find and book a hotel, or add one you already booked.
          </p>
          {onLaunchHotelSearch ? (
            <button
              type="button"
              onClick={() =>
                onLaunchHotelSearch({
                  city: hotelSearchDefaults?.city ?? "",
                  cityIata: hotelSearchDefaults?.cityIata,
                  checkIn: hotelSearchDefaults?.checkIn ?? "",
                  checkOut: hotelSearchDefaults?.checkOut ?? "",
                })
              }
              className="mb-3 w-full rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-bold text-white"
            >
              Search hotels
            </button>
          ) : onSearchHotels ? (
            <button
              type="button"
              onClick={onSearchHotels}
              className="mb-3 w-full rounded-full bg-[#007AFF] px-6 py-2.5 text-sm font-semibold text-white"
            >
              Search hotels
            </button>
          ) : null}
          <button
            type="button"
            onClick={onAdd}
            className="rounded-full border border-slate-300 px-6 py-2.5 text-sm font-semibold text-slate-700 dark:border-slate-600 dark:text-slate-200"
          >
            Add existing booking
          </button>
        </div>
      )}

      {/* Hotel cards */}
      {simplifiedMobile && onHotelNotebookChange ? (
        <button
          type="button"
          onClick={() => setNotebookOpen(true)}
          className={`flex min-h-[48px] w-full items-center justify-center px-4 text-[17px] font-semibold text-[var(--text-primary)] ${type.secondaryBtn}`}
        >
          Open stay notebook
        </button>
      ) : null}

      <div className="space-y-3">
        {shown.map(r => {
          const checkIn = r.localTime ?? "";
          const checkOut = r.checkOutDate ?? "";
          const nights = nightsCount(checkIn, checkOut);
          const past = isPastCheckout(checkOut);
          const isOpen = expanded === r.id;
          const emoji = cityEmoji(r.location ?? "");
          const missingPrice = reservationMissingPrice(r);
          const costLine = formatReservationCostLine(r, { allReservations: shown });
          const attention = reservationAttentionKind(r);

          if (simplifiedMobile) {
            const stayRange =
              checkIn && checkOut
                ? `${fmtDateShort(checkIn)} – ${fmtDateShort(checkOut)}${nights > 0 ? ` · ${nights} night${nights === 1 ? "" : "s"}` : ""}`
                : checkIn
                  ? fmtDateShort(checkIn)
                  : null;

            return (
              <div
                key={r.id}
                className={`${type.card} overflow-hidden ${past ? "opacity-60" : ""}`}
              >
                <button
                  type="button"
                  onClick={() => setExpanded(isOpen ? null : r.id)}
                  className="w-full p-4 text-left"
                >
                  <div className="flex items-start gap-3">
                    <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-[var(--bg-grouped)] text-lg text-[var(--text-secondary)]">
                      {emoji}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className={type.title}>{r.title}</p>
                        {missingPrice && !past ? (
                          <span className={appleWarningPill}>Add cost</span>
                        ) : costLine ? (
                          <span className="shrink-0 text-[17px] font-semibold text-[var(--text-primary)]">{costLine}</span>
                        ) : null}
                      </div>
                      {r.location ? <p className={type.location}>{r.location}</p> : null}
                      {stayRange ? <p className={`${type.metadata} mt-1`}>{stayRange}</p> : null}
                    </div>
                    <span className="mt-1 shrink-0 text-[13px] text-[var(--text-tertiary)]">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {(isOpen || r.confirmationCode || (r.roomType && r.roomType !== "Not set")) && (
                  <div className="space-y-3 border-t border-[var(--border-default)] px-4 pb-4 pt-3">
                    {r.confirmationCode ? (
                      <div>
                        <p className={type.detailLabel}>Confirmation</p>
                        <p className={`${type.detailValue} mt-0.5`}>{r.confirmationCode}</p>
                      </div>
                    ) : null}
                    {r.roomType && r.roomType !== "Not set" ? (
                      <div>
                        <p className={type.detailLabel}>Room type</p>
                        <p className={`${type.detailValue} mt-0.5`}>{r.roomType}</p>
                      </div>
                    ) : null}
                    {costLine && !missingPrice ? (
                      <div>
                        <p className={type.detailLabel}>Trip cost</p>
                        <p className={`${type.detailValue} mt-0.5`}>{costLine}</p>
                      </div>
                    ) : missingPrice && !past ? (
                      <button
                        type="button"
                        onClick={() => onReservationTap(r.id)}
                        className={`${appleBtnText} text-left`}
                      >
                        Tap to add trip cost
                      </button>
                    ) : null}
                    {isOpen ? (
                      <div className="flex items-center gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => onReservationTap(r.id)}
                          className={`${type.actionBtn} ${type.secondaryBtn}`}
                        >
                          View details
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm("Delete this hotel?")) onDelete(r.id);
                          }}
                          className={`${type.actionBtn} ${type.destructiveBtn}`}
                        >
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div
              key={r.id}
              className={`${BOOK_LIST_CARD_CLASS} ${
                past ? reservationAttentionRingClass("none", true) : reservationAttentionRingClass(attention, past)
              } ${past ? "opacity-60" : ""}`}
            >
              {/* Card tap area */}
              <button
                type="button"
                onClick={() => setExpanded(isOpen ? null : r.id)}
                className="w-full text-left"
              >
                <div className="flex items-start gap-4 p-5">
                  <div className={BOOK_ICON_TILE_CLASS}>{emoji}</div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className={type.title}>{r.title}</p>
                      {missingPrice && !past ? (
                        <span className="shrink-0 rounded-full bg-yellow-200 px-2 py-0.5 text-xs lg:text-[10px] font-bold uppercase tracking-wide text-yellow-900 dark:bg-yellow-500/30 dark:text-yellow-100">
                          Add cost
                        </span>
                      ) : costLine ? (
                        <span className={`shrink-0 font-bold text-slate-700 dark:text-slate-200 ${simplifiedMobile ? "text-sm" : "text-sm lg:text-xs"}`}>{costLine}</span>
                      ) : null}
                    </div>
                    <p className={type.location}>{r.location}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <div className={`rounded-lg bg-slate-100 dark:bg-slate-800 ${simplifiedMobile ? "px-3 py-2" : "px-3 py-2 lg:px-2.5 lg:py-1"}`}>
                        <p className={type.detailLabel}>Check-in</p>
                        <p className={type.detailValue}>{fmtDate(checkIn)}</p>
                      </div>
                      {checkOut ? (
                        <div className={`rounded-lg bg-slate-100 dark:bg-slate-800 ${simplifiedMobile ? "px-3 py-2" : "px-3 py-2 lg:px-2.5 lg:py-1"}`}>
                          <p className={type.detailLabel}>Check-out</p>
                          <p className={type.detailValue}>{fmtDate(checkOut)}</p>
                        </div>
                      ) : null}
                      {nights > 0 ? (
                        <div className="rounded-lg bg-sky-50 px-2.5 py-1 dark:bg-sky-500/15">
                          <p className={`font-bold text-sky-800 dark:text-sky-300 ${simplifiedMobile ? "text-sm" : "text-sm lg:text-xs"}`}>{nights}N</p>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <span className="mt-1 shrink-0 text-sm text-slate-300 dark:text-slate-600">{isOpen ? "▲" : "▼"}</span>
                </div>
              </button>

              {/* Confirmation + room + cost */}
              <div className="flex flex-wrap items-start gap-4 px-5 pb-4">
                {r.confirmationCode && (
                  <div>
                    <p className={type.detailLabel}>Confirmation</p>
                    <p className={`${type.detailValue} mt-0.5`}>{r.confirmationCode}</p>
                  </div>
                )}
                {r.roomType && r.roomType !== "Not set" && (
                  <div>
                    <p className={type.detailLabel}>Room type</p>
                    <p className={`${type.detailValue} mt-0.5`}>{r.roomType}</p>
                  </div>
                )}
                {costLine ? (
                  <div>
                    <p className={type.detailLabel}>Trip cost</p>
                    <p className={`${type.detailValue} mt-0.5`}>{costLine}</p>
                  </div>
                ) : missingPrice && !past ? (
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="rounded-lg bg-yellow-100 px-2.5 py-1.5 text-left dark:bg-yellow-500/20"
                  >
                    <p className="text-[9px] font-bold uppercase tracking-widest text-yellow-800 dark:text-yellow-200">Trip cost</p>
                    <p className="mt-0.5 text-xs font-bold text-yellow-900 dark:text-yellow-100">Tap to add price</p>
                  </button>
                ) : null}
              </div>
              {attention === "missing-price" && !past ? (
                <div className="border-t border-yellow-200 px-5 py-2 dark:border-yellow-500/30">
                  <button
                    type="button"
                    onClick={() => onReservationTap(r.id)}
                    className="text-xs font-bold text-yellow-900 dark:text-yellow-200"
                  >
                    Tap to add cash or points spent →
                  </button>
                </div>
              ) : null}

              {/* Expanded actions */}
              <div className="border-t border-slate-100 dark:border-slate-800 px-5 py-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => onReservationTap(r.id)}
                  className={`${type.actionBtn} bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200`}
                >
                  View details
                </button>
                <button
                  type="button"
                  onClick={() => onCheckStatus(r.id)}
                  className={`${type.actionBtn} bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 text-[#007AFF] dark:text-[#0A84FF]`}
                >
                  Check status
                </button>
                <button
                  type="button"
                  onClick={() => { if (window.confirm("Delete this hotel?")) onDelete(r.id); }}
                  className={`${type.actionBtn} max-w-[33%] bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400`}
                >
                  Delete
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Past toggle */}
      {past.length > 0 && (
        <button
          type="button"
          onClick={() => setShowPast(v => !v)}
          className="w-full text-center text-sm font-semibold text-[#007AFF] dark:text-[#0A84FF] py-2"
        >
          {showPast ? "Hide past stays" : `Show ${past.length} past stay${past.length > 1 ? "s" : ""}`}
        </button>
      )}

      {!simplifiedMobile ? (
      <TripHotelStayMap
        reservations={mapReservations ?? reservations}
        staySegments={staySegments}
        plannedStayCities={plannedStayCities}
        onStayTap={(point) => {
          if (point.reservationId) {
            onReservationTap(point.reservationId);
            return;
          }
          if (point.segmentId && onSearchSegment) {
            const segment = staySegments.find((entry) => entry.id === point.segmentId);
            if (segment) onSearchSegment(segment);
          }
        }}
      />
      ) : null}

      {notebookOpen && onHotelNotebookChange && typeof document !== "undefined"
        ? createPortal(
            <MobileHotelStayNotebook
              tripName={tripName ?? "Your trip"}
              reservations={reservations}
              savedNote={hotelNotebookNote}
              onSave={onHotelNotebookChange}
              onClose={() => setNotebookOpen(false)}
              onReservationTap={onReservationTap}
            />,
            document.body,
          )
        : null}
    </section>
  );
}
