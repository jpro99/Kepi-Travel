"use client";

import { useMemo, useState } from "react";
import { Plane, Hotel, Utensils, Train, Car, MapPin } from "lucide-react";
import { SharedHotelDetailSheet } from "@/components/share/SharedHotelDetailSheet";
import {
  buildSharedHotelContact,
  type SharedHotelReservationInput,
} from "@/lib/travelAssistant/sharedHotelInfo";
import { appleCaption, appleCard, appleCardTitle, appleMetadata } from "@/lib/ui/appleDesign";

const TYPE_ICON = {
  flight: Plane,
  hotel: Hotel,
  dinner: Utensils,
  train: Train,
  ride: Car,
} as const;

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
          const TypeIcon = TYPE_ICON[reservation.type as keyof typeof TYPE_ICON];
          return (
            <CardTag
              key={reservation.id}
              type={isHotel ? "button" : undefined}
              onClick={isHotel ? () => setActiveHotelId(reservation.id) : undefined}
              className={`w-full p-4 text-left ${appleCard} ${isHotel ? "min-h-[48px] active:opacity-80" : ""}`}
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-[#F5F5F7] px-2 py-0.5 text-[13px] font-medium capitalize text-[#6E6E73]">
                  {TypeIcon ? <TypeIcon className="h-3.5 w-3.5" strokeWidth={1.85} aria-hidden /> : null}
                  {reservation.type}
                </span>
                <span className={appleMetadata}>{formatDate(reservation.localTime)}</span>
              </div>
              <p className={appleCardTitle}>{reservation.title || reservation.provider}</p>
              {reservation.provider && reservation.title ? (
                <p className={`${appleMetadata} mt-0.5`}>{reservation.provider}</p>
              ) : null}
              {reservation.localTime && reservation.type !== "hotel" ? (
                <p className={`${appleMetadata} mt-1`}>{formatTime(reservation.localTime)}</p>
              ) : null}
              {reservation.type === "hotel" && reservation.checkOutDate ? (
                <p className={`${appleMetadata} mt-1`}>
                  Check-in {formatDate(reservation.localTime)}
                  {reservation.checkOutDate ? ` · Out ${formatDate(reservation.checkOutDate)}` : ""}
                </p>
              ) : null}
              {reservation.location ? (
                <p className={`${appleCaption} mt-1 flex items-center gap-1`}>
                  <MapPin className="h-3.5 w-3.5 shrink-0" strokeWidth={1.85} aria-hidden />
                  {reservation.location}
                </p>
              ) : null}
              {isHotel ? (
                <p className="mt-3 text-[15px] font-semibold text-[#007AFF]">Address & phone</p>
              ) : null}
              {reservation.notes && reservation.type !== "hotel" ? (
                <p className={`${appleCaption} mt-2`}>{reservation.notes}</p>
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
