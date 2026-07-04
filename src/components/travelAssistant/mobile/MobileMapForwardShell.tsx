"use client";

import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { MobileAssistView } from "@/components/travelAssistant/mobile/MobileAssistView";
import { TripHealthStrip } from "@/components/travelAssistant/TripHealthStrip";
import { TripSpendBadge } from "@/components/travelAssistant/TripSpendBadge";
import { MobileItineraryReader } from "@/components/travelAssistant/mobile/MobileItineraryReader";
import { MobilePlanNotebook } from "@/components/travelAssistant/mobile/MobilePlanNotebook";
import { MobileSettingsView } from "@/components/travelAssistant/mobile/MobileSettingsView";
import { TripMemoriesPanel } from "@/components/travelAssistant/TripMemoriesPanel";
import { PointsTravelProfileCard } from "@/components/travelAssistant/PointsTravelProfileCard";
import { TravelFitCard } from "@/components/travelAssistant/TravelFitCard";
import { TravelStyleBadge } from "@/components/travelAssistant/TravelStyleQuiz";
import { LoyaltyWalletSection } from "@/components/loyalty/LoyaltyWalletSection";
import { ShareTripCard } from "@/components/travelAssistant/ShareTripCard";
import type { TravelStyleProfile } from "@/lib/traveler/types";
import { MobileTripShellHeader } from "@/components/travelAssistant/mobile/MobileTripShellHeader";
import { MobileTripsView } from "@/components/travelAssistant/mobile/MobileTripsView";
import { MobileBookHeader, MobileBookSegmentToggle } from "@/components/travelAssistant/mobile/MobileBookChrome";
import {
  MOBILE_TAB_BAR_CLEARANCE,
  type MobilePrimaryTab,
} from "@/components/travelAssistant/mobile/mobileShellTypes";
import { DestinationHeroPhoto, resolveHeroCity } from "@/components/travelAssistant/tripHeroVisuals";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { BookSubTab } from "@/lib/travelAssistant/consumerTabs";
import type { FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import type { HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import type { TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import type { HotelStayMapReservation } from "@/lib/travelAssistant/tripHotelStayMap";

const TripHomeOverviewMap = dynamic(
  () => import("@/components/travelAssistant/TripHomeOverviewMap").then((m) => m.TripHomeOverviewMap),
  { ssr: false, loading: () => <div className="h-full w-full animate-pulse bg-[#dbeafe]" /> },
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
  onAddFlight?: () => void;
  onAddHotel?: () => void;
  onAddGroundTransport?: () => void;
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
  bookSubTab?: BookSubTab;
  onBookSubTabChange?: (subTab: BookSubTab) => void;
  tripId?: string | null;
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  flightSearchDefaults?: FlightSearchDefaults;
  hotelSearchDefaults?: HotelSearchDefaults;
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  usuallySkipsConnections?: boolean;
  onLaunchHotelSearch?: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
  onSearchHotels?: () => void;
  inlineHotelSearchActive?: boolean;
  inlineHotelSearchDefaults?: HotelSearchDefaults;
  hotelSearchGeneration?: number;
  onCloseInlineHotelSearch?: () => void;
  onAddHotelFromSearch?: (hotel: import("@/lib/hotels/types").HotelSearchResult) => void;
  hotelSearchMapPreview?: { city: string; lat: number; lng: number } | null;
  onSearchSegment?: (segment: TripStaySegment) => void;
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (segment: TripStaySegment, intent: "needs_hotel" | "skip") => void | Promise<void>;
  pendingForwardReview?: { id: string; reason: string; subject?: string } | null;
  onOpenForwardReview?: (reviewId: string) => void;
  onImportConfirmation?: (file: File) => void;
  importConfirmationBusy?: boolean;
  travelFitReservations?: Reservation[];
  tripSpendSummary?: TripSpendSummary;
  tripProblemCount?: number;
  userId?: string | null;
  travelStyleProfile?: TravelStyleProfile | null;
  offlineKitSavedAtLabel?: string | null;
  offlineKitReservationCount?: number;
  offlineKitSyncing?: boolean;
  onRefreshOfflineKit?: () => void;
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
  onAddFlight,
  onAddHotel,
  onAddGroundTransport,
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
  bookSubTab = "flights",
  onBookSubTabChange,
  tripId,
  transportReservations: transportReservationsProp,
  plannedFlightLegs = [],
  flightSearchDefaults,
  hotelSearchDefaults,
  staySegments = [],
  plannedStayCities = [],
  usuallySkipsConnections,
  onLaunchHotelSearch,
  onSearchHotels,
  inlineHotelSearchActive,
  inlineHotelSearchDefaults,
  hotelSearchGeneration,
  onCloseInlineHotelSearch,
  onAddHotelFromSearch,
  hotelSearchMapPreview,
  onSearchSegment,
  onPickPlannedCity,
  onAddCityStay,
  onSetStayIntent,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy,
  travelFitReservations = [],
  tripSpendSummary,
  tripProblemCount = 0,
  userId = null,
  travelStyleProfile = null,
  offlineKitSavedAtLabel = null,
  offlineKitReservationCount = 0,
  offlineKitSyncing = false,
  onRefreshOfflineKit,
}: MobileMapForwardShellProps) {
  const [planSegment, setPlanSegment] = useState<PlanSegment>("itinerary");
  const bookSegment = bookSubTab;
  const setBookSegment = onBookSubTabChange ?? (() => {});

  const transportReservations = useMemo(
    () =>
      transportReservationsProp ??
      reservations.filter((r) => ["flight", "train", "ride"].includes(r.type)),
    [transportReservationsProp, reservations],
  );
  const hotelReservations = useMemo(
    () => reservations.filter((r) => r.type === "hotel") as HotelStayMapReservation[],
    [reservations],
  );
  const flightCount = reservations.filter((r) => r.type === "flight").length;
  const hotelCount = hotelReservations.length;
  const heroCity = resolveHeroCity(destination, reservations);
  const dateRange = formatDateRange(startDate, endDate);

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
          <>
            <div className="overflow-hidden rounded-[var(--radius-card)] bg-[#020818] shadow-[var(--shadow-card)] ring-1 ring-[var(--border-default)]">
              <div className="relative min-h-[180px]">
                <DestinationHeroPhoto city={heroCity} />
                <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/55 to-slate-900/30" />
                <div className="relative flex h-full min-h-[180px] flex-col justify-end p-5">
                  <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-sky-300/90">Home</p>
                  <h1 className="mt-1 text-[2rem] font-black leading-tight tracking-tight text-white">{tripName}</h1>
                  <p className="mt-2 text-[17px] leading-snug text-sky-100/85">{subtitleParts.join(" · ")}</p>
                </div>
              </div>

              <div className="relative min-h-[240px] border-t border-white/10">
                <TripHomeOverviewMap
                  transportReservations={transportReservations}
                  hotelReservations={hotelReservations}
                  plannedFlightLegs={plannedFlightLegs}
                  staySegments={staySegments}
                  onReservationTap={onReservationTap}
                  className="min-h-[240px]"
                />
              </div>
            </div>
          </>
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
          <>
            <MobileAssistView
              journeyPhase={journeyPhase}
              reservations={reservations}
              tripName={tripName}
              locationStatus={locationStatus}
              nearestAirport={nearestAirport}
              onReservationTap={onReservationTap}
              liveStatus={liveStatus}
            />

            {tripSpendSummary ? (
              <TripSpendBadge
                summary={tripSpendSummary}
                problemCount={tripProblemCount}
                onClick={() => onNavigateTab("book")}
                alwaysActionable
                className="w-full"
              />
            ) : null}
          </>
        ) : null}

        {hasActiveTrip ? (
          <TripHealthStrip
            reservations={reservations}
            missingPriceCount={missingPriceCount}
            onGapActionTap={onGapActionTap}
            onReviewPricing={onReviewPricing}
          />
        ) : null}

        {hasActiveTrip && onAddGroundTransport ? (
          <button
            type="button"
            onClick={onAddGroundTransport}
            className="flex w-full min-h-[44px] items-center justify-center gap-2 rounded-full border border-dashed border-[var(--border-default)] bg-[var(--bg-card)]/80 px-4 py-2.5 text-[15px] font-medium text-[var(--text-secondary)] transition active:opacity-80"
          >
            <span aria-hidden>🚕</span>
            Add airport, hotel, or venue transfer
          </button>
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
        ) : null}

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
    const atAirport = locationStatus === "at-airport" || locationStatus === "in-terminal";
    const mapPanelHeight = `calc(100dvh - ${MOBILE_TAB_BAR_CLEARANCE} - 5.5rem)`;
    return (
      <div className="kepi-mobile-shell -mx-1 flex flex-col pb-2">
        <div
          className="relative overflow-hidden rounded-[var(--radius-card)] bg-[#dbeafe] ring-1 ring-[var(--border-default)]"
          style={{ height: mapPanelHeight, maxHeight: mapPanelHeight }}
        >
          <TripHomeOverviewMap
            transportReservations={transportReservations}
            hotelReservations={hotelReservations}
            plannedFlightLegs={plannedFlightLegs}
            staySegments={staySegments}
            onReservationTap={onReservationTap}
            preferUserLocation
            className="h-full min-h-0"
          />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center gap-3 px-4 pb-4 pt-16">
            <LiveMapLink
              className="pointer-events-auto min-h-[48px] rounded-full bg-white/95 px-5 py-3 text-[17px] font-bold text-slate-900 shadow-lg ring-1 ring-black/10"
            >
              Family map
            </LiveMapLink>
            {atAirport ? (
              <LiveMapLink
                className="pointer-events-auto min-h-[48px] rounded-full bg-[#007AFF] px-5 py-3 text-[17px] font-bold text-white shadow-lg"
              >
                Airport mode
              </LiveMapLink>
            ) : null}
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => onNavigateTab("home")} className={quickActionBtn}>
            <p className="text-[15px] font-semibold text-[var(--text-muted)]">Leave map</p>
            <p className="mt-1 text-[17px] font-bold text-[var(--text-primary)]">Trip home</p>
          </button>
          <button type="button" onClick={() => onNavigateTab("book")} className={quickActionBtn}>
            <p className="text-[15px] font-semibold text-[var(--text-muted)]">Bookings</p>
            <p className="mt-1 text-[17px] font-bold text-[var(--text-primary)]">Flights & hotels</p>
          </button>
        </div>
      </div>
    );
  }

  if (activeTab === "book") {
    return (
      <div className="kepi-mobile-shell space-y-5 pb-4">
        {hasActiveTrip ? (
          <>
            <MobileBookHeader
              tripName={tripName}
              flightCount={flightCount}
              hotelCount={hotelCount}
              tripSpendSummary={tripSpendSummary}
              problemCount={tripProblemCount}
              onReviewPricing={onReviewPricing}
            />
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
          onAddFlight={onAddFlight}
          onAddHotel={onAddHotel}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          hotelNotebookNote={hotelNotebookNote}
          onHotelNotebookChange={onHotelNotebookChange}
          hideRouteMap
          segment={bookSegment}
          onSegmentChange={setBookSegment}
          hideSegmentToggle={hasActiveTrip}
          enableBookSearch={hasActiveTrip}
          tripId={tripId}
          transportReservations={transportReservations}
          plannedFlightLegs={plannedFlightLegs}
          flightSearchDefaults={flightSearchDefaults}
          hotelSearchDefaults={hotelSearchDefaults}
          staySegments={staySegments}
          plannedStayCities={plannedStayCities}
          usuallySkipsConnections={usuallySkipsConnections}
          onLaunchHotelSearch={onLaunchHotelSearch}
          inlineHotelSearchActive={inlineHotelSearchActive}
          inlineHotelSearchDefaults={inlineHotelSearchDefaults}
          hotelSearchGeneration={hotelSearchGeneration}
          onCloseInlineHotelSearch={onCloseInlineHotelSearch}
          onAddHotelFromSearch={onAddHotelFromSearch}
          mapPreviewCenter={hotelSearchMapPreview}
          onSearchSegment={onSearchSegment}
          onPickPlannedCity={onPickPlannedCity}
          onAddCityStay={onAddCityStay}
          onSetStayIntent={onSetStayIntent}
          pendingForwardReview={pendingForwardReview}
          onOpenForwardReview={onOpenForwardReview}
          onImportConfirmation={onImportConfirmation}
          importConfirmationBusy={importConfirmationBusy}
          travelFitReservations={travelFitReservations}
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
            inlineExpandOnly
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

  if (activeTab === "photos") {
    return (
      <div className="kepi-mobile-shell space-y-5 pb-4">
        <header>
          <h1 className="text-[2rem] font-bold tracking-tight text-[var(--text-primary)]">Photos</h1>
          <p className="mt-1 text-[19px] text-[var(--text-secondary)]">
            Trip memories — upload, view, and share with family.
          </p>
        </header>
        {hasActiveTrip && tripId ? (
          <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] p-4 ring-1 ring-[var(--border-default)]">
            <TripMemoriesPanel
              tripId={tripId}
              tripName={tripName}
              destination={destination}
              startDate={startDate}
              endDate={endDate}
              mode="owner"
              hideTitle
            />
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-[var(--border-default)] px-4 py-10 text-center">
            <p className="text-[19px] font-semibold text-[var(--text-primary)]">No trip selected</p>
            <p className="mt-2 text-[17px] text-[var(--text-secondary)]">
              Create or open a trip on Home to start your photo album.
            </p>
            <button type="button" onClick={() => onNavigateTab("home")} className={`${juicyBtnPrimary} mt-5`}>
              Go to Home
            </button>
          </div>
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

      {hasActiveTrip ? (
        <ShareTripCard tripId={tripId ?? null} tripName={tripName} />
      ) : null}

      <LiveMapLink
        className="flex min-h-[56px] items-center rounded-2xl bg-[var(--bg-card)] px-5 text-[19px] font-bold text-[var(--text-primary)] ring-1 ring-[var(--border-default)]"
      >
        Family map & live location
      </LiveMapLink>

      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]">
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <span className="text-xl">🎯</span>
          <div>
            <p className="text-[19px] font-bold text-[var(--text-primary)]">Travel Fit</p>
            <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">
              Airlines, hotels, and earn paths for your trips
            </p>
          </div>
        </div>
        <div className="space-y-3 px-4 py-4">
          <TravelStyleBadge profile={travelStyleProfile} />
          <TravelFitCard userId={userId} reservations={travelFitReservations} travelStyle={travelStyleProfile} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]">
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <span className="text-xl">💳</span>
          <div>
            <p className="text-[19px] font-bold text-[var(--text-primary)]">Card wallet</p>
            <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">Cards you hold — names only</p>
          </div>
        </div>
        <div className="px-4 py-4">
          <PointsTravelProfileCard />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]">
        <div className="flex items-center gap-3 px-5 py-4">
          <span className="text-xl">✈️</span>
          <div>
            <p className="text-[19px] font-bold text-[var(--text-primary)]">Loyalty wallet</p>
            <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">Miles, points, and status</p>
          </div>
        </div>
        <div className="border-t border-[var(--border-default)] px-4 py-4">
          <LoyaltyWalletSection />
        </div>
      </div>

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
        offlineKitSavedAtLabel={offlineKitSavedAtLabel}
        offlineKitReservationCount={offlineKitReservationCount}
        offlineKitSyncing={offlineKitSyncing}
        onRefreshOfflineKit={onRefreshOfflineKit}
        onSignOut={onSignOut}
      />
    </div>
  );
}
