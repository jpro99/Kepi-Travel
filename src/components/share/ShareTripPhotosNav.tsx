"use client";

import Link from "next/link";

interface ShareTripPhotosNavProps {
  tripName: string;
}

export function ShareTripPhotosNav({ tripName }: ShareTripPhotosNavProps) {
  const scrollToPhotos = (): void => {
    document.getElementById("trip-photos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className="mb-5 rounded-2xl border border-sky-500/30 bg-gradient-to-br from-sky-500/10 to-[#161b22] p-4">
        <p className="text-sm font-semibold text-sky-200">📸 Trip photos are at the bottom</p>
        <p className="mt-1 text-xs leading-relaxed text-slate-400">
          Scroll down past the itinerary to see {tripName ? `${tripName}'s` : "the"} photos, leave comments, and build your own keepsake collage.
        </p>
        <button
          type="button"
          onClick={scrollToPhotos}
          className="mt-3 min-h-[44px] w-full rounded-xl bg-[#007AFF] px-4 text-sm font-bold text-white hover:bg-[#0066DD]"
        >
          Jump to photos ↓
        </button>
      </div>

      <button
        type="button"
        onClick={scrollToPhotos}
        aria-label="Jump to trip photos"
        className="fixed bottom-5 right-4 z-40 flex min-h-[48px] items-center gap-2 rounded-full border border-sky-400/40 bg-[#0d1117]/95 px-4 py-2 text-sm font-bold text-sky-200 shadow-lg backdrop-blur-sm hover:bg-sky-500/10"
      >
        📸 Photos
      </button>
    </>
  );
}

interface ShareAccessGateProps {
  token: string;
  maskedEmail: string;
  mode: "sign-in" | "email-mismatch";
}

export function ShareAccessGate({ token, maskedEmail, mode }: ShareAccessGateProps) {
  const returnPath = `/share/${encodeURIComponent(token)}`;
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(returnPath)}`;
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(returnPath)}`;

  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#0d1117] px-4 py-8 text-[#e6edf3]">
      <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-[#161b22] p-6 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-sky-500/20 text-xl">
          🔒
        </div>
        <h1 className="text-xl font-black">
          {mode === "sign-in" ? "Sign in to view this trip" : "Wrong account for this invite"}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-400">
          {mode === "sign-in" ? (
            <>
              This trip was shared privately with <strong className="text-slate-200">{maskedEmail}</strong>.
              Sign in with that email to open the itinerary and photos.
            </>
          ) : (
            <>
              This link is locked to <strong className="text-slate-200">{maskedEmail}</strong>.
              Sign out and sign back in with the invited email, or ask the trip owner to send a new invite to your address.
            </>
          )}
        </p>
        <p className="mt-2 text-xs text-slate-500">
          Forwarding the link will not grant access — only {maskedEmail} can open it.
        </p>
        <div className="mt-6 space-y-2">
          <Link
            href={signInHref}
            className="block min-h-[48px] rounded-xl bg-[#007AFF] px-4 py-3 text-sm font-bold text-white hover:bg-[#0066DD]"
          >
            Sign in with {maskedEmail}
          </Link>
          {mode === "email-mismatch" ? (
            <Link
              href={signInHref}
              className="block min-h-[48px] rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Switch account
            </Link>
          ) : (
            <Link
              href={signUpHref}
              className="block min-h-[48px] rounded-xl border border-slate-600 px-4 py-3 text-sm font-semibold text-slate-200 hover:bg-slate-800"
            >
              Create account with {maskedEmail}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
