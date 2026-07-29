"use client";

import { useTranslations } from "next-intl";
import type { BookSubTab } from "@/lib/travelAssistant/consumerTabs";
import { bookSubTabButtonClass, BOOK_SUBTAB_TOGGLE_CLASS } from "@/components/travelAssistant/bookTabStyles";
import { TripSpendBadge } from "@/components/travelAssistant/TripSpendBadge";
import type { TripSpendSummary } from "@/lib/travelAssistant/tripSpendSummary";
import { FlightsTab } from "@/components/travelAssistant/FlightsTab";
import { HotelsTab } from "@/components/travelAssistant/HotelsTab";
import type { FlightSearchDefaults } from "@/components/travelAssistant/FlightSearchLauncher";
import type { HotelSearchDefaults } from "@/components/travelAssistant/HotelSearchLauncher";
import type { PlannedFlightLeg, PlannedStayCity } from "@/lib/travelAssistant/tripPlanBooking";
import type { InterCityTransportGap } from "@/lib/travelAssistant/interCityTransport";
import type { QuickGroundMode } from "@/lib/travelAssistant/quickGroundTransport";
import type { TransportRouteReservation } from "@/lib/travelAssistant/tripTransportRoute";
import type { ItinerarySelfCheckResult } from "@/lib/travelAssistant/itinerarySelfCheck";
import type { TripStaySegment } from "@/lib/hotels/deriveTripStaySegments";

interface BookReservation {
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
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightStatus?: string;
  flightSeatNumber?: string;
  roomType?: string;
  checkOutDate?: string;
  plannedOnly?: boolean;
  quotedPriceUsd?: number;
  quotedPointsMiles?: number;
  quotedMilesEarned?: number;
  pointsProgram?: string;
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

interface BookTabViewProps {
  bookSubTab: BookSubTab;
  onBookSubTabChange: (subTab: BookSubTab) => void;
  reservations: BookReservation[];
  mapReservations: BookReservation[];
  transportReservations?: TransportRouteReservation[];
  plannedFlightLegs?: PlannedFlightLeg[];
  itinerarySelfCheck?: ItinerarySelfCheckResult;
  transportConflictIds?: Set<string>;
  tripName?: string | null;
  tripId?: string | null;
  flightSearchDefaults?: FlightSearchDefaults;
  pendingForwardReview?: { id: string; reason: string; subject?: string } | null;
  onOpenForwardReview?: (reviewId: string) => void;
  onImportConfirmation?: (file: File) => void;
  importConfirmationBusy?: boolean;
  liveStatus?: Record<string, LiveStatusResult>;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
  onReservationTap: (id: string) => void;
  onCheckStatus: (id: string) => void;
  onDelete: (id: string) => void;
  onAddFlight: () => void;
  onAddHotel: () => void;
  onQuickGroundTransport?: (gap: InterCityTransportGap, mode: QuickGroundMode) => void;
  usuallySkipsConnections?: boolean;
  staySegments?: TripStaySegment[];
  plannedStayCities?: PlannedStayCity[];
  onPickPlannedCity?: (city: PlannedStayCity) => void;
  hotelSearchDefaults?: HotelSearchDefaults;
  onLaunchHotelSearch?: (params: { city: string; cityIata?: string; checkIn: string; checkOut: string }) => void;
  onSearchHotels?: () => void;
  inlineHotelSearchActive?: boolean;
  inlineHotelSearchDefaults?: HotelSearchDefaults;
  hotelSearchGeneration?: number;
  onCloseInlineHotelSearch?: () => void;
  onAddHotelFromSearch?: (hotel: import("@/lib/hotels/types").HotelSearchResult) => void;
  hotelSearchMapPreview?: { city: string; lat: number; lng: number } | null;
  onSearchSegment?: (segment: TripStaySegment) => void;
  onAddCityStay?: (input: { city: string; checkIn: string; checkOut: string }) => void;
  onSetStayIntent?: (
    segment: TripStaySegment,
    intent: "needs_hotel" | "skip",
  ) => void | Promise<void>;
  travelFitReservations?: BookReservation[];
  flightCount?: number;
  hotelCount?: number;
  tripSpendSummary?: TripSpendSummary;
  tripProblemCount?: number;
  onReviewPricing?: () => void;
}

export function BookTabView({
  bookSubTab,
  onBookSubTabChange,
  reservations,
  mapReservations,
  transportReservations,
  plannedFlightLegs,
  itinerarySelfCheck,
  transportConflictIds,
  tripName,
  tripId,
  flightSearchDefaults,
  pendingForwardReview,
  onOpenForwardReview,
  onImportConfirmation,
  importConfirmationBusy,
  liveStatus,
  locationStatus,
  nearestAirport,
  onReservationTap,
  onCheckStatus,
  onDelete,
  onAddFlight,
  onAddHotel,
  onQuickGroundTransport,
  usuallySkipsConnections,
  staySegments,
  plannedStayCities,
  onPickPlannedCity,
  hotelSearchDefaults,
  onLaunchHotelSearch,
  onSearchHotels,
  inlineHotelSearchActive,
  inlineHotelSearchDefaults,
  hotelSearchGeneration,
  onCloseInlineHotelSearch,
  onAddHotelFromSearch,
  hotelSearchMapPreview,
  onSearchSegment,
  onAddCityStay,
  onSetStayIntent,
  travelFitReservations,
  flightCount = 0,
  hotelCount = 0,
  tripSpendSummary,
  tripProblemCount = 0,
  onReviewPricing,
}: BookTabViewProps) {
  const t = useTranslations("BookTab");
  const tTrip = useTranslations("TravelAssistant");
  const showSpend =
    Boolean(tripSpendSummary) &&
    ((tripSpendSummary?.missingPriceCount ?? 0) > 0 || tripProblemCount > 0);

  return (
    <section
      className="space-y-3"
      style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' }}
    >
      {/* I36 — list-first Book: light header, spend only when something needs action. */}
      <header className="rounded-2xl bg-[#F5F5F7] px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.06em] text-[#6E6E73]">
              {t("headerEyebrow")}
            </p>
            <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-[#1D1D1F]">
              {tripName ?? tTrip("defaultTripName")}
            </h1>
            <p className="mt-1 text-[15px] text-[#6E6E73]">
              {t("bookingCounts", { flights: flightCount, hotels: hotelCount })}
            </p>
          </div>
          {showSpend && tripSpendSummary ? (
            <TripSpendBadge
              summary={tripSpendSummary}
              problemCount={tripProblemCount}
              onClick={onReviewPricing}
            />
          ) : null}
        </div>
      </header>

      <div className={BOOK_SUBTAB_TOGGLE_CLASS}>
        <button
          type="button"
          onClick={() => onBookSubTabChange("flights")}
          className={bookSubTabButtonClass(bookSubTab === "flights")}
        >
          {t("subTabFlights")}
        </button>
        <button
          type="button"
          onClick={() => onBookSubTabChange("hotels")}
          className={bookSubTabButtonClass(bookSubTab === "hotels")}
        >
          {t("subTabHotels")}
        </button>
      </div>

      {bookSubTab === "flights" ? (
        <FlightsTab
          reservations={reservations.filter((reservation) => reservation.type === "flight")}
          transportReservations={transportReservations}
          plannedFlightLegs={plannedFlightLegs}
          itinerarySelfCheck={itinerarySelfCheck}
          transportConflictIds={transportConflictIds}
          tripName={tripName}
          flightSearchDefaults={flightSearchDefaults}
          pendingForwardReview={pendingForwardReview}
          onOpenForwardReview={onOpenForwardReview}
          onImportConfirmation={onImportConfirmation}
          importConfirmationBusy={importConfirmationBusy}
          liveStatus={liveStatus}
          locationStatus={locationStatus}
          nearestAirport={nearestAirport}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddFlight}
          onQuickGroundTransport={onQuickGroundTransport}
        />
      ) : (
        <HotelsTab
          reservations={reservations.filter((reservation) => reservation.type === "hotel")}
          mapReservations={mapReservations.filter((reservation) => reservation.type === "hotel")}
          tripName={tripName}
          tripId={tripId}
          usuallySkipsConnections={usuallySkipsConnections}
          staySegments={staySegments}
          plannedStayCities={plannedStayCities}
          onPickPlannedCity={onPickPlannedCity}
          onReservationTap={onReservationTap}
          onCheckStatus={onCheckStatus}
          onDelete={onDelete}
          onAdd={onAddHotel}
          hotelSearchDefaults={hotelSearchDefaults}
          onLaunchHotelSearch={onLaunchHotelSearch}
          onSearchHotels={onSearchHotels}
          inlineHotelSearchActive={inlineHotelSearchActive}
          inlineHotelSearchDefaults={inlineHotelSearchDefaults}
          hotelSearchGeneration={hotelSearchGeneration}
          onCloseInlineHotelSearch={onCloseInlineHotelSearch}
          onAddHotelFromSearch={onAddHotelFromSearch}
          mapPreviewCenter={hotelSearchMapPreview}
          onSearchSegment={onSearchSegment}
          onAddCityStay={onAddCityStay}
          onSetStayIntent={onSetStayIntent}
          travelFitReservations={travelFitReservations}
        />
      )}
    </section>
  );
}
