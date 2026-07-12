import Link from "next/link";
import { ShareTripPhotosNav } from "@/components/share/ShareTripPhotosNav";
import { SharedTripReservations } from "@/components/share/SharedTripReservations";
import { JoinCollaborateButton } from "@/components/share/JoinCollaborateButton";
import { TripMemoriesPanel } from "@/components/travelAssistant/TripMemoriesPanel";
import type { TripShareOptions } from "@/lib/travelAssistant/tripShareStore";

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
    <div className="min-h-dvh bg-[#0d1117] px-4 py-6 text-[#e6edf3]">
      <div className="mx-auto max-w-md">
        <header className="mb-6">
          <div className="mb-1 flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400 text-sm font-black text-[#0d1117]">
              K
            </div>
            <span className="text-sm text-slate-400">Shared via Kepi Travel</span>
          </div>
          <h1 className="mt-2 text-3xl font-black">{tripName}</h1>
          {destination ? <p className="mt-1 text-base text-slate-400">📍 {destination}</p> : null}
          <p className="mt-2 text-xs text-slate-500">
            {startDate} → {endDate}
            {options.readOnly ? " · View only" : " · Edit together"}
          </p>
          <p className="mt-1 text-xs text-slate-600">Link expires {new Date(expiresAt).toLocaleDateString()}</p>
        </header>

        {!options.readOnly ? <JoinCollaborateButton token={token} tripName={tripName} /> : null}

        <ShareTripPhotosNav tripName={tripName} />

        <SharedTripReservations reservations={reservations} />

        <div
          id="trip-photos"
          className="mt-8 scroll-mt-6 rounded-2xl border border-slate-700 bg-[#161b22] p-4 text-slate-100 [&_h2]:text-white [&_p]:text-slate-300 [&_textarea]:bg-[#0d1117] [&_textarea]:text-slate-100 [&_input]:bg-[#0d1117] [&_input]:text-slate-100"
        >
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

        <p className="mt-8 text-center text-sm text-slate-600">
          Shared via{" "}
          <Link href="https://kepitravel.com" className="text-sky-400 hover:underline">
            kepitravel.com
          </Link>
          {options.readOnly ? " · view only" : " · paid partners can edit together"}
        </p>
      </div>
    </div>
  );
}
