"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { MobileItineraryReader } from "@/components/travelAssistant/mobile/MobileItineraryReader";
import { MobilePlanNotebook } from "@/components/travelAssistant/mobile/MobilePlanNotebook";
import { MobileSettingsView } from "@/components/travelAssistant/mobile/MobileSettingsView";
import { MobileTripShellHeader } from "@/components/travelAssistant/mobile/MobileTripShellHeader";
import { MobileTripsView } from "@/components/travelAssistant/mobile/MobileTripsView";
import { MobileBookHeader, MobileBookSegmentToggle } from "@/components/travelAssistant/mobile/MobileBookChrome";
import type { GlobeArc } from "@/components/travelAssistant/mobile/TripGlobe";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import { DestinationHeroPhoto, resolveHeroCity } from "@/components/travelAssistant/tripHeroVisuals";
import { buildTripTransportRoute } from "@/lib/travelAssistant/tripTransportRoute";
import { collectRouteMapPoints } from "@/lib/travelAssistant/tripRouteMapGeo";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { StopDateRange } from "@/lib/decision/stopDates";

const TripGlobe = dynamic(
  () => import("@/components/travelAssistant/mobile/TripGlobe").then((m) => m.TripGlobe),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse rounded-[var(--radius-card)] bg-[#061428]" /> },
);

type PlanSegment = "itinerary" | "notebook";
type BookSegment = "flights" | "hotels";

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
  missingPriceCount?: number;
  onReviewPricing?: () => void;
  onGapActionTap?: (tab: string) => void;
  onSignOut: () => void;
}

function daysUntilTrip(startDate: string | null): number | null {
  if (!startDate) return null;
  const start = Date.parse(`${startDate.slice(0, 10)}T12:00:00Z`);
  if (Number.isNaN(start)) return null;
  return Math.max(0, Math.ceil((start - Date.now()) / 86_400_000));
}

function formatDateRange(startDate: string | null, endDate: string | null): string | null {
  if (!startDate || !endDate) return null;
  const fmt = (value: string) =>
    new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  return `${fmt(startDate)} – ${fmt(endDate)}`;
}

const juicyBtn =
  "min-h-[56px] w-full rounded-[var(--radius-button)] text-[19px] font-bold transition active:scale-[0.98] touch-manipulation";
const juicyBtnPrimary = `${juicyBtn} bg-[var(--accent)] text-white shadow-md`;
const juicyBtnSecondary = `${juicyBtn} border-2 border-[var(--border-default)] bg-[var(--bg-card)] text-[var(--text-primary)]`;
const quickActionBtn =
  "min-h-[72px] rounded-2xl bg-[var(--bg-card)] px-4 py-4 text-left shadow-sm ring-1 ring-[var(--border-default)] active:scale-[0.99] touch-manipulation";

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
  missingPriceCount = 0,
  onReviewPricing,
  onGapActionTap,
  onSignOut,
}: MobileMapForwardShellProps) {
  const [planSegment, setPlanSegment] = useState<PlanSegment>("itinerary");
  const [bookSegment, setBookSegment] = useState<BookSegment>("flights");

  const transportReservations = useMemo(
    () => reservations.filter((r) => ["flight", "train", "ride"].includes(r.type)),
    [reservations],
  );
  const flightCount = reservations.filter((r) => r.type === "flight").length;
  const hotelCount = reservations.filter((r) => r.type === "hotel").length;
  const heroCity = resolveHeroCity(destination, reservations);
  const dateRange = formatDateRange(startDate, endDate);

  const { arcs, points, hasRoute } = useMemo(() => {
    const route = buildTripTransportRoute(transportReservations);
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
    return { arcs: globeArcs, points: mapPoints, hasRoute: globeArcs.length > 0 };
  }, [transportReservations]);

  const countdown = daysUntilTrip(startDate);

  const tripHeader = hasActiveTrip ? (
    <MobileTripShellHeader
      tripName={tripName}
      destination={destination}
      startDate={startDate}
      endDate={endDate}
    />
  ) : null;

  if (activeTab === "home") {
    const subtitleParts = hasActiveTrip
      ? [
          destination ?? heroCity,
          dateRange,
          countdown != null && countdown > 0 ? `${countdown} day${countdown === 1 ? "" : "s"} away` : null,
          flightCount > 0 || hotelCount > 0
            ? `${flightCount} flight${flightCount === 1 ? "" : "s"} · ${hotelCount} hotel${hotelCount === 1 ? "" : "s"}`
            : null,
        ].filter(Boolean)
      : [];

    return (
      <div className="kepi-mobile-shell space-y-5 pb-4">
        {hasActiveTrip ? (
          <button
            type="button"
            onClick={() => onNavigateTab("map")}
            className="group relative block w-full overflow-hidden rounded-[var(--radius-card)] bg-[#020818] text-left shadow-[var(--shadow-card)] ring-1 ring-[var(--border-default)]"
            aria-label="Open full map"
          >
            <div className="relative min-h-[200px]">
              <DestinationHeroPhoto city={heroCity} />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-900/30" />
              <div className="relative flex h-full min-h-[200px] flex-col justify-end p-5">
                <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Home</p>
                <h1 className="mt-1 text-[2rem] font-black leading-tight tracking-tight text-white">{tripName}</h1>
                <p className="mt-2 text-[17px] leading-snug text-sky-100/85">{subtitleParts.join(" · ")}</p>
              </div>
            </div>

            <div className="relative min-h-[200px] border-t border-white/10">
              {hasRoute ? (
                <TripGlobe arcs={arcs} points={points} className="h-full min-h-[200px]" />
              ) : (
                <div className="flex h-full min-h-[200px] items-center justify-center bg-[#061428] px-6 text-center">
                  <p className="text-sm text-sky-200/70">Add flights to see your route on the globe</p>
                </div>
              )}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#020818] via-[#020818]/80 to-transparent px-4 pb-4 pt-12">
                <p className="text-[11px] font-bold uppercase tracking-widest text-sky-300/80">Your route</p>
                <p className="mt-0.5 text-[17px] font-bold text-white group-hover:text-sky-200">
                  Tap for full 360° map →
                </p>
              </div>
            </div>
          </button>
        ) : (
          <header className="rounded-[var(--radius-card)] bg-[var(--bg-card)] p-5 shadow-[var(--shadow-card)]">
            <p className="text-[13px] font-bold uppercase tracking-widest text-[var(--accent)]">Welcome</p>
            <h1 className="mt-1 text-[2rem] font-black leading-tight tracking-tight text-[var(--text-primary)]">
              Where to next?
            </h1>
            <p className="mt-2 text-[19px] leading-snug text-[var(--text-secondary)]">
              Tell us your dates — or forward a booking email.
            </p>
          </header>
        )}

        {hasActiveTrip ? (
          <TripHealthStrip
            reservations={reservations}
            missingPriceCount={missingPriceCount}
            onGapActionTap={onGapActionTap}
            onReviewPricing={onReviewPricing}
          />
        ) : null}

        {!hasActiveTrip ? (
          <section className="space-y-3">
            {onTalkPlanner ? (
              <button type="button" onClick={onTalkPlanner} className={juicyBtnPrimary}>
                Tell us about your trip
              </button>
            ) : null}
            <button type="button" onClick={onCreateTrip} className={juicyBtnSecondary}>
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
          <div className="grid grid-cols-2 gap-3">
            <button type="button" onClick={() => onNavigateTab("book")} className={quickActionBtn}>
              <p className="text-[15px] font-semibold text-[var(--text-muted)]">Bookings</p>
              <p className="mt-1 text-[19px] font-bold text-[var(--text-primary)]">Flights & hotels</p>
            </button>
            <button type="button" onClick={() => onNavigateTab("plan")} className={quickActionBtn}>
              <p className="text-[15px] font-semibold text-[var(--text-muted)]">Itinerary</p>
              <p className="mt-1 text-[19px] font-bold text-[var(--text-primary)]">Plan your days</p>
            </button>
          </div>
        ) : null}
      </div>
    );
  }

  if (activeTab === "map") {
    return (
      <div className="kepi-mobile-shell -mx-1 flex min-h-[calc(100dvh-11rem)] flex-col pb-2">
        <div className="relative min-h-[calc(100dvh-11rem)] flex-1 overflow-hidden rounded-[var(--radius-card)] bg-[#020818] ring-1 ring-[var(--border-default)]">
          <TripGlobe arcs={arcs} points={points} immersive className="h-full min-h-[calc(100dvh-11rem)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent px-4 pb-4 pt-16">
            <p className="text-center text-[19px] font-semibold text-white/90">Drag to rotate your route</p>
          </div>
          <div className="absolute inset-x-0 bottom-4 flex justify-center gap-3 px-4">
            <Link
              href="/travel-assistant/live-map"
              className="min-h-[48px] rounded-full bg-white/15 px-5 py-3 text-[17px] font-bold text-white backdrop-blur-md"
            >
              Family map
            </Link>
            <Link
              href="/travel-assistant/live-map?view=airport"
              className="min-h-[48px] rounded-full bg-[#007AFF] px-5 py-3 text-[17px] font-bold text-white"
            >
              Airport mode
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (activeTab === "book") {
    return (
      <div className="kepi-mobile-shell space-y-5 pb-4">
        {hasActiveTrip ? (
          <>
            <MobileBookHeader tripName={tripName} flightCount={flightCount} hotelCount={hotelCount} />
            <MobileBookSegmentToggle active={bookSegment} onChange={setBookSegment} />
          </>
        ) : null}
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
          hideRouteMap
          segment={bookSegment}
          onSegmentChange={setBookSegment}
          hideSegmentToggle={hasActiveTrip}
        />
      </div>
    );
  }

  if (activeTab === "plan") {
    return (
      <div className="kepi-mobile-shell space-y-5 pb-4">
        {tripHeader}
        <div className="flex gap-2 rounded-2xl bg-[var(--bg-muted)] p-1.5">
          {(["itinerary", "notebook"] as const).map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => setPlanSegment(id)}
              className={`min-h-[52px] flex-1 rounded-xl font-bold touch-manipulation ${
                planSegment === id
                  ? "bg-[var(--bg-card)] text-[19px] text-[var(--text-primary)] shadow-sm"
                  : "text-[17px] text-[var(--text-muted)]"
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
    );
  }

  return (
    <div className="kepi-mobile-shell space-y-5 pb-4">
      <header>
        <h1 className="text-[2rem] font-bold tracking-tight text-[var(--text-primary)]">More</h1>
        <p className="mt-1 text-[19px] text-[var(--text-secondary)]">Settings & family</p>
      </header>
      <Link
        href="/travel-assistant/live-map"
        className="flex min-h-[56px] items-center rounded-2xl bg-[var(--bg-card)] px-5 text-[19px] font-bold text-[var(--text-primary)] ring-1 ring-[var(--border-default)]"
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
  );
}
