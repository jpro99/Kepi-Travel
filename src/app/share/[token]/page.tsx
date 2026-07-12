import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ShareAccessGate } from "@/components/share/ShareTripPhotosNav";
import { SharedTripView } from "@/components/share/SharedTripView";
import { maskEmail, resolveShareViewerGate } from "@/lib/travelAssistant/tripShareAccess";
import { getSharedTrip } from "@/lib/travelAssistant/tripShareStore";

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await getSharedTrip(token);

  if (result.status === "invalid" || result.status === "missing-trip") {
    notFound();
  }

  if (result.status === "expired") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0d1117] px-4 text-center text-slate-300">
        <div>
          <p className="text-lg font-bold">This share link has expired.</p>
          <p className="mt-2 text-sm text-slate-500">Ask the trip owner to send a fresh link from Kepi Travel.</p>
        </div>
      </div>
    );
  }

  if (result.status === "revoked") {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#0d1117] px-4 text-center text-slate-300">
        <div>
          <p className="text-lg font-bold">This share link was revoked.</p>
          <p className="mt-2 text-sm text-slate-500">The owner turned off sharing for this trip.</p>
        </div>
      </div>
    );
  }

  const gate = await resolveShareViewerGate(token);
  if (gate.status === "sign-in-required") {
    redirect(`/sign-in?redirect_url=${encodeURIComponent(`/share/${token}`)}`);
  }
  if (gate.status === "email-mismatch") {
    return (
      <ShareAccessGate
        token={token}
        maskedEmail={maskEmail(gate.intendedEmail)}
        mode="email-mismatch"
      />
    );
  }
  if (gate.status === "invalid") {
    notFound();
  }

  return (
    <SharedTripView
      token={token}
      tripName={result.trip.name}
      destination={result.trip.destination}
      startDate={result.trip.startDate}
      endDate={result.trip.endDate}
      reservations={result.trip.reservations}
      options={result.options}
      expiresAt={result.expiresAt}
    />
  );
}
