"use client";

import Link from "next/link";
import { Camera, Lock } from "lucide-react";
import {
  appleBody,
  appleBtnPrimary,
  appleBtnSecondary,
  appleCaption,
  appleCard,
  appleCardTitle,
  appleMetadata,
} from "@/lib/ui/appleDesign";

interface ShareTripPhotosNavProps {
  tripName: string;
}

export function ShareTripPhotosNav({ tripName }: ShareTripPhotosNavProps) {
  const scrollToPhotos = (): void => {
    document.getElementById("trip-photos")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <>
      <div className={`mb-5 p-4 ${appleCard}`}>
        <p className={`${appleCardTitle} flex items-center gap-2`}>
          <Camera className="h-5 w-5" strokeWidth={1.85} aria-hidden />
          Trip photos are at the bottom
        </p>
        <p className={`${appleMetadata} mt-1`}>
          Scroll down past the itinerary to see {tripName ? `${tripName}'s` : "the"} photos, leave comments, and build your own keepsake collage.
        </p>
        <button
          type="button"
          onClick={scrollToPhotos}
          className={`mt-3 min-h-[48px] w-full ${appleBtnPrimary}`}
        >
          Jump to photos
        </button>
      </div>

      <button
        type="button"
        onClick={scrollToPhotos}
        aria-label="Jump to trip photos"
        className="fixed bottom-5 right-4 z-40 flex min-h-[48px] items-center gap-2 rounded-full bg-white px-4 py-2 text-[15px] font-semibold text-[#007AFF] shadow-lg ring-1 ring-black/[0.08]"
      >
        <Camera className="h-4 w-4" strokeWidth={1.85} aria-hidden />
        Photos
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
    <div className="flex min-h-dvh items-center justify-center bg-[#F5F5F7] px-4 py-8 text-[#1D1D1F]">
      <div className={`w-full max-w-md p-6 text-center ${appleCard}`}>
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-[10px] bg-[#F5F5F7] text-[#007AFF]">
          <Lock className="h-6 w-6" strokeWidth={1.85} aria-hidden />
        </div>
        <h1 className="text-[22px] font-semibold">
          {mode === "sign-in" ? "Sign in to view this trip" : "Wrong account for this invite"}
        </h1>
        <p className={`${appleBody} mt-3 text-[15px] text-[#6E6E73]`}>
          {mode === "sign-in" ? (
            <>
              This trip was shared privately with <strong className="text-[#1D1D1F]">{maskedEmail}</strong>.
              Sign in with that email to open the itinerary and photos.
            </>
          ) : (
            <>
              This link is locked to <strong className="text-[#1D1D1F]">{maskedEmail}</strong>.
              Sign out and sign back in with the invited email, or ask the trip owner to send a new invite to your address.
            </>
          )}
        </p>
        <p className={`${appleCaption} mt-2`}>
          Forwarding the link will not grant access — only {maskedEmail} can open it.
        </p>
        <div className="mt-6 space-y-2">
          <Link
            href={signInHref}
            className={`flex min-h-[48px] items-center justify-center ${appleBtnPrimary}`}
          >
            Sign in with {maskedEmail}
          </Link>
          {mode === "email-mismatch" ? (
            <Link
              href={signInHref}
              className={`flex min-h-[48px] items-center justify-center ${appleBtnSecondary}`}
            >
              Switch account
            </Link>
          ) : (
            <Link
              href={signUpHref}
              className={`flex min-h-[48px] items-center justify-center ${appleBtnSecondary}`}
            >
              Create account with {maskedEmail}
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
