"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { AirportCaptureMapMark } from "@/lib/airportNav/airportCaptureTypes";
import {
  enqueueAndSyncAirportCapture,
  onAirportCaptureQueueChange,
} from "@/lib/airportNav/airportCaptureQueue";
import { compressCapturePhotoFile } from "@/lib/airportNav/airportCapturePhoto";
import {
  getConfirmedCaptureIata,
  getPersistedCaptureTripId,
  resolveCaptureAirportIata,
  resolveCaptureTripId,
  setConfirmedCaptureIata,
  shouldOfferAirportCapture,
  type CaptureLocationStatus,
} from "@/lib/airportNav/airportCaptureSession";

export interface AirportCaptureModeProps {
  locationStatus: CaptureLocationStatus | string;
  nearestAirport?: string | null;
  plannableIata?: string | null;
  activeTripId?: string | null;
  urlTripId?: string | null;
  supportTripId?: string | null;
  reservationId?: string | null;
  userLat?: number | null;
  userLon?: number | null;
  userAccuracyM?: number | null;
}

export function AirportCaptureMode({
  locationStatus,
  nearestAirport,
  plannableIata,
  activeTripId,
  urlTripId,
  supportTripId,
  reservationId,
  userLat,
  userLon,
  userAccuracyM,
}: AirportCaptureModeProps) {
  const [open, setOpen] = useState(false);
  const [confirmedIata, setConfirmedIataState] = useState<string | null>(() => getConfirmedCaptureIata());
  const [iataDraft, setIataDraft] = useState("");
  const [gateString, setGateString] = useState("");
  const [note, setNote] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);
  const [queueTick, setQueueTick] = useState(0);

  useEffect(() => onAirportCaptureQueueChange(() => setQueueTick((v) => v + 1)), []);

  const captureIata = useMemo(
    () =>
      resolveCaptureAirportIata({
        locationStatus,
        nearestAirport,
        confirmedIata,
        plannableIata,
      }),
    [locationStatus, nearestAirport, confirmedIata, plannableIata, queueTick],
  );

  const captureTripId = useMemo(
    () =>
      resolveCaptureTripId({
        activeTripId,
        urlTripId,
        supportTripId,
        persistedTripId: getPersistedCaptureTripId(),
      }),
    [activeTripId, urlTripId, supportTripId],
  );

  const visible = shouldOfferAirportCapture({
    locationStatus,
    confirmedIata: captureIata,
  });

  const needsIataConfirm =
    open &&
    locationStatus !== "at-airport" &&
    locationStatus !== "in-terminal" &&
    !captureIata;

  const mapMark: AirportCaptureMapMark | null = useMemo(() => {
    if (userLon == null || userLat == null) return null;
    if (!Number.isFinite(userLon) || !Number.isFinite(userLat)) return null;
    return { lng: userLon, lat: userLat, accuracyM: userAccuracyM ?? null };
  }, [userLat, userLon, userAccuracyM]);

  const resetForm = useCallback(() => {
    setGateString("");
    setNote("");
    setPhotoDataUrl(null);
    setError(null);
    setSavedMessage(null);
    setIataDraft("");
  }, []);

  const handleOpen = () => {
    resetForm();
    setOpen(true);
  };

  const handleClose = () => {
    setOpen(false);
    resetForm();
  };

  const handleConfirmIata = () => {
    const code = iataDraft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) {
      setError("Enter a 3-letter airport code (e.g. FCO).");
      return;
    }
    setConfirmedCaptureIata(code);
    setConfirmedIataState(code);
    setError(null);
  };

  const handleSave = async () => {
    const iata = captureIata ?? iataDraft.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(iata)) {
      setError("Confirm which airport you are at first.");
      return;
    }
    const tripId = captureTripId;
    if (!tripId) {
      setError("No trip loaded yet — your capture is saved on this device and will sync when Home loads.");
    }

    setBusy(true);
    setError(null);
    try {
      const { synced } = await enqueueAndSyncAirportCapture({
        tripId: tripId ?? `local-${iata}`,
        reservationId,
        iata,
        gateString,
        note,
        photoDataUrl,
        mapMark,
      });
      setSavedMessage(
        synced
          ? "Saved — queued and synced."
          : "Saved on this device — will sync when you're back online.",
      );
      window.setTimeout(() => handleClose(), 800);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Could not save capture.");
    } finally {
      setBusy(false);
    }
  };

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        data-testid="airport-capture-mode-fab"
        onClick={handleOpen}
        className="pointer-events-auto fixed z-[200] flex min-h-[52px] min-w-[52px] items-center justify-center rounded-full bg-amber-400 px-4 text-[14px] font-black text-[#0b1f3a] shadow-xl ring-2 ring-amber-200/80"
        style={{
          left: "max(1rem, env(safe-area-inset-left, 0px))",
          bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))",
        }}
        aria-label="Capture gate or airport note"
      >
        Capture
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[210] flex flex-col bg-[#f5f0e8] text-[#1D1D1F]"
          style={{ height: "100dvh" }}
          data-testid="airport-capture-mode-sheet"
        >
          <header
            className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                Airport capture
              </p>
              <p className="mt-0.5 text-[15px] font-semibold">
                {captureIata ? `${captureIata} · traveler-observed` : "Confirm your airport"}
              </p>
            </div>
            <button
              type="button"
              onClick={handleClose}
              className="min-h-[44px] rounded-xl border border-black/15 px-3 text-[15px] font-semibold"
            >
              Close
            </button>
          </header>

          <div
            className="flex-1 overflow-y-auto px-4 py-4"
            style={{ WebkitOverflowScrolling: "touch" }}
          >
            <p className="text-[15px] leading-relaxed text-[#6E6E73]">
              Mark what you see on the ground — gate boards, lines, pins. Never treated as official
              airport data.
            </p>

            {needsIataConfirm ? (
              <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
                <label className="block text-[14px] font-semibold text-[#1D1D1F]">
                  Which airport are you at?
                  <input
                    value={iataDraft}
                    onChange={(event) => setIataDraft(event.target.value.toUpperCase())}
                    placeholder="FCO"
                    maxLength={3}
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-[20px] font-bold tracking-widest outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="airport-capture-iata-confirm"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleConfirmIata}
                  className="mt-3 min-h-[48px] w-full rounded-2xl bg-[#1D1D1F] px-4 text-[16px] font-bold text-white"
                >
                  Confirm airport
                </button>
              </div>
            ) : null}

            {!needsIataConfirm ? (
              <>
                <label className="mt-4 block text-[14px] font-semibold text-[#1D1D1F]">
                  Gate you see
                  <input
                    value={gateString}
                    onChange={(event) => setGateString(event.target.value.toUpperCase())}
                    placeholder="e.g. E12"
                    maxLength={12}
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-[22px] font-bold outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="airport-capture-mode-gate"
                  />
                </label>

                <label className="mt-4 block text-[14px] font-semibold text-[#1D1D1F]">
                  Note (optional)
                  <textarea
                    value={note}
                    onChange={(event) => setNote(event.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Overbooked, long security line, etc."
                    className="mt-2 w-full resize-none rounded-xl border border-black/15 bg-white px-3 py-3 text-[18px] outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="airport-capture-mode-note"
                  />
                </label>

                <div className="mt-4">
                  <p className="text-[14px] font-semibold text-[#1D1D1F]">Photo (optional)</p>
                  <input
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="mt-2 w-full text-[15px]"
                    data-testid="airport-capture-mode-photo"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (!file) return;
                      void compressCapturePhotoFile(file).then((dataUrl) => {
                        if (!dataUrl) {
                          setError("Photo too large — try a closer shot.");
                          return;
                        }
                        setPhotoDataUrl(dataUrl);
                        setError(null);
                      });
                    }}
                  />
                  {photoDataUrl ? (
                    <img
                      src={photoDataUrl}
                      alt="Capture preview"
                      className="mt-3 max-h-48 w-full rounded-xl object-cover"
                    />
                  ) : null}
                </div>

                <p className="mt-4 text-[14px] text-[#6E6E73]">
                  {mapMark
                    ? `GPS mark queued (${mapMark.lat.toFixed(5)}, ${mapMark.lng.toFixed(5)}) — we never invent a pin.`
                    : "Enable location to add a GPS map mark automatically."}
                </p>

                {!captureTripId ? (
                  <p className="mt-2 text-[14px] font-medium text-amber-800">
                    Trip still loading — capture saves locally and syncs when Home is back.
                  </p>
                ) : null}
              </>
            ) : null}

            {error ? <p className="mt-3 text-[14px] font-semibold text-rose-600">{error}</p> : null}
            {savedMessage ? (
              <p className="mt-3 text-[14px] font-semibold text-emerald-700">{savedMessage}</p>
            ) : null}
          </div>

          {!needsIataConfirm ? (
            <footer
              className="shrink-0 border-t border-black/10 px-4 py-3"
              style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))" }}
            >
              <button
                type="button"
                disabled={busy}
                data-testid="airport-capture-mode-save"
                onClick={() => void handleSave()}
                className="min-h-[52px] w-full rounded-2xl bg-amber-400 px-4 text-[18px] font-black text-[#0b1f3a] disabled:opacity-60"
              >
                {busy ? "Saving…" : "Save capture"}
              </button>
            </footer>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
