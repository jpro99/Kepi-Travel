"use client";

import { LiveMapLink } from "@/components/travelAssistant/LiveMapLink";
import { MapTabView } from "@/components/travelAssistant/MapTabView";
import { useMemo, useState } from "react";
import { MissionControlView } from "@/components/travelAssistant/MissionControlView";
import { TripSpendBadge } from "@/components/travelAssistant/TripSpendBadge";
import { resolveNextCheckInHandoff } from "@/lib/travelAssistant/checkInHandoff";
import { MobileItineraryReader } from "@/components/travelAssistant/mobile/MobileItineraryReader";
import { MobilePlanNotebook } from "@/components/travelAssistant/mobile/MobilePlanNotebook";
import { MobileSettingsView } from "@/components/travelAssistant/mobile/MobileSettingsView";
import { TripMemoriesPanel } from "@/components/travelAssistant/TripMemoriesPanel";
import { PointsTravelProfileCard } from "@/components/travelAssistant/PointsTravelProfileCard";
import { PointsMilesLearnPanel } from "@/components/travelAssistant/PointsMilesLearnPanel";
import { ConsumerSectionIcon } from "@/components/travelAssistant/ConsumerSectionIcon";
import { TravelFitCard } from "@/components/travelAssistant/TravelFitCard";
import { TravelStyleBadge } from "@/components/travelAssistant/TravelStyleQuiz";
import { LoyaltyWalletSection } from "@/components/loyalty/LoyaltyWalletSection";
import { ShareTripCard } from "@/components/travelAssistant/ShareTripCard";
import type { TravelStyleProfile } from "@/lib/traveler/types";
import { MobileTripShellHeader } from "@/components/travelAssistant/mobile/MobileTripShellHeader";
import { MobileTripsView } from "@/components/travelAssistant/mobile/MobileTripsView";
import { MobileBookHeader, MobileBookSegmentToggle } from "@/components/travelAssistant/mobile/MobileBookChrome";
import type { MobilePrimaryTab } from "@/components/travelAssistant/mobile/mobileShellTypes";
import type { JourneyPhase } from "@/lib/travelAssistant/journeyPhase";
import type { StopDateRange } from "@/lib/decision/stopDates";
import type { BookSubTab } from "@/lib/travelAssistant/consumerTabs";
import type { FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import type { HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";
import type { TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import type { TripGapNavigationAction } from "@/lib/travelAssistant/gapDetectionService";
import type { ReadinessChecklistItem } from "@/lib/travelAssistant/tripOrchestration";
import type { HotelStayMapReservation } from "@/lib/travelAssistant/tripHotelStayMap";

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
  onStartNewTrip?: () => void;
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
  onSeeProPlans?: () => void;
  emailForwardSetupMessage?: string | null;
  missingPriceCount?: number;
  stayDecisions?: Record<string, "needs_hotel" | "skip">;
  onReviewPricing?: () => void;
  onGapActionTap?: (action: TripGapNavigationAction) => void;
  onSkipPreDepartureNight?: (flightDay: string) => void;
  onSignOut: () => void;
  bookSubTab?: BookSubTab;
  onBookSubTabChange?: (subTab: BookSubTab) => void;
  tripId?: string | null;
  isSharedWithMe?: boolean;
  onOpenShare?: () => void;
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
  onOpenAirportMode?: () => void;
  unresolvedReviewCount?: number;
  onOpenReview?: () => void;
  readinessChecklist?: ReadinessChecklistItem[];
  onOpenReadiness?: () => void;
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
  onStartNewTrip,
  onReservationTap,
  onCheckStatus,
  onDelete,
  onAddBooking,
  onAddFlight,
  onAddHotel,
  onAddGroundTransport: _onAddGroundTransport,
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
  onSeeProPlans,
  emailForwardSetupMessage,
  missingPriceCount = 0,
  stayDecisions,
  onReviewPricing,
  onGapActionTap,
  onSkipPreDepartureNight,
  onSignOut,
  bookSubTab = "flights",
  onBookSubTabChange,
  tripId,
  isSharedWithMe = false,
  onOpenShare,
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
  onOpenAirportMode,
  unresolvedReviewCount = 0,
  onOpenReview,
  readinessChecklist = [],
  onOpenReadiness,
}: MobileMapForwardShellProps) {
  const [planSegment, setPlanSegment] = useState<PlanSegment>("itinerary");
  const [showPointsLearn, setShowPointsLearn] = useState(false);
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

  const tripHeader = hasActiveTrip ? (
    <MobileTripShellHeader
      tripName={tripName}
      destination={destination}
      startDate={startDate}
      endDate={endDate}
    />
  ) : null;

  if (activeTab === "home") {
    return (
      <div className="kepi-mobile-shell kepi-mobile-tab-pad space-y-4">
        <MissionControlView
          tripName={tripName}
          destination={destination}
          startDate={startDate}
          endDate={endDate}
          reservations={reservations}
          stayDecisions={stayDecisions}
          liveStatus={liveStatus}
          hasActiveTrip={hasActiveTrip}
          journeyPhase={journeyPhase}
          locationStatus={locationStatus}
          checkInHandoff={resolveNextCheckInHandoff(reservations)}
          onOpenBook={() => onNavigateTab("book")}
          onOpenPlan={() => onNavigateTab("plan")}
          onOpenAirportMode={() => {
            if (onOpenAirportMode) onOpenAirportMode();
            else onNavigateTab("map");
          }}
          onStartNewTrip={onStartNewTrip ?? onCreateTrip}
          onImportFlights={onTalkPlanner}
          showFreePlanNudge={!hasProAccess && !billingLoading}
          onSeeProPlans={
            onSeeProPlans ??
            (() => {
              onNavigateTab("more");
            })
          }
          missingPriceCount={missingPriceCount}
          pushSubscribed={pushSubscribed}
          pushBusy={pushBusy}
          onEnablePush={onEnablePush}
          onReservationTap={onReservationTap}
          onGapActionTap={onGapActionTap}
          onSeeAllAttention={() => onNavigateTab("plan")}
          unresolvedReviewCount={unresolvedReviewCount}
          onOpenReview={onOpenReview ?? (() => onNavigateTab("plan"))}
          readinessChecklist={readinessChecklist}
          onOpenReadiness={onOpenReadiness}
        />

        {hasActiveTrip && tripSpendSummary ? (
          <TripSpendBadge
            summary={tripSpendSummary}
            problemCount={tripProblemCount}
            onClick={onReviewPricing ?? (() => onNavigateTab("book"))}
            alwaysActionable
            className="w-full"
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
        ) : null}
      </div>
    );
  }

  if (activeTab === "map") {
    return (
      <div className="kepi-mobile-shell kepi-mobile-tab-pad -mx-1 flex flex-col gap-3">
        <MapTabView
          transportReservations={transportReservations}
          hotelReservations={hotelReservations}
          plannedFlightLegs={plannedFlightLegs}
          staySegments={staySegments}
          onReservationTap={onReservationTap}
          locationStatus={locationStatus}
          preferUserLocation
        />
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
      <div className="kepi-mobile-shell kepi-mobile-tab-pad space-y-5">
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
      <div className="kepi-mobile-shell kepi-mobile-tab-pad space-y-5">
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
      <div className="kepi-mobile-shell kepi-mobile-tab-pad space-y-5">
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
    <div className="kepi-mobile-shell kepi-mobile-tab-pad space-y-5">
      {showPointsLearn ? (
        <PointsMilesLearnPanel
          onBack={() => setShowPointsLearn(false)}
          onOpenCardWallet={() => setShowPointsLearn(false)}
        />
      ) : (
        <>
      <header>
        <h1 className="text-[2rem] font-bold tracking-tight text-[var(--text-primary)]">More</h1>
        <p className="mt-1 text-[19px] text-[var(--text-secondary)]">Settings & family</p>
      </header>

      <button
        type="button"
        onClick={() => setShowPointsLearn(true)}
        className="w-full rounded-2xl bg-[var(--bg-card)] px-5 py-4 text-left ring-1 ring-[var(--border-default)]"
      >
        <div className="flex items-center gap-3">
          <ConsumerSectionIcon section="points" tiled />
          <div>
            <p className="text-[19px] font-bold text-[var(--text-primary)]">New to points & miles?</p>
            <p className="mt-1 text-[15px] text-[var(--text-secondary)]">Learn Rakuten, lounges, cards, and how Kepi helps</p>
          </div>
        </div>
      </button>

      {hasActiveTrip ? (
        <ShareTripCard
          tripId={tripId ?? null}
          tripName={tripName}
          isSharedWithMe={isSharedWithMe}
          onOpenShare={onOpenShare}
        />
      ) : null}

      <LiveMapLink
        className="flex min-h-[56px] items-center rounded-2xl bg-[var(--bg-card)] px-5 text-[19px] font-bold text-[var(--text-primary)] ring-1 ring-[var(--border-default)]"
      >
        Family map & live location
      </LiveMapLink>

      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]">
        <div className="flex items-center gap-3 border-b border-[var(--border-default)] px-5 py-4">
          <ConsumerSectionIcon section="fit" tiled />
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
          <ConsumerSectionIcon section="cards" tiled />
          <div>
            <p className="text-[19px] font-bold text-[var(--text-primary)]">Card wallet</p>
            <p className="mt-0.5 text-[15px] text-[var(--text-secondary)]">Cards you hold — names only</p>
          </div>
        </div>
        <div className="px-4 py-4">
          <PointsTravelProfileCard onOpenLearn={() => setShowPointsLearn(true)} />
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl bg-[var(--bg-card)] ring-1 ring-[var(--border-default)]">
        <div className="flex items-center gap-3 px-5 py-4">
          <ConsumerSectionIcon section="loyalty" tiled />
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
        </>
      )}
    </div>
  );
}
