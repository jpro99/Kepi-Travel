"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SharedHotelDetailSheet } from "@/components/share/SharedHotelDetailSheet";
import { buildSharedHotelContact } from "@/lib/travelAssistant/sharedHotelInfo";
import {
  formatOfflineKitSavedAt,
  loadOfflineTravelKit,
  reservationCardSubtitle,
  reservationCardTitle,
  type OfflineKitReservation,
  type OfflineTravelKit,
} from "@/lib/travelAssistant/offlineTravelKit";
import { useBrowserConnectivity } from "@/hooks/useBrowserConnectivity";

const TYPE_EMOJI: Record<string, string> = {
  flight: "✈️",
  hotel: "🏨",
  dinner: "🍽",
  train: "🚆",
  ride: "🚗",
};

interface OfflineTravelKitViewProps {
  initialKit?: OfflineTravelKit | null;
  showBackLink?: boolean;
}

export function OfflineTravelKitView({ initialKit = null, showBackLink = true }: OfflineTravelKitViewProps) {
  const { isOnline, ready } = useBrowserConnectivity();
  const [kit, setKit] = useState<OfflineTravelKit | null>(initialKit);
  const [loading, setLoading] = useState(!initialKit);
  const [activeHotelId, setActiveHotelId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    if (initialKit) return;
    let cancelled = false;
    void loadOfflineTravelKit().then((loaded) => {
      if (!cancelled) {
        setKit(loaded);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [initialKit]);

  const activeHotel = useMemo(
    () => kit?.reservations.find((reservation) => reservation.id === activeHotelId) ?? null,
    [activeHotelId, kit],
  );

  const activeHotelContact = activeHotel
    ? buildSharedHotelContact({
        type: "hotel",
        title: activeHotel.title,
        provider: activeHotel.provider,
        localTime: activeHotel.localTime,
        location: activeHotel.location,
        confirmationCode: activeHotel.confirmationCode,
        checkOutDate: activeHotel.checkOutDate,
        roomType: activeHotel.roomType,
        hotelPhone: activeHotel.hotelPhone,
        notes: activeHotel.notes,
      })
    : null;

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#0d1117] px-4 py-8 text-[#e6edf3]">
        <div className="mx-auto max-w-md animate-pulse space-y-4">
          <div className="h-8 w-2/3 rounded-lg bg-slate-800" />
          <div className="h-32 rounded-2xl bg-slate-800" />
          <div className="h-24 rounded-2xl bg-slate-800" />
        </div>
      </div>
    );
  }

  if (!kit) {
    return (
      <div className="min-h-dvh bg-[#0d1117] px-4 py-8 text-[#e6edf3]">
        <div className="mx-auto max-w-md">
          <header className="mb-6">
            <p className="text-sm font-bold uppercase tracking-wide text-sky-400">Offline travel kit</p>
            <h1 className="mt-2 text-3xl font-black">Nothing saved yet</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-400">
              Open Kepi Travel while you have Wi‑Fi or cell service. Your active trip is saved automatically for
              airplane mode, dead zones, and delays.
            </p>
          </header>
          {showBackLink ? (
            <Link
              href="/travel-assistant"
              className="inline-flex min-h-[48px] items-center rounded-xl bg-[#007AFF] px-5 text-base font-bold text-white"
            >
              Open Kepi Travel
            </Link>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[#0d1117] px-4 py-6 text-[#e6edf3]">
      <div className="mx-auto max-w-md pb-8">
        <header className="mb-5">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-sm font-bold uppercase tracking-wide text-sky-400">Offline travel kit</p>
            {ready ? (
              <span
                className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide ${
                  isOnline ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-200"
                }`}
              >
                {isOnline ? "Online" : "Offline"}
              </span>
            ) : null}
          </div>
          <h1 className="text-3xl font-black leading-tight">{kit.tripName}</h1>
          {kit.destination ? <p className="mt-1 text-base text-slate-400">📍 {kit.destination}</p> : null}
          <p className="mt-2 text-xs text-slate-500">
            {kit.startDate} → {kit.endDate}
          </p>
          <p className="mt-1 text-xs text-slate-600">Saved {formatOfflineKitSavedAt(kit.savedAt)}</p>
        </header>

        <section className="mb-4 rounded-2xl border border-sky-500/30 bg-gradient-to-br from-[#0f1a2e] to-[#0d1117] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-sky-300">Right now</p>
          <h2 className="mt-1 text-xl font-black">{kit.journeyHeadline}</h2>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">{kit.journeyDetail}</p>
        </section>

        {kit.gettingToHotelHint ? (
          <section className="mb-4 rounded-2xl border border-emerald-500/25 bg-[#101820] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-300">Getting to your hotel</p>
            <p className="mt-2 text-sm leading-relaxed text-slate-200">{kit.gettingToHotelHint}</p>
            {kit.airportTransportLabel ? (
              <p className="mt-2 text-xs text-slate-500">{kit.airportTransportLabel}</p>
            ) : null}
          </section>
        ) : null}

        {kit.hotelNotebookNote ? (
          <section className="mb-4 rounded-2xl border border-slate-700 bg-[#161b22] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Hotel notes</p>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-200">{kit.hotelNotebookNote}</p>
          </section>
        ) : null}

        <section className="mb-4">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-400">Full itinerary</h2>
          <div className="flex flex-col gap-3">
            {kit.reservations.map((reservation) => (
              <OfflineReservationCard
                key={reservation.id}
                reservation={reservation}
                highlighted={reservation.id === kit.nextReservationId}
                expanded={expandedId === reservation.id}
                onToggle={() =>
                  setExpandedId((previous) => (previous === reservation.id ? null : reservation.id))
                }
                onOpenHotel={() => setActiveHotelId(reservation.id)}
              />
            ))}
          </div>
        </section>

        {kit.readinessItems.length > 0 ? (
          <section className="mb-4 rounded-2xl border border-slate-700 bg-[#161b22] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Trip checklist</p>
            <ul className="mt-3 space-y-2">
              {kit.readinessItems.map((item) => (
                <li key={item.id} className="flex items-start gap-2 text-sm">
                  <span className={item.complete ? "text-emerald-400" : "text-slate-500"}>
                    {item.complete ? "✓" : "○"}
                  </span>
                  <span className={item.complete ? "text-slate-400 line-through" : "text-slate-200"}>
                    {item.title}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {kit.documentEssentials.length > 0 ? (
          <section className="mb-4 rounded-2xl border border-slate-700 bg-[#161b22] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Documents & essentials</p>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-slate-300">
              {kit.documentEssentials.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ) : null}

        {Object.keys(kit.dayNotes).length > 0 ? (
          <section className="mb-4 rounded-2xl border border-slate-700 bg-[#161b22] p-4">
            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Day notes</p>
            <div className="mt-3 space-y-3">
              {Object.entries(kit.dayNotes)
                .filter(([, note]) => note.trim())
                .sort(([left], [right]) => left.localeCompare(right))
                .map(([dateKey, note]) => (
                  <div key={dateKey}>
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">{dateKey}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-slate-200">{note}</p>
                  </div>
                ))}
            </div>
          </section>
        ) : null}

        <p className="text-center text-xs leading-relaxed text-slate-600">
          Flight status, gates, and live updates need internet. Everything here was saved from your last online sync.
        </p>

        {showBackLink ? (
          <div className="mt-6 flex flex-col gap-2">
            <Link
              href="/travel-assistant"
              className="flex min-h-[48px] items-center justify-center rounded-xl border border-slate-600 bg-[#161b22] text-base font-bold text-sky-300"
            >
              Back to Kepi Travel
            </Link>
          </div>
        ) : null}
      </div>

      {activeHotelContact ? (
        <SharedHotelDetailSheet contact={activeHotelContact} onClose={() => setActiveHotelId(null)} />
      ) : null}
    </div>
  );
}

function OfflineReservationCard({
  reservation,
  highlighted,
  expanded,
  onToggle,
  onOpenHotel,
}: {
  reservation: OfflineKitReservation;
  highlighted: boolean;
  expanded: boolean;
  onToggle: () => void;
  onOpenHotel: () => void;
}) {
  const isHotel = reservation.type === "hotel";

  return (
    <article
      className={`rounded-2xl border p-4 ${
        reservation.type === "flight"
          ? "border-violet-500/30 bg-gradient-to-br from-[#1a1030] to-[#0d1117]"
          : "border-slate-700 bg-[#161b22]"
      } ${highlighted ? "ring-2 ring-sky-500/40" : ""}`}
    >
      <button type="button" onClick={onToggle} className="w-full text-left">
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
            {highlighted ? " · next" : ""}
          </span>
        </div>
        <p className="text-lg font-bold">{reservationCardTitle(reservation)}</p>
        <p className="mt-1 text-sm text-slate-400">{reservationCardSubtitle(reservation)}</p>
      </button>

      {expanded ? (
        <div className="mt-3 space-y-2 border-t border-slate-700 pt-3 text-sm text-slate-300">
          {reservation.type === "flight" ? (
            <>
              {reservation.flightAirline ? <p>Airline: {reservation.flightAirline}</p> : null}
              {reservation.flightNumber ? <p>Flight: {reservation.flightNumber}</p> : null}
              {reservation.flightDepartureTerminal ? <p>Terminal: {reservation.flightDepartureTerminal}</p> : null}
              {reservation.flightDepartureGate ? <p>Gate: {reservation.flightDepartureGate}</p> : null}
              {reservation.flightArrivalTerminal ? <p>Arrival terminal: {reservation.flightArrivalTerminal}</p> : null}
              {reservation.flightArrivalGate ? <p>Arrival gate: {reservation.flightArrivalGate}</p> : null}
              {typeof reservation.flightDelayMinutes === "number" && reservation.flightDelayMinutes > 0 ? (
                <p className="font-semibold text-amber-300">Delay: {reservation.flightDelayMinutes} minutes (saved offline)</p>
              ) : reservation.flightStatus ? (
                <p>Status: {reservation.flightStatus}</p>
              ) : null}
            </>
          ) : null}

          {reservation.confirmationCode ? (
            <p>
              Confirmation: <span className="font-mono font-semibold">{reservation.confirmationCode}</span>
            </p>
          ) : null}
          {reservation.location ? <p>Location: {reservation.location}</p> : null}
          {reservation.notes ? <p className="whitespace-pre-wrap text-slate-400">{reservation.notes}</p> : null}

          {isHotel && reservation.hotelContact ? (
            <div className="flex flex-col gap-2 pt-1">
              {reservation.hotelContact.address ? <p>Address: {reservation.hotelContact.address}</p> : null}
              {reservation.hotelContact.phone ? (
                <a href={reservation.hotelContact.phoneTelHref ?? undefined} className="font-bold text-[#007AFF]">
                  📞 {reservation.hotelContact.phone}
                </a>
              ) : null}
              <button
                type="button"
                onClick={onOpenHotel}
                className="min-h-[44px] rounded-xl bg-emerald-600 text-sm font-bold text-white"
              >
                Full hotel details & maps
              </button>
            </div>
          ) : null}

          {reservation.manageUrl ? (
            <a href={reservation.manageUrl} target="_blank" rel="noopener noreferrer" className="text-[#007AFF]">
              Manage booking
            </a>
          ) : null}
        </div>
      ) : (
        <button type="button" onClick={onToggle} className="mt-2 text-xs font-semibold text-sky-400">
          Tap for full details →
        </button>
      )}
    </article>
  );
}
