"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { saveTravelerCapture } from "@/lib/airportNav/travelerCaptureLocal";
import {
  getConfirmedCaptureIata,
  getPersistedCaptureTripId,
  resolveCaptureIata,
  resolveCaptureTripId,
  setConfirmedCaptureIata,
  shouldShowTravelerCapture,
  type CaptureLocationStatus,
} from "@/lib/airportNav/travelerCaptureSession";

export interface AirportTravelerCaptureProps {
  locationStatus: CaptureLocationStatus | string;
  nearestAirport?: string | null;
  plannableIata?: string | null;
  activeTripId?: string | null;
  urlTripId?: string | null;
  reservationId?: string | null;
  userLat?: number | null;
  userLon?: number | null;
  userAccuracyM?: number | null;
}

/**
 * Minimal capture surface — mounted at travel-assistant root so it survives
 * Home / Help / Assist degradation. Traveler-observed STRING only.
 */
export function AirportTravelerCapture({
  locationStatus,
  nearestAirport,
  plannableIata,
  activeTripId,
  urlTripId,
  reservationId,
  userLat,
  userLon,
  userAccuracyM,
}: AirportTravelerCaptureProps) {
  const [open, setOpen] = useState(false);
  const [confirmedIata, setConfirmedIataState] = useState<string | null>(() => getConfirmedCaptureIata());
  const [iataDraft, setIataDraft] = useState("");
  const [gateString, setGateString] = useState("");
  const [note, setNote] = useState("");
  const [pinNote, setPinNote] = useState("");
  const [useGpsMark, setUseGpsMark] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  const captureIata = useMemo(
    () =>
      resolveCaptureIata({
        locationStatus,
        nearestAirport,
        confirmedIata,
        plannableIata,
      }),
    [locationStatus, nearestAirport, confirmedIata, plannableIata],
  );

  const captureTripId = useMemo(
    () =>
      resolveCaptureTripId({
        activeTripId,
        urlTripId,
        persistedTripId: getPersistedCaptureTripId(),
      }),
    [activeTripId, urlTripId],
  );

  const visible = shouldShowTravelerCapture({
    locationStatus,
    confirmedIata: captureIata,
  });

  const needsIataConfirm =
    open &&
    locationStatus !== "at-airport" &&
    locationStatus !== "in-terminal" &&
    !captureIata;

  const hasGps =
    userLat != null &&
    userLon != null &&
    Number.isFinite(userLat) &&
    Number.isFinite(userLon);

  const resetForm = useCallback(() => {
    setGateString("");
    setNote("");
    setPinNote("");
    setUseGpsMark(true);
    setError(null);
    setSavedMessage(null);
    setIataDraft("");
  }, []);

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
      setError("Confirm which airport you are at.");
      return;
    }
    const tripId = captureTripId ?? `local-${iata}`;

    setBusy(true);
    setError(null);
    try {
      const mapMark =
        useGpsMark && hasGps
          ? {
              lat: userLat!,
              lng: userLon!,
              accuracyM: userAccuracyM ?? null,
              pinNote: pinNote.trim() || null,
            }
          : null;

      const { synced } = await saveTravelerCapture({
        tripId,
        reservationId,
        iata,
        gateString,
        note,
        mapMark,
      });

      setSavedMessage(
        synced
          ? "Saved — synced to your trip."
          : "Saved on this device — will sync when you're back online.",
      );
      window.setTimeout(() => handleClose(), 700);
    } catch (captureError) {
      setError(captureError instanceof Error ? captureError.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (open && hasGps) setUseGpsMark(true);
  }, [open, hasGps]);

  if (!visible) return null;

  return (
    <>
      <button
        type="button"
        data-testid="traveler-capture-fab"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
        className="pointer-events-auto fixed z-[200] min-h-[52px] rounded-full bg-amber-400 px-4 text-[14px] font-black text-[#0b1f3a] shadow-xl ring-2 ring-amber-200/80"
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
          data-testid="traveler-capture-sheet"
        >
          <header
            className="flex shrink-0 items-center justify-between border-b border-black/10 px-4 py-3"
            style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
          >
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-700">
                Traveler capture
              </p>
              <p className="mt-0.5 text-[15px] font-semibold">
                {captureIata ? `${captureIata} · you observed` : "Confirm airport"}
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
              What you see on boards and signs — never treated as official airport data.
            </p>

            {needsIataConfirm ? (
              <div className="mt-4 rounded-2xl border border-amber-300/60 bg-amber-50 p-4">
                <label className="block text-[14px] font-semibold">
                  Which airport?
                  <input
                    value={iataDraft}
                    onChange={(e) => setIataDraft(e.target.value.toUpperCase())}
                    placeholder="FCO"
                    maxLength={3}
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-[22px] font-bold tracking-widest outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="traveler-capture-iata"
                  />
                </label>
                <button
                  type="button"
                  onClick={handleConfirmIata}
                  className="mt-3 min-h-[48px] w-full rounded-2xl bg-[#1D1D1F] text-[16px] font-bold text-white"
                >
                  Confirm airport
                </button>
              </div>
            ) : (
              <>
                <label className="mt-4 block text-[14px] font-semibold">
                  Gate STRING (board / sign)
                  <input
                    value={gateString}
                    onChange={(e) => setGateString(e.target.value.toUpperCase())}
                    placeholder="e.g. E12"
                    maxLength={12}
                    className="mt-2 w-full rounded-xl border border-black/15 bg-white px-3 py-3 text-[22px] font-bold outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="traveler-capture-gate"
                  />
                </label>

                <div className="mt-4 rounded-2xl border border-black/10 bg-white p-4">
                  <label className="flex items-start gap-3 text-[14px] font-semibold">
                    <input
                      type="checkbox"
                      checked={useGpsMark && hasGps}
                      disabled={!hasGps}
                      onChange={(e) => setUseGpsMark(e.target.checked)}
                      className="mt-1"
                    />
                    <span>
                      Drop map mark from GPS
                      {hasGps
                        ? ` (${userLat!.toFixed(5)}, ${userLon!.toFixed(5)})`
                        : " — enable location for a coarse pin"}
                    </span>
                  </label>
                  {useGpsMark && hasGps ? (
                    <label className="mt-3 block text-[13px] font-medium text-[#6E6E73]">
                      Pin note (optional)
                      <input
                        value={pinNote}
                        onChange={(e) => setPinNote(e.target.value)}
                        placeholder="Near column C, by the lounge sign…"
                        maxLength={200}
                        className="mt-1 w-full rounded-xl border border-black/15 px-3 py-2.5 text-[16px] outline-none ring-amber-400 focus-visible:ring-2"
                        data-testid="traveler-capture-pin-note"
                      />
                    </label>
                  ) : null}
                </div>

                <label className="mt-4 block text-[14px] font-semibold">
                  Note (optional)
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Overbooked, long line, gate changed on the board…"
                    className="mt-2 w-full resize-none rounded-xl border border-black/15 bg-white px-3 py-3 text-[18px] outline-none ring-amber-400 focus-visible:ring-2"
                    data-testid="traveler-capture-note"
                  />
                </label>

                {!captureTripId ? (
                  <p className="mt-3 text-[14px] font-medium text-amber-800">
                    Trip still loading — saved locally and syncs when Home is back.
                  </p>
                ) : null}
              </>
            )}

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
                data-testid="traveler-capture-save"
                onClick={() => void handleSave()}
                className="min-h-[52px] w-full rounded-2xl bg-amber-400 text-[18px] font-black text-[#0b1f3a] disabled:opacity-60"
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
