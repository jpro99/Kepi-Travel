"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useUser } from "@clerk/nextjs";
import { resolveHotelBookUrl } from "@/lib/decision/bookingLinks";
import { hotelMapPinStyle, fitScoreRange } from "@/lib/hotels/hotelMapColors";
import type { RankedHotelSearchResult } from "@/lib/hotels/types";

interface HotelDetailSheetProps {
  hotel: RankedHotelSearchResult;
  allHotels: RankedHotelSearchResult[];
  city: string;
  memberHotelPricing?: boolean;
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

  const book = resolveHotelBookUrl({
    propertyName: hotel.name,
    chainName: hotel.chainName,
    destination: city,
    address: hotel.address,
    checkInDate: hotel.checkIn,
    checkOutDate: hotel.checkOut,
    guests: hotel.guests,
    rooms: hotel.rooms,
    quotedPriceUsd: hotel.browseOnly ? undefined : hotel.totalPrice,
    quoteId: hotel.browseOnly ? undefined : hotel.id,
    usePoints,
  });

  const pinStyle = hotelMapPinStyle(hotel, fitScoreRange(allHotels));
  const photos = hotel.photos.filter(Boolean);
  const hasLiveRate = !hotel.browseOnly && hotel.pricePerNight > 0;
  const kepiBookable = Boolean(hotel.kepiBookable && hotel.bookOfferId && hasLiveRate);

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
        setCheckoutError(payload.error ?? "Could not start checkout.");
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
          {photos.length > 0 ? (
            <div className="flex gap-2 overflow-x-auto px-4 py-3">
              {photos.map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={url} src={url} alt="" className="h-36 w-52 shrink-0 rounded-xl object-cover" />
              ))}
            </div>
          ) : (
            <div className="mx-4 mt-3 flex h-28 items-center justify-center rounded-xl bg-slate-100 text-sm text-slate-500 dark:bg-slate-900">
              Photos load when you open the booking site
            </div>
          )}

          <div className="space-y-3 px-4 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="hotel-detail-title" className="text-lg font-black text-slate-900 dark:text-white">
                  {hotel.name}
                </h3>
                {hotel.chainName ? <p className="text-xs text-slate-500">{hotel.chainName}</p> : null}
                {hotel.address ? <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">{hotel.address}</p> : null}
              </div>
              <div className="text-right">
                {hasLiveRate ? (
                  <>
                    <p className="text-xl font-black text-slate-900 dark:text-white">${Math.round(hotel.pricePerNight)}</p>
                    <p className="text-[10px] text-slate-500">/ night · ${Math.round(hotel.totalPrice)} total</p>
                    {memberHotelPricing ? (
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">Member rate</p>
                    ) : hotel.memberTotalPrice ? (
                      <p className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                        Pro: ${Math.round(hotel.memberTotalPrice)} at cost
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-sm font-black text-sky-700 dark:text-sky-300">Check Google</p>
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
                    disabled={checkoutBusy}
                    onClick={() => void startKepiCheckout()}
                    className="rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500 disabled:opacity-60"
                  >
                    {checkoutBusy ? "Preparing…" : `Pay $${Math.round(hotel.totalPrice)} with Stripe →`}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(false)}
                    className="rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-700 dark:border-slate-600 dark:text-slate-200"
                  >
                    Back
                  </button>
                </div>
              </div>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2">
                {kepiBookable ? (
                  <button
                    type="button"
                    onClick={() => setCheckoutOpen(true)}
                    className="flex items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500"
                  >
                    Book with Kepi · ${Math.round(hotel.totalPrice)}
                  </button>
                ) : (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center rounded-xl bg-sky-600 py-3 text-sm font-black text-white hover:bg-sky-500"
                  >
                    {usePoints ? "Book with points on chain site →" : "View rooms & prices →"}
                  </a>
                )}
                {kepiBookable ? (
                  <a
                    href={book.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center rounded-xl border border-slate-300 py-3 text-sm font-bold text-slate-800 dark:border-slate-600 dark:text-slate-100"
                  >
                    Compare on Google →
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
            )}

            {book.bookingComUrl ? (
              <a
                href={book.bookingComUrl}
                target="_blank"
                rel="noopener noreferrer sponsored"
                className="flex w-full items-center justify-center rounded-xl border border-indigo-200 bg-indigo-50 py-2.5 text-sm font-bold text-indigo-900 dark:border-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-100"
              >
                Also compare on Booking.com →
              </a>
            ) : null}

            {kepiBookable && !checkoutOpen ? (
              <button
                type="button"
                onClick={onSaveToTrip}
                disabled={saved}
                className="w-full rounded-xl border border-slate-300 py-2.5 text-sm font-bold text-slate-800 disabled:border-emerald-400 disabled:bg-emerald-50 disabled:text-emerald-800 dark:border-slate-600 dark:text-slate-100"
              >
                {saved ? "Saved to your trip ✓" : "Save to my trip (no payment)"}
              </button>
            ) : null}

            <p className="text-[10px] leading-relaxed text-slate-400">
              {kepiBookable
                ? "Book in Kepi with Stripe — your confirmation is saved to your trip automatically. Google Hotels is still available to compare room types and cancellation rules."
                : hasLiveRate
                  ? "Book on Google Hotels or the hotel chain to see live room types, photos, and cancellation rules. Saving here adds it to your Kepi itinerary."
                  : "Kepi could not fetch a live rate for these dates — Google Hotels shows pricing from many booking sites. Saving here adds the hotel to your itinerary."}
            </p>
          </div>
        </div>
      </div>
    </>,
    document.body,
  );
}
