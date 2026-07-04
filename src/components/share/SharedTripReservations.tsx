"use client";

import { useMemo, useState } from "react";
import { SharedHotelDetailSheet } from "@/components/share/SharedHotelDetailSheet";
import {
  buildSharedHotelContact,
  type SharedHotelReservationInput,
} from "@/lib/travelAssistant/sharedHotelInfo";

const TYPE_EMOJI: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  dinner: "🍽",
  train: "🚆",
  ride: "🚗",
};

function formatDate(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (Number.isNaN(ms)) return localTime;
  return new Date(ms).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function formatTime(localTime: string): string {
  const ms = Date.parse(localTime.replace(" ", "T"));
  if (Number.isNaN(ms)) return "";
  return new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

interface SharedReservation extends SharedHotelReservationInput {
  id: string;
}

interface SharedTripReservationsProps {
  reservations: SharedReservation[];
}

export function SharedTripReservations({ reservations }: SharedTripReservationsProps) {
  const [activeHotelId, setActiveHotelId] = useState<string | null>(null);

  const sorted = useMemo(
    () =>
      [...reservations].sort(
        (a, b) => Date.parse(a.localTime.replace(" ", "T")) - Date.parse(b.localTime.replace(" ", "T")),
      ),
    [reservations],
  );

  const activeHotel = sorted.find((reservation) => reservation.id === activeHotelId) ?? null;
  const activeContact = activeHotel ? buildSharedHotelContact(activeHotel) : null;

  return (
    <>
      <div className="flex flex-col gap-3">
        {sorted.map((reservation) => {
          const isHotel = reservation.type === "hotel";
          const CardTag = isHotel ? "button" : "article";
          return (
            <CardTag
              key={reservation.id}
              type={isHotel ? "button" : undefined}
              onClick={isHotel ? () => setActiveHotelId(reservation.id) : undefined}
              className={`w-full rounded-2xl border p-4 text-left transition ${
                reservation.type === "flight"
                  ? "border-violet-500/30 bg-gradient-to-br from-[#1a1030] to-[#0d1117]"
                  : "border-slate-700 bg-[#161b22]"
              } ${isHotel ? "cursor-pointer hover:border-emerald-500/40 hover:bg-[#1a2330] active:scale-[0.99]" : ""}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                    reservation.type === "flight"
                      ? "bg-violet-500/20 text-violet-300"
                      : reservation.type === "hotel"
                        ? "bg-emerald-500/15 text-emerald-300"
                        : "bg-slate-800 text-slate-400"
                  }`}
                >
                  {TYPE_EMOJI[reservation.type] ?? "📌"} {reservation.type}
                </span>
                <span className="text-sm text-slate-400">{formatDate(reservation.localTime)}</span>
              </div>
              <p className="text-lg font-bold">{reservation.title || reservation.provider}</p>
              {reservation.provider && reservation.title ? (
                <p className="text-sm text-slate-400">{reservation.provider}</p>
              ) : null}
              {reservation.localTime && reservation.type !== "hotel" ? (
                <p className="mt-1 text-sm text-slate-300">{formatTime(reservation.localTime)}</p>
              ) : null}
              {reservation.type === "hotel" && reservation.checkOutDate ? (
                <p className="mt-1 text-sm text-slate-300">
                  Check-in {formatDate(reservation.localTime)}
                  {reservation.checkOutDate ? ` · Out ${formatDate(reservation.checkOutDate)}` : ""}
                </p>
              ) : null}
              {reservation.location ? (
                <p className="mt-1 text-xs text-slate-500">📍 {reservation.location}</p>
              ) : null}
              {isHotel ? (
                <p className="mt-3 text-xs font-semibold text-emerald-300">Tap for address & phone →</p>
              ) : null}
              {reservation.notes && reservation.type !== "hotel" ? (
                <p className="mt-2 text-xs text-slate-400">{reservation.notes}</p>
              ) : null}
            </CardTag>
          );
        })}
      </div>

      {activeContact ? (
        <SharedHotelDetailSheet contact={activeContact} onClose={() => setActiveHotelId(null)} />
      ) : null}
    </>
  );
}
