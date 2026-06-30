"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import { MobileBottomSheet } from "@/components/travelAssistant/mobile/MobileBottomSheet";
import { MobileItineraryReader } from "@/components/travelAssistant/mobile/MobileItineraryReader";
import { MobilePlanNotebook } from "@/components/travelAssistant/mobile/MobilePlanNotebook";
import { MobileSettingsView } from "@/components/travelAssistant/mobile/MobileSettingsView";
import { MobileTripsView } from "@/components/travelAssistant/mobile/MobileTripsView";
import type { GlobeArc } from "@/components/travelAssistant/mobile/TripGlobe";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
import { collectRouteMapPoints } from "@/lib/travelAssistant/tripRouteMapGeo";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { StopDateRange } from "@/lib/decision/stopDates";

const TripGlobe = dynamic(
  () => import("@/components/travelAssistant/mobile/TripGlobe").then((m) => m.TripGlobe),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#061428]" /> },
);

type PlanSegment = "itinerary" | "notebook";

interface Reservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode?: string;
  notes?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  checkOutDate?: string;
  roomType?: string;
}

interface LiveStatusResult {
  flightStatus: string;
  delayMinutes: number | null;
  departureGate: string;
  departureTerminal: string;
  arrivalGate: string;
  arrivalTerminal: string;
  onTime: boolean | null;
  checkedAt: string;
  busy: boolean;
  error: string | null;
}

interface MobileMapForwardShellProps {
  activeTab: MobilePrimaryTab;
  onNavigateTab: (tab: MobilePrimaryTab) => void;
  journeyPhase: JourneyPhase;
  tripName: string;
  destination: string | null;
  startDate: string | null;
  endDate: string | null;
  hasActiveTrip: boolean;
  reservations: Reservation[];
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport: string;
  dayNotes: Record<string, string>;
  stopRanges: StopDateRange[];
  hotelNotebookNote?: string;
  onDayNoteChange: (dateKey: string, value: string) => void;
  onHotelNotebookChange?: (value: string) => void;
  onCreateTrip: () => void;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAddBooking: () => void;
  onTalkPlanner?: () => void;
  emailForwardAddress: string | null;
  onCopyForwardAddress: () => void;
  pushSubscribed: boolean;
  pushBusy: boolean;
  pushMessage: string | null;
  onEnablePush: () => void;
  billingLoading: boolean;
  isLifetime: boolean;
  isTrial: boolean;
  trialDaysRemaining: number;
  trialExpiresAt: string | null;
  hasProAccess: boolean;
  emailForwardSetupMessage?: string | null;
  onSignOut: () => void;
}

function daysUntilTrip(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = Date.parse(`${startDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.ceil((start - Date.now()) / 86_400_000));
}

function sheetTitle(tab: MobilePrimaryTab): string {
  if (tab === "trip") return "Trip";
  if (tab === "plan") return "Plan";
  if (tab === "more") return "More";
  return "";
}

export function MobileMapForwardShell({
  activeTab,
  onNavigateTab,
  journeyPhase,
  tripName,
  destination,
  startDate,
  endDate,
  hasActiveTrip,
  reservations,
  liveStatus,
  locationStatus,
  nearestAirport,
  dayNotes,
  stopRanges,
  hotelNotebookNote,
  onDayNoteChange,
  onHotelNotebookChange,
  onCreateTrip,
  onReservationTap,
  onCheckStatus,
  onDelete,
  onAddBooking,
  onTalkPlanner,
  emailForwardAddress,
  onCopyForwardAddress,
  pushSubscribed,
  pushBusy,
  pushMessage,
  onEnablePush,
  billingLoading,
  isLifetime,
  isTrial,
  trialDaysRemaining,
  trialExpiresAt,
  hasProAccess,
  emailForwardSetupMessage,
  onSignOut,
}: MobileMapForwardShellProps) {
  const [planSegment, setPlanSegment] = useState<PlanSegment>("itinerary");

  const { arcs, points } = useMemo(() => {
    const route = buildTripTransportRoute(
      reservations.filter((r) => ["flight", "train", "ride"].includes(r.type)),
    );
    const mapPoints = collectRouteMapPoints(route.segments);
    const globeArcs: GlobeArc[] = route.segments
      .filter((s) => s.lat != null && s.lon != null && s.toLat != null && s.toLon != null)
      .map((s) => ({
        id: s.id,
        fromLat: s.lat!,
        fromLon: s.lon!,
        toLat: s.toLat!,
        toLon: s.toLon!,
        color: s.status === "conflict" ? "#ef4444" : s.booked ? "#007AFF" : "#64748b",
      }));
    return { arcs: globeArcs, points: mapPoints };
  }, [reservations]);

  const sheetOpen = activeTab === "trip" || activeTab === "plan" || activeTab === "more";
  const globeImmersive = activeTab === "map";
  const countdown = daysUntilTrip(startDate);

  const closeSheet = () => onNavigateTab("home");

  return (
    <div className="relative -mx-3 min-h-[calc(100dvh-8rem)] sm:-mx-4">
      <div
        className={`pointer-events-auto fixed inset-x-0 z-0 ${
          globeImmersive ? "top-[52px] bottom-[72px]" : "top-[52px] h-[min(52dvh,420px)]"
        }`}
      >
        <div className="relative h-full w-full overflow-hidden bg-[#020818]">
          <TripGlobe arcs={arcs} points={points} immersive={globeImmersive} className="h-full" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-[var(--bg-base)] to-transparent" />
          {globeImmersive ? (
            <div className="pointer-events-auto absolute inset-x-0 bottom-4 flex justify-center gap-2 px-4">
              <Link
                href="/travel-assistant/live-map"
                className="rounded-full bg-white/10 px-4 py-2 text-[13px] font-semibold text-white backdrop-blur-md"
              >
                Family map
              </Link>
              <Link
                href="/travel-assistant/live-map?view=airport"
                className="rounded-full bg-[#007AFF] px-4 py-2 text-[13px] font-semibold text-white"
              >
                Airport mode
              </Link>
            </div>
          ) : null}
        </div>
      </div>

      {activeTab === "home" ? (
        <div className="relative z-10 space-y-4 px-3 pb-4 pt-[min(52dvh,420px)] sm:px-4">
          <header className="rounded-[var(--radius-card)] bg-[var(--bg-card)] p-4 shadow-[var(--shadow-card)]">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--accent)]">
              {hasActiveTrip ? "Your trip" : "Welcome"}
            </p>
            <h1 className="mt-1 text-[26px] font-black leading-tight tracking-tight text-[var(--text-primary)]">
              {hasActiveTrip ? tripName : "Where to next?"}
            </h1>
            {hasActiveTrip ? (
              <p className="mt-1 text-[15px] text-[var(--text-secondary)]">
                {destination ? `${destination} · ` : ""}
                {startDate && endDate
                  ? `${new Date(`${startDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${new Date(`${endDate.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`
                  : null}
                {countdown != null && countdown > 0 ? ` · ${countdown}d away` : ""}
              </p>
            ) : (
              <p className="mt-2 text-[15px] text-[var(--text-secondary)]">
                Spin the globe, then tell us your dates — or forward a booking email.
              </p>
            )}
          </header>

          {!hasActiveTrip ? (
            <section className="space-y-3">
              {onTalkPlanner ? (
                <button
                  type="button"
                  onClick={onTalkPlanner}
                  className="w-full min-h-[52px] rounded-[var(--radius-button)] bg-[var(--accent)] text-[17px] font-bold text-white"
                >
                  Tell us about your trip
                </button>
              ) : null}
              <button
                type="button"
                onClick={onCreateTrip}
                className="w-full min-h-[48px] rounded-[var(--radius-button)] border border-[var(--border-default)] bg-[var(--bg-card)] text-[15px] font-semibold text-[var(--text-primary)]"
              >
                Set dates manually
              </button>
            </section>
          ) : (
            <MobileAssistView
              journeyPhase={journeyPhase}
              reservations={reservations}
              tripName={tripName}
              locationStatus={locationStatus}
              nearestAirport={nearestAirport}
              onReservationTap={onReservationTap}
            />
          )}

          {hasActiveTrip ? (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onNavigateTab("trip")}
                className="min-h-[48px] rounded-2xl bg-[var(--bg-card)] px-3 py-3 text-left shadow-sm ring-1 ring-[var(--border-default)]"
              >
                <p className="text-[13px] font-semibold text-[var(--text-muted)]">Bookings</p>
                <p className="text-[15px] font-bold text-[var(--text-primary)]">Flights & hotels</p>
              </button>
              <button
                type="button"
                onClick={() => onNavigateTab("plan")}
                className="min-h-[48px] rounded-2xl bg-[var(--bg-card)] px-3 py-3 text-left shadow-sm ring-1 ring-[var(--border-default)]"
              >
                <p className="text-[13px] font-semibold text-[var(--text-muted)]">Itinerary</p>
                <p className="text-[15px] font-bold text-[var(--text-primary)]">Plan your days</p>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {activeTab === "map" ? (
        <div className="relative z-10 px-3 pb-4 pt-[calc(100dvh-10rem)] sm:px-4">
          <p className="rounded-2xl bg-[var(--bg-card)]/90 p-4 text-center text-[15px] text-[var(--text-secondary)] backdrop-blur-md">
            Drag to rotate · 360° view of your route
          </p>
        </div>
      ) : null}

      <MobileBottomSheet open={sheetOpen} title={sheetTitle(activeTab)} onClose={closeSheet}>
        {activeTab === "trip" ? (
          <MobileTripsView
            hasActiveTrip={hasActiveTrip}
            trip={
              hasActiveTrip
                ? {
                    name: tripName,
                    destination: destination ?? "",
                    startDate: startDate ?? "",
                    endDate: endDate ?? "",
                  }
                : null
            }
            reservations={reservations}
            liveStatus={liveStatus}
            locationStatus={locationStatus}
            nearestAirport={nearestAirport}
            onCreateTrip={onCreateTrip}
            onAddBooking={onAddBooking}
            onReservationTap={onReservationTap}
            onCheckStatus={onCheckStatus}
            onDelete={onDelete}
            hotelNotebookNote={hotelNotebookNote}
            onHotelNotebookChange={onHotelNotebookChange}
          />
        ) : null}

        {activeTab === "plan" ? (
          <div className="space-y-4">
            <div className="flex gap-2 rounded-2xl bg-[var(--bg-muted)] p-1">
              {(["itinerary", "notebook"] as const).map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setPlanSegment(id)}
                  className={`min-h-[44px] flex-1 rounded-xl font-bold ${
                    planSegment === id
                      ? "bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm"
                      : "text-[var(--text-muted)]"
                  }`}
                >
                  {id === "itinerary" ? "Itinerary" : "Notebook"}
                </button>
              ))}
            </div>
            {planSegment === "itinerary" ? (
              <MobileItineraryReader
                embedded
                open
                onClose={() => {}}
                tripName={tripName}
                tripStartDate={startDate}
                tripEndDate={endDate}
                reservations={reservations}
                dayNotes={dayNotes}
                stopRanges={stopRanges}
                onDayNoteChange={onDayNoteChange}
                onReservationTap={onReservationTap}
              />
            ) : (
              <MobilePlanNotebook
                tripName={tripName}
                tripStartDate={startDate}
                tripEndDate={endDate}
                reservations={reservations}
                dayNotes={dayNotes}
                stopRanges={stopRanges}
                onDayNoteChange={onDayNoteChange}
                onCreateTrip={onCreateTrip}
              />
            )}
          </div>
        ) : null}

        {activeTab === "more" ? (
          <div className="space-y-4">
            <Link
              href="/travel-assistant/live-map"
              className="block rounded-2xl bg-[var(--bg-card)] p-4 font-semibold text-[var(--text-primary)] ring-1 ring-[var(--border-default)]"
            >
              Family map & live location
            </Link>
            <MobileSettingsView
              emailForwardAddress={emailForwardAddress}
              onCopyForwardAddress={onCopyForwardAddress}
              pushSubscribed={pushSubscribed}
              pushBusy={pushBusy}
              pushMessage={pushMessage}
              onEnablePush={onEnablePush}
              billingLoading={billingLoading}
              isLifetime={isLifetime}
              isTrial={isTrial}
              trialDaysRemaining={trialDaysRemaining}
              trialExpiresAt={trialExpiresAt}
              hasProAccess={hasProAccess}
              emailForwardSetupMessage={emailForwardSetupMessage}
              onSignOut={onSignOut}
            />
          </div>
        ) : null}
      </MobileBottomSheet>
    </div>
  );
}
