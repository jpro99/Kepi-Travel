import Link from "next/link";
import { MapPin } from "lucide-react";
import { ShareTripPhotosNav } from "@/components/share/ShareTripPhotosNav";
import { SharedTripReservations } from "@/components/share/SharedTripReservations";
import { JoinCollaborateButton } from "@/components/share/JoinCollaborateButton";
import { TripMemoriesPanel } from "@/components/travelAssistant/TripMemoriesPanel";
import type { TripShareOptions } from "@/lib/travelAssistant/tripShareStore";
import {
  appleBody,
  appleBtnText,
  appleCaption,
  appleCard,
  appleMetadata,
  applePageTitle,
} from "@/lib/ui/appleDesign";

interface SharedReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone: string;
  location: string;
  confirmationCode: string;
  checkOutDate?: string;
  roomType?: string;
  hotelPhone?: string;
  notes?: string;
}

interface SharedTripViewProps {
  token: string;
  tripName: string;
  destination: string;
  startDate: string;
  endDate: string;
  reservations: SharedReservation[];
  options: TripShareOptions;
  expiresAt: string;
}

export function SharedTripView({
  token,
  tripName,
  destination,
  startDate,
  endDate,
  reservations,
  options,
  expiresAt,
}: SharedTripViewProps) {
  return (
    <div className="min-h-dvh bg-[#F5F5F7] px-4 py-6 text-[#1D1D1F]">
      <div className="mx-auto max-w-md">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-[10px] bg-[#007AFF] text-sm font-semibold text-white">
              K
            </div>
            <span className={appleMetadata}>Shared via Kepi Travel</span>
          </div>
          <h1 className={`${applePageTitle} mt-2 text-[28px]`}>{tripName}</h1>
          {destination ? (
            <p className={`${appleBody} mt-1 flex items-center gap-1.5 text-[17px] text-[#6E6E73]`}>
              <MapPin className="h-4 w-4 shrink-0" strokeWidth={1.85} aria-hidden />
              {destination}
            </p>
          ) : null}
          <p className={`${appleCaption} mt-2`}>
            {startDate} → {endDate}
            {options.readOnly ? " · View only" : " · Edit together"}
          </p>
          <p className={`${appleCaption} mt-1`}>Link expires {new Date(expiresAt).toLocaleDateString()}</p>
        </header>

        {!options.readOnly ? <JoinCollaborateButton token={token} tripName={tripName} /> : null}

        <ShareTripPhotosNav tripName={tripName} />

        <SharedTripReservations reservations={reservations} />

        <div id="trip-photos" className={`mt-8 scroll-mt-6 p-4 ${appleCard}`}>
          <TripMemoriesPanel
            tripId={null}
            tripName={tripName}
            destination={destination}
            startDate={startDate}
            endDate={endDate}
            shareToken={token}
            mode="viewer"
          />
        </div>

        <p className={`${appleCaption} mt-8 text-center`}>
          Shared via{" "}
          <Link href="https://kepitravel.com" className={appleBtnText}>
            kepitravel.com
          </Link>
          {options.readOnly ? " · view only" : " · paid partners can edit together"}
        </p>
      </div>
    </div>
  );
}
