"use client";

import { useCallback, useState } from "react";
import {
  ExcursionSearchLauncher,
  type ExcursionSearchDefaults,
} from "@/components/travelAssistant/ExcursionSearchLauncher";
import { BOOK_ICON_TILE_CLASS, BOOK_LIST_CARD_CLASS } from "@/components/travelAssistant/bookTabStyles";
import { formatExcursionDuration } from "@/lib/excursions/catalog";
import {
  EXCURSION_CATEGORY_LABELS,
  excursionCategoryFromNotes,
  isExcursionReservation,
  type ExcursionCategory,
  type ExcursionOffer,
} from "@/lib/excursions/types";
import {
  formatReservationCostLine,
  reservationMissingPrice,
} from "@/lib/travelAssistant/tripSpendSummary";
import {
  reservationAttentionKind,
  reservationAttentionRingClass,
} from "@/lib/travelAssistant/reservationAttention";
import { appleBtnText } from "@/lib/ui/appleDesign";

interface Reservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode?: string;
  notes?: string;
  plannedOnly?: boolean;
  quotedPriceUsd?: number;
}

interface ExcursionsTabProps {
  reservations: Reservation[];
  tripId?: string | null;
  tripName?: string | null;
  searchDefaults?: ExcursionSearchDefaults;
  onReservationTap: (id: string) => void;
  onDelete: (id: string) => void;
  onAddManual: () => void;
  onBooked?: () => void;
  readOnly?: boolean;
  simplifiedMobile?: boolean;
  enableBookSearch?: boolean;
}

function fmtDate(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value ?? "");
  if (!match) return value;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtTime(value: string): string {
  const match = /T(\d{2}):(\d{2})/.exec(value ?? "");
  if (!match) return "";
  const hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? "PM" : "AM";
  const normalized = hour % 12 || 12;
  return `${normalized}:${minute} ${suffix}`;
}

export function ExcursionsTab({
  reservations,
  tripId,
  tripName,
  searchDefaults,
  onReservationTap,
  onDelete,
  onAddManual,
  onBooked,
  readOnly = false,
  simplifiedMobile = false,
  enableBookSearch = true,
}: ExcursionsTabProps) {
  const [searchBusy, setSearchBusy] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [results, setResults] = useState<ExcursionOffer[]>([]);
  const [selected, setSelected] = useState<ExcursionOffer | null>(null);
  const [bookDate, setBookDate] = useState(searchDefaults?.date ?? "");
  const [bookTime, setBookTime] = useState("10:00");
  const [guests, setGuests] = useState(2);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [bookBusy, setBookBusy] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);
  const [bookSuccess, setBookSuccess] = useState<string | null>(null);

  const runSearch = useCallback(
    async (params: {
      destination: string;
      date: string;
      category: ExcursionCategory | "all";
      query: string;
    }): Promise<void> => {
      setSearchBusy(true);
      setSearchError(null);
      setResults([]);
      setBookDate(params.date);
      try {
        const response = await fetch("/api/excursions/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(params),
        });
        const payload = (await response.json()) as {
          excursions?: ExcursionOffer[];
          error?: string;
        };
        if (!response.ok) {
          throw new Error(payload.error ?? "Search failed");
        }
        const excursions = Array.isArray(payload.excursions) ? payload.excursions : [];
        setResults(excursions);
        if (excursions.length === 0) {
          setSearchError(`No experiences found for ${params.destination}. Try another city or category.`);
        }
      } catch (error) {
        setSearchError(error instanceof Error ? error.message : "Search failed");
      } finally {
        setSearchBusy(false);
      }
    },
    [],
  );

  const openBooking = (offer: ExcursionOffer): void => {
    if (readOnly) return;
    setSelected(offer);
    setBookError(null);
    setBookSuccess(null);
    setGuests(Math.min(2, offer.maxGuests));
  };

  const confirmBooking = async (): Promise<void> => {
    if (!selected || !bookDate || !firstName.trim() || !lastName.trim() || !email.trim()) return;
    setBookBusy(true);
    setBookError(null);
    try {
      const response = await fetch("/api/excursions/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excursionId: selected.id,
          tripId: tripId ?? undefined,
          date: bookDate,
          time: bookTime,
          guests,
          guest: {
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim(),
          },
        }),
      });
      const payload = (await response.json()) as {
        success?: boolean;
        bookingReference?: string;
        error?: string;
      };
      if (!response.ok || !payload.success || !payload.bookingReference) {
        throw new Error(payload.error ?? "Booking failed");
      }
      setBookSuccess(payload.bookingReference);
      onBooked?.();
    } catch (error) {
      setBookError(error instanceof Error ? error.message : "Booking failed");
    } finally {
      setBookBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {enableBookSearch && !readOnly ? (
        <ExcursionSearchLauncher defaults={searchDefaults} onSearch={runSearch} busy={searchBusy} />
      ) : null}

      {searchError ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-100">
          {searchError}
        </p>
      ) : null}

      {results.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            {results.length} experience{results.length === 1 ? "" : "s"} available
          </p>
          {results.map((offer) => (
            <article key={offer.id} className={`${BOOK_LIST_CARD_CLASS} p-4`}>
              <div className="flex gap-3">
                <div className={BOOK_ICON_TILE_CLASS}>{offer.imageEmoji}</div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600 dark:text-sky-400">
                    {EXCURSION_CATEGORY_LABELS[offer.category]}
                  </p>
                  <h3 className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{offer.title}</h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400">{offer.provider}</p>
                  <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">{offer.description}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-slate-500">
                    <span>⭐ {offer.rating.toFixed(1)}</span>
                    <span>·</span>
                    <span>{formatExcursionDuration(offer.durationMinutes)}</span>
                    <span>·</span>
                    <span>{offer.city}</span>
                  </div>
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <p className="text-lg font-black text-slate-900 dark:text-white">
                      ${offer.priceUsd}
                      <span className="text-xs font-semibold text-slate-500"> / person</span>
                    </p>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => openBooking(offer)}
                      className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50"
                    >
                      Book
                    </button>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
            On your trip{tripName ? ` · ${tripName}` : ""}
          </p>
          {!readOnly ? (
            <button type="button" onClick={onAddManual} className={`${appleBtnText} text-sky-600`}>
              + Add manually
            </button>
          ) : null}
        </div>

        {reservations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 px-4 py-8 text-center dark:border-slate-700">
            <p className="text-3xl">🎟️</p>
            <p className="mt-2 text-sm font-semibold text-slate-700 dark:text-slate-200">No experiences booked yet</p>
            <p className="mt-1 text-xs text-slate-500">
              Search for cooking classes, food tours, and local adventures above.
            </p>
          </div>
        ) : (
          reservations.map((reservation) => {
            const category = excursionCategoryFromNotes(reservation.notes);
            const attention = reservationAttentionKind(reservation);
            return (
              <button
                key={reservation.id}
                type="button"
                onClick={() => onReservationTap(reservation.id)}
                className={`${BOOK_LIST_CARD_CLASS} w-full p-4 text-left ${reservationAttentionRingClass(attention)}`}
              >
                <div className="flex gap-3">
                  <div className={BOOK_ICON_TILE_CLASS}>
                    {category === "cooking-class"
                      ? "👨‍🍳"
                      : category === "food-tour"
                        ? "🍽️"
                        : category === "wine-tasting"
                          ? "🍷"
                          : category === "outdoor-adventure"
                            ? "🛶"
                            : "🎟️"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-sky-600">
                      {category ? EXCURSION_CATEGORY_LABELS[category] : "Experience"}
                    </p>
                    <p className="mt-0.5 text-base font-bold text-slate-900 dark:text-white">{reservation.title}</p>
                    <p className="text-sm text-slate-500">{reservation.provider}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
                      {fmtDate(reservation.localTime)}
                      {fmtTime(reservation.localTime) ? ` · ${fmtTime(reservation.localTime)}` : ""}
                    </p>
                    <p className="mt-1 truncate text-xs text-slate-500">{reservation.location}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      {reservation.confirmationCode ? (
                        <span className="rounded-full bg-slate-100 px-2 py-1 font-mono font-bold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                          {reservation.confirmationCode}
                        </span>
                      ) : null}
                      {reservationMissingPrice(reservation) ? (
                        <span className="text-amber-600">Needs price</span>
                      ) : (
                        <span className="text-slate-500">{formatReservationCostLine(reservation)}</span>
                      )}
                      {!readOnly ? (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(reservation.id);
                          }}
                          className="font-semibold text-red-500"
                        >
                          Remove
                        </button>
                      ) : null}
                    </div>
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>

      {selected && !bookSuccess ? (
        <div className="fixed inset-0 z-50 flex items-end bg-slate-950/80 sm:items-center sm:justify-center sm:p-6">
          <section className="max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 dark:bg-slate-950 sm:max-w-lg sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-2xl">{selected.imageEmoji}</p>
                <h2 className="mt-2 text-lg font-bold text-slate-900 dark:text-white">{selected.title}</h2>
                <p className="text-sm text-slate-500">{selected.provider}</p>
              </div>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-xs font-semibold dark:border-slate-700"
              >
                Close
              </button>
            </div>

            <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{selected.description}</p>
            <p className="mt-2 text-xs text-slate-500">Meet at {selected.meetingPoint}</p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Date</label>
                <input
                  type="date"
                  value={bookDate}
                  onChange={(event) => setBookDate(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-slate-500">Time</label>
                <input
                  type="time"
                  value={bookTime}
                  onChange={(event) => setBookTime(event.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="mt-3">
              <label className="text-[10px] font-bold uppercase text-slate-500">Guests</label>
              <select
                value={guests}
                onChange={(event) => setGuests(Number(event.target.value))}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              >
                {Array.from({ length: selected.maxGuests }, (_, index) => index + 1).map((count) => (
                  <option key={count} value={count}>
                    {count} guest{count === 1 ? "" : "s"}
                  </option>
                ))}
              </select>
            </div>

            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="First name"
                  value={firstName}
                  onChange={(event) => setFirstName(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
                <input
                  type="text"
                  placeholder="Last name"
                  value={lastName}
                  onChange={(event) => setLastName(event.target.value)}
                  className="rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <input
                type="email"
                placeholder="Email for confirmation"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-xl border border-slate-300 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <p className="mt-4 text-sm font-bold text-slate-900 dark:text-white">
              Total: ${selected.priceUsd * guests}
              {selected.cancellable ? (
                <span className="ml-2 text-xs font-normal text-emerald-600">Free cancellation</span>
              ) : null}
            </p>

            {bookError ? <p className="mt-2 text-sm text-red-500">{bookError}</p> : null}

            <button
              type="button"
              disabled={bookBusy || !bookDate || !firstName || !lastName || !email}
              onClick={() => void confirmBooking()}
              className="mt-4 w-full rounded-2xl bg-sky-600 py-3.5 text-sm font-black text-white disabled:opacity-60"
            >
              {bookBusy ? "Booking…" : `Confirm & add to trip`}
            </button>
          </section>
        </div>
      ) : null}

      {bookSuccess ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-6">
          <section className="w-full max-w-md rounded-3xl bg-white p-6 text-center dark:bg-slate-950">
            <p className="text-4xl">🎉</p>
            <h2 className="mt-3 text-xl font-black text-slate-900 dark:text-white">Experience booked!</h2>
            <p className="mt-2 text-sm text-slate-500">Confirmation</p>
            <p className="mt-1 font-mono text-2xl font-black text-sky-600">{bookSuccess}</p>
            <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
              Added to your trip itinerary — you&apos;ll see it on your Plan timeline.
            </p>
            <button
              type="button"
              onClick={() => {
                setSelected(null);
                setBookSuccess(null);
                setResults([]);
              }}
              className="mt-6 w-full rounded-2xl bg-sky-600 py-3 text-sm font-bold text-white"
            >
              Done
            </button>
          </section>
        </div>
      ) : null}

      {simplifiedMobile ? null : (
        <p className="text-[11px] text-slate-500">
          Experiences sync to your itinerary automatically. Forward a confirmation email anytime to add more.
        </p>
      )}
    </div>
  );
}

export function filterExcursionReservations<T extends { notes?: string }>(reservations: T[]): T[] {
  return reservations.filter((reservation) => isExcursionReservation(reservation.notes));
}
