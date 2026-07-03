"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { resolveHotelBookUrl, resolveHotelPointsBookUrl } from "@/lib/decision/bookingLinks";
import { hotelMapPinStyle, fitScoreRange } from "@/lib/hotels/hotelMapColors";
import type { HotelDetailMedia } from "@/lib/hotels/hotelMedia";
import { extractLiteApiHotelId, mergeHotelDetailMedia } from "@/lib/hotels/hotelMedia";
import type { HotelPayMode } from "@/lib/hotels/hotelPointsDisplay";
import { pointsPerNight } from "@/lib/hotels/hotelPointsDisplay";
import { hasDisplayNightlyRate, hasKepiBookableLiveRate } from "@/lib/hotels/hotelLiveRate";
import { HotelInventoryBadgePill } from "@/components/travelAssistant/HotelInventoryBadgePill";
import { resolveHotelInventoryBadge } from "@/lib/hotels/hotelInventoryBadge";
import { resolveHotelBookingStrategy } from "@/lib/hotels/hotelBookingStrategy";
import { normalizeHotelAvailabilityError } from "@/lib/hotels/hotelAvailabilityError";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";
import { HotelPhotoGallery } from "@/components/travelAssistant/HotelPhotoGallery";
import type { TravelProfile } from "@/app/api/travel-profile/route";
import { hotelCheckInGuidance } from "@/lib/travelAssistant/syncTravelBenefits";

interface HotelDetailSheetProps {
  hotel: RankedHotelSearchResult;
  allHotels: RankedHotelSearchResult[];
  city: string;
  memberHotelPricing?: boolean;
  payMode?: HotelPayMode;
  saved?: boolean;
  usePoints?: boolean;
  onSaveToTrip: () => void;
  onClose: () => void;
}

export function HotelDetailSheet({
  hotel,
  allHotels,
  city,
  memberHotelPricing = false,
  payMode = "any",
  saved = false,
  usePoints = false,
  onSaveToTrip,
  onClose,
}: HotelDetailSheetProps) {
  const { user } = useUser();
  const [mounted, setMounted] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [checkoutBusy, setCheckoutBusy] = useState(false);
  const [checkoutError, setCheckoutError] = useState<string | null>(null);
  const [quoteSoldOut, setQuoteSoldOut] = useState(false);
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [verifiedQuote, setVerifiedQuote] = useState<{
    guestTotalUsd: number;
    netTotalUsd: number;
    isMemberRate: boolean;
    roomName: string | null;
    priceChanged: boolean;
    deltaUsd: number | null;
    cancellation: HotelCancellationSummary | null;
    referenceTotalUsd: number | null;
    referencePriceSource: string | null;
  } | null>(null);
  const [mediaLoading, setMediaLoading] = useState(false);
  const [detailMedia, setDetailMedia] = useState<HotelDetailMedia>(() =>
    mergeHotelDetailMedia(null, hotel.photos.filter(Boolean)),
  );
  const [travelProfile, setTravelProfile] = useState<TravelProfile | null>(null);

  useEffect(() => {
    void fetch("/api/travel-profile", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profile?: TravelProfile } | null) => setTravelProfile(data?.profile ?? null))
      .catch(() => null);
  }, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    setFirstName(user?.firstName ?? "");
    setLastName(user?.lastName ?? "");
    setEmail(user?.primaryEmailAddress?.emailAddress ?? "");
  }, [user?.firstName, user?.lastName, user?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    const liteApiId = extractLiteApiHotelId(hotel.id);
    const fallback = mergeHotelDetailMedia(null, hotel.photos.filter(Boolean));
    setDetailMedia(fallback);

    if (!liteApiId) return;

    let cancelled = false;
    setMediaLoading(true);
    void fetch(`/api/hotels/details?hotelId=${encodeURIComponent(liteApiId)}`, { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) return null;
        return (await res.json()) as HotelDetailMedia;
      })
      .then((payload) => {
        if (cancelled) return;
        setDetailMedia(mergeHotelDetailMedia(payload, hotel.photos.filter(Boolean)));
      })
      .catch(() => {
        if (!cancelled) setDetailMedia(fallback);
      })
      .finally(() => {
        if (!cancelled) setMediaLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [hotel.id, hotel.photos]);

  const book = resolveHotelBookUrl({
    propertyName: hotel.name,
    chainName: hotel.chainName,
    destination: city,
    address: hotel.address,
    checkInDate: hotel.checkIn,
    checkOutDate: hotel.checkOut,
    guests: hotel.guests,
    rooms: hotel.rooms,
    quotedPriceUsd: hotel.referenceTotalUsd ?? (hotel.browseOnly ? undefined : hotel.totalPrice),
    quoteId: hotel.browseOnly ? undefined : hotel.id,
    usePoints,
  });

  const pointsBook = resolveHotelPointsBookUrl({
    propertyName: hotel.name,
    chainName: hotel.chainName,
    programName: hotel.pointsOption?.programName,
    destination: city,
    address: hotel.address,
    checkInDate: hotel.checkIn,
    checkOutDate: hotel.checkOut,
  });

  const pinStyle = hotelMapPinStyle(hotel, fitScoreRange(allHotels));
  const hasLiveRate = hasDisplayNightlyRate(hotel);
  const kepiLiveRate = hasKepiBookableLiveRate(hotel);
  const kepiBookable = Boolean(hotel.kepiBookable && hotel.bookOfferId && kepiLiveRate) && payMode !== "points";
  const inventoryBadge = resolveHotelInventoryBadge(hotel);
  const nightlyPts = pointsPerNight(hotel);
  const pointsMode = payMode === "points";
  const displayCheckoutTotal = verifiedQuote?.guestTotalUsd ?? hotel.totalPrice;
  const cancellationCopy = resolveHotelCancellationCopy({
    cancellable: hotel.cancellable,
    cancellationDeadline: hotel.cancellationDeadline,
    summary: verifiedQuote?.cancellation ?? null,
  });
  const bookingStrategy = resolveHotelBookingStrategy({
    totalPrice: hotel.totalPrice,
    nights: hotel.nights,
    bookOfferId: hotel.bookOfferId,
    browseOnly: hotel.browseOnly,
    referenceTotalUsd: verifiedQuote?.referenceTotalUsd ?? hotel.referenceTotalUsd,
    referencePriceSource: verifiedQuote?.referencePriceSource ?? hotel.referencePriceSource,
    verifiedTotalUsd: verifiedQuote?.guestTotalUsd,
  });

  const fetchVerifiedQuote = async (): Promise<boolean> => {
    if (!hotel.bookOfferId) return false;
    setQuoteLoading(true);
    setCheckoutError(null);
    setQuoteSoldOut(false);
    setVerifiedQuote(null);
    try {
      const response = await fetch("/api/hotels/checkout/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: hotel.bookOfferId,
          searchTotalUsd: hotel.totalPrice,
        }),
      });
      const payload = (await response.json()) as {
        error?: string;
        soldOut?: boolean;
        guestTotalUsd?: number;
        netTotalUsd?: number;
        isMemberRate?: boolean;
        roomName?: string | null;
        priceChanged?: boolean;
        deltaUsd?: number | null;
        cancellation?: HotelCancellationSummary | null;
        referenceTotalUsd?: number | null;
        referencePriceSource?: string | null;
      };
      if (!response.ok || payload.guestTotalUsd === undefined) {
        const message = normalizeHotelAvailabilityError(payload.error);
        setCheckoutError(message);
        setQuoteSoldOut(Boolean(payload.soldOut) || /sold out|no longer available/i.test(message));
        return false;
      }
      setVerifiedQuote({
        guestTotalUsd: payload.guestTotalUsd,
        netTotalUsd: payload.netTotalUsd ?? payload.guestTotalUsd,
        isMemberRate: Boolean(payload.isMemberRate),
        roomName: payload.roomName ?? null,
        priceChanged: Boolean(payload.priceChanged),
        deltaUsd: payload.deltaUsd ?? null,
        cancellation: payload.cancellation ?? null,
        referenceTotalUsd: payload.referenceTotalUsd ?? null,
        referencePriceSource: payload.referencePriceSource ?? null,
      });
      return true;
    } catch {
      setCheckoutError("Connection error — try again.");
      return false;
    } finally {
      setQuoteLoading(false);
    }
  };

  const openKepiCheckout = (): void => {
    void (async () => {
      const ok = await fetchVerifiedQuote();
      if (ok) setCheckoutOpen(true);
    })();
  };
  const hotelChain = hotel.chainName ?? (hotel.name.toLowerCase().includes("hyatt") ? "Hyatt" : "");
  const eliteCheckInTip = hotelChain ? hotelCheckInGuidance(travelProfile, hotelChain) : null;

  const startKepiCheckout = async (): Promise<void> => {
    if (!hotel.bookOfferId) return;
    setCheckoutBusy(true);
    setCheckoutError(null);
    try {
      const response = await fetch("/api/hotels/checkout/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offerId: hotel.bookOfferId,
          hotel: {
            id: hotel.id,
            name: hotel.name,
            chainName: hotel.chainName,
            address: hotel.address,
            city: hotel.city,
            checkIn: hotel.checkIn,
            checkOut: hotel.checkOut,
            guests: hotel.guests,
            rooms: hotel.rooms,
            nights: hotel.nights,
            totalPrice: hotel.totalPrice,
          },
          guest: { firstName, lastName, email, phone: phone || undefined },
        }),
      });
      const payload = (await response.json()) as { error?: string; checkoutUrl?: string };
      if (!response.ok || !payload.checkoutUrl) {
        setCheckoutError(normalizeHotelAvailabilityError(payload.error ?? "Could not start checkout."));
        return;
      }
      window.location.href = payload.checkoutUrl;
    } catch {
      setCheckoutError("Connection error — try again.");
    } finally {
      setCheckoutBusy(false);
    }
  };

  if (!mounted) return null;

  return createPortal(
    <>
      <button
        type="button"
        aria-label="Close hotel details"
        onClick={onClose}
        className="fixed inset-0 z-[95] bg-slate-950/60"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="hotel-detail-title"
        className="fixed inset-x-0 bottom-0 z-[96] mx-auto max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-950 sm:bottom-auto sm:top-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2 dark:border-slate-800">
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Hotel details</p>
          <button type="button" onClick={onClose} className="rounded-lg px-2 py-1 text-slate-400 hover:text-slate-700">
            ✕
          </button>
        </div>

        <div className="max-h-[calc(88vh-2.5rem)] overflow-y-auto">
          <HotelPhotoGallery media={detailMedia} loading={mediaLoading} hotelName={hotel.name} />

          <div className="space-y-3 px-4 pb-4">
            {detailMedia.description ? (
              <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{detailMedia.description}</p>
            ) : null}
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="hotel-detail-title" className="text-lg font-black text-slate-900 dark:text-white">
                  {hotel.name}
                </h3>
                <div className="mt-1">
                  <HotelInventoryBadgePill hotel={hotel} />
                </div>
                <p className="mt-1 text-[11px] text-slate-500">{inventoryBadge.description}</p>
                {hotel.chainName ? <p className="text-xs text-slate-500">{hotel.chainName}</p> : null}
                {eliteCheckInTip ? (
                  <p className="mt-2 rounded-lg border border-indigo-200 bg-indigo-50 px-2.5 py-2 text-xs text-indigo-800 dark:border-indigo-500/30 dark:bg-indigo-500/10 dark:text-indigo-200">
                    🏨 {eliteCheckInTip}
                  </p>
                ) : null}
                {hotel.address ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hotel.address}</p> : null}
              </div>
              <div className="text-right">
                {hasLiveRate ? (
                  <>
                    {pointsMode && nightlyPts ? (
                      <>
                        <p className="text-xl font-black text-violet-700 dark:text-violet-300">{nightlyPts.toLocaleString()}</p>
                        <p className="text-[10px] text-slate-500">pts / night · {hotel.pointsOption?.programName}</p>
                        <p className="text-[10px] font-semibold text-slate-600 dark:text-slate-300">
                          ${Math.round(hotel.pricePerNight)}/night · ${Math.round(hotel.totalPrice)} cash
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="text-xl font-black text-slate-900 dark:text-white">${Math.round(hotel.pricePerNight)}</p>
                        <p className="text-[10px] text-slate-500">
                          / night · ${Math.round(hotel.totalPrice)} total
                          {kepiLiveRate ? " · Kepi live rate" : " · verify before booking"}
                        </p>
                        {hotel.rateRoomName ? (
                          <p className="text-[10px] font-medium text-slate-600 dark:text-slate-300">{hotel.rateRoomName}</p>
                        ) : null}
                        {nightlyPts ? (
                          <p className="text-[10px] font-semibold text-violet-700 dark:text-violet-300">
                            ~{hotel.pointsOption?.milesNeeded.toLocaleString()} {hotel.pointsOption?.programName} pts
                          </p>
                        ) : null}
                      </>
                    )}
                    {memberHotelPricing && !pointsMode ? (
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Member rate</p>
                    ) : hotel.memberTotalPrice && !pointsMode ? (
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Pro: ${Math.round(hotel.memberTotalPrice)} at cost
                      </p>
                    ) : null}
                    {bookingStrategy.compareLine && !pointsMode ? (
                      <p className="mt-1 max-w-[12rem] text-[10px] font-semibold leading-snug text-sky-700 dark:text-sky-300">
                        {bookingStrategy.compareLine}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-sky-700 dark:text-sky-300">Check chain site</p>
                    <p className="text-[10px] text-slate-500">Live rate not in Kepi</p>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
                style={{ backgroundColor: pinStyle.bg }}
              >
                {pinStyle.label}
              </span>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {hotel.rating !== undefined ? `${hotel.rating.toFixed(1)} guest score` : `${hotel.stars}★`}
              </span>
              {hotel.badges.slice(0, 3).map((badge) => (
                <span
                  key={badge}
                  className="rounded-full bg-sky-50 px-2.5 py-1 text-[10px] font-semibold text-sky-800 dark:bg-sky-950 dark:text-sky-200"
                >
                  {badge}
                </span>
              ))}
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-300">{hotel.whyLine}</p>

            {kepiBookable ? (
              <div
                className={`rounded-xl border px-3 py-2.5 text-xs ${
                  cancellationCopy.cancellable
                    ? "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"
                    : "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
                }`}
              >
                <p className="font-bold">{cancellationCopy.label}</p>
                <p className="mt-1 leading-relaxed">{cancellationCopy.detail}</p>
                {!verifiedQuote && kepiBookable ? (
                  <p className="mt-1 text-[10px] opacity-80">Tap Book with Kepi to lock in the verified policy for this rate.</p>
                ) : null}
              </div>
            ) : null}

            {hotel.chainName && hasLiveRate ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                {kepiLiveRate
                  ? "This is Kepi's live checkout rate"
                  : "This is an indicative rate from our search partner"}
                {hotel.rateRoomName ? ` for ${hotel.rateRoomName}` : ""}. Chain sites like{" "}
                {hotel.chainName.split(" ")[0]} may show different room types or member pricing.{" "}
                <a
                  href={book.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-sky-700 underline dark:text-sky-300"
                >
                  Compare on {hotel.chainName.split(" ")[0]} →
                </a>
              </p>
            ) : null}

            {hotel.pointsOption && usePoints ? (
              <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] text-emerald-900 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-100">
                {hotel.pointsOption.reason} — book on the chain site with points prefilled.
              </p>
            ) : null}

            {hotel.amenities.length > 0 ? (
              <p className="text-[11px] text-slate-500">{hotel.amenities.slice(0, 6).join(" · ")}</p>
            ) : null}

            <p className="text-[11px] text-slate-500">
              {hotel.checkIn} → {hotel.checkOut} · {hotel.guests} guest{hotel.guests === 1 ? "" : "s"} · {hotel.rooms}{" "}
              room{hotel.rooms === 1 ? "" : "s"}
            </p>

            {kepiBookable && checkoutOpen ? (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-900 dark:bg-sky-950/40">
                {verifiedQuote ? (
                  <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 dark:border-slate-700 dark:bg-slate-900">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-500">Verified total</p>
                    <p className="mt-1 text-2xl font-black text-slate-900 dark:text-white">
                      ${Math.round(verifiedQuote.guestTotalUsd)}
                    </p>
                    {verifiedQuote.roomName ? (
                      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{verifiedQuote.roomName}</p>
                    ) : null}
                    {verifiedQuote.priceChanged && verifiedQuote.deltaUsd !== null ? (
                      <p
                        className={`mt-2 text-sm font-semibold ${
                          verifiedQuote.deltaUsd > 0 ? "text-amber-700 dark:text-amber-300" : "text-emerald-700 dark:text-emerald-300"
                        }`}
                      >
                        {verifiedQuote.deltaUsd > 0
                          ? `Price updated +$${Math.round(verifiedQuote.deltaUsd)} since search — this is the live rate we'll charge.`
                          : `Price dropped $${Math.abs(Math.round(verifiedQuote.deltaUsd))} — you're getting a better deal.`}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-emerald-700 dark:text-emerald-300">
                        Live rate confirmed — matches search.
                      </p>
                    )}
                    {verifiedQuote.isMemberRate ? (
                      <p className="mt-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300">Member at-cost rate</p>
                    ) : null}
                  </div>
                ) : quoteLoading ? (
                  <p className="text-sm text-slate-600 dark:text-slate-300">Checking live price…</p>
                ) : null}
                <p className="text-xs font-bold text-slate-800 dark:text-slate-100">Guest details for booking</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <input
                    type="text"
                    placeholder="First name"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                  <input
                    type="text"
                    placeholder="Last name"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                  />
                </div>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                <input
                  type="tel"
                  placeholder="Phone (optional)"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-900"
                />
                {checkoutError ? <p className="text-xs text-red-600">{checkoutError}</p> : null}
                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    disabled={checkoutBusy || quoteLoading || !verifiedQuote}
                    onClick={() => void startKepiCheckout()}
                    className="rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500 disabled:opacity-60"
                  >
                    {checkoutBusy
                      ? "Preparing…"
                      : quoteLoading
                        ? "Verifying price…"
                        : `Pay $${Math.round(displayCheckoutTotal)} with Stripe →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCheckoutOpen(false);
                      setVerifiedQuote(null);
                    }}
                    className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {pointsMode || (payMode === "any" && nightlyPts && !kepiBookable) ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <a
                      href={pointsBook.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center rounded-xl bg-violet-700 py-3 text-sm font-black text-white hover:bg-violet-600"
                    >
                      {pointsBook.label}
                    </a>
                    {hasLiveRate ? (
                      <a
                        href={book.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100"
                      >
                        ${Math.round(hotel.totalPrice)} cash on Google →
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={onSaveToTrip}
                        disabled={saved}
                        className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 disabled:border-emerald-400 disabled:bg-emerald-50 disabled:text-emerald-800 dark:border-slate-600 dark:text-slate-100"
                      >
                        {saved ? "Saved to your trip ✓" : "Save to my trip"}
                      </button>
                    )}
                  </div>
                ) : kepiBookable && bookingStrategy.preferExternal ? (
                  <div className="space-y-2">
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex w-full items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500"
                    >
                      {bookingStrategy.googlePrimaryLabel}
                    </a>
                    <button
                      type="button"
                      disabled={quoteLoading}
                      onClick={openKepiCheckout}
                      className="flex w-full items-center justify-center rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-100 dark:hover:bg-slate-900"
                    >
                      {quoteLoading ? "Checking Kepi price…" : bookingStrategy.kepiSecondaryLabel}
                    </button>
                    {nightlyPts ? (
                      <a
                        href={pointsBook.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center justify-center rounded-xl border border-violet-300 py-2.5 text-sm font-bold text-violet-900 dark:border-violet-800 dark:text-violet-100"
                      >
                        {`Redeem ~${nightlyPts.toLocaleString()} pts/night ↗`}
                      </a>
                    ) : null}
                  </div>
                ) : kepiBookable ? (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      disabled={quoteLoading}
                      onClick={openKepiCheckout}
                      className="flex items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500 disabled:opacity-60"
                    >
                      {quoteLoading ? "Checking price…" : `Book with Kepi · $${Math.round(bookingStrategy.kepiTotalUsd)}`}
                    </button>
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100"
                    >
                      Compare on Google ↗
                    </a>
                  </div>
                ) : (
                  <div className="grid gap-2 sm:grid-cols-2">
                    <a
                      href={book.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500"
                    >
                      {book.label}
                    </a>
                    <button
                      type="button"
                      onClick={onSaveToTrip}
                      disabled={saved}
                      className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 disabled:border-emerald-400 disabled:bg-emerald-50 disabled:text-emerald-800 dark:border-slate-600 dark:text-slate-100"
                    >
                      {saved ? "Saved to your trip ✓" : "Save to my trip"}
                    </button>
                  </div>
                )}

                {checkoutError && !checkoutOpen ? (
                  <div
                    className={`rounded-xl border px-3 py-3 text-sm ${
                      quoteSoldOut
                        ? "border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100"
                        : "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100"
                    }`}
                    role="alert"
                  >
                    <p className="font-semibold">{quoteSoldOut ? "Not available in Kepi" : "Could not start booking"}</p>
                    <p className="mt-1">{checkoutError}</p>
                    {quoteSoldOut ? (
                      <a
                        href={book.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 inline-flex text-sm font-bold underline"
                      >
                        Check Google Hotels →
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}

            {book.bookingComUrl ? (
              <a
                href={book.bookingComUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
              >
                {bookingStrategy.preferExternal ? "Also compare on Booking.com →" : "Compare on Booking.com →"}
              </a>
            ) : null}

            {!checkoutOpen ? (
              <button
                type="button"
                onClick={onSaveToTrip}
                disabled={saved}
                className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-800 disabled:border-emerald-400 disabled:bg-emerald-50 disabled:text-emerald-800 dark:border-slate-600 dark:text-slate-100"
              >
                {saved ? "Saved to your trip ✓" : kepiBookable ? "Save to trip (planning only)" : "Save to my trip (no payment)"}
              </button>
            ) : null}

            <p className="text-[10px] leading-relaxed text-slate-400">
              {pointsMode
                ? "Point estimates use your loyalty wallet and typical cents-per-point values. Redeem on the hotel chain site for full elite benefits — Kepi cash checkout does not earn chain points."
                : bookingStrategy.preferExternal
                  ? "Book on Google or Booking.com for the best price, then forward your confirmation email to Kepi — your stay appears on the timeline with check-in guidance and alerts."
                  : kepiBookable
                    ? "Kepi’s live rate is competitive — you can checkout here or still compare on Google. Forward confirmations either way so we can track your trip."
                    : hasLiveRate
                      ? "Book on the hotel chain or Google for live room types and loyalty credit. Forward confirmation so Kepi can track your stay."
                      : "Kepi could not fetch a live rate for these dates — open Google Hotels for pricing, then forward your confirmation."}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
