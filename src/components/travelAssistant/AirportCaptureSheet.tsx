"use client";

import { useEffect, useState } from "react";
import type { AirportCaptureMapMark } from "@/lib/airportNav/airportCaptureTypes";
import { enqueueAndSyncAirportCapture } from "@/lib/airportNav/airportCaptureQueue";
import { compressCapturePhotoFile } from "@/lib/airportNav/airportCapturePhoto";

interface AirportCaptureSheetProps {
  open: boolean;
  tripId: string;
  reservationId?: string | null;
  iata: string;
  mapMark?: AirportCaptureMapMark | null;
  onClose: () => void;
  onSaved?: () => void;
}

export function AirportCaptureSheet({
  open,
  tripId,
  reservationId,
  iata,
  mapMark,
  onClose,
  onSaved,
}: AirportCaptureSheetProps) {
  const [gateString, setGateString] = useState("");
  const [note, setNote] = useState("");
  const [photoDataUrl, setPhotoDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSavedMessage(null);
  }, [open]);

  if (!open) return null;

  const hasMapMark = mapMark != null;

  return (
    <section
      className="pointer-events-auto absolute inset-x-2 z-[130] rounded-[24px] border border-amber-300/40 bg-[#0b1f3a]/95 p-4 text-white shadow-2xl backdrop-blur-md sm:inset-x-3"
      style={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom, 0px))" }}
      data-testid="airport-capture-sheet"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-amber-200">
            Capture what you see
          </p>
          <p className="mt-1 text-[13px] text-slate-200">
            Traveler-observed only — never treated as official airport boards.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-white/20 px-2 py-1 text-xs font-semibold text-white"
        >
          Close
        </button>
      </div>

      <label className="mt-3 block text-[12px] font-semibold text-slate-300">
        Gate you see (letters/numbers only)
        <input
          value={gateString}
          onChange={(event) => setGateString(event.target.value.toUpperCase())}
          placeholder="e.g. E12"
          maxLength={12}
          className="mt-1 w-full rounded-xl border border-white/15 bg-white/10 px-3 py-2.5 text-[16px] font-bold text-white outline-none ring-amber-300 focus-visible:ring-2"
          data-testid="airport-capture-gate"
        />
      </label>

      <label className="mt-3 block text-[12px] font-semibold text-slate-300">
        Note (optional)
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={2}
          maxLength={500}
          placeholder="Overbooked, long security line, etc."
          className="mt-1 w-full resize-none rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-[15px] text-white outline-none ring-amber-300 focus-visible:ring-2"
          data-testid="airport-capture-note"
        />
      </label>

      <div className="mt-3">
        <p className="text-[12px] font-semibold text-slate-300">Photo (optional)</p>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          className="mt-1 w-full text-[13px] text-slate-200"
          data-testid="airport-capture-photo"
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
            className="mt-2 max-h-32 w-full rounded-xl object-cover"
          />
        ) : null}
      </div>

      <p className="mt-2 text-[12px] text-slate-300">
        {hasMapMark
          ? "Map mark queued from your tap — we never invent a pin."
          : "Tip: tap I'm here on the map to add your spot."}
      </p>

      {error ? <p className="mt-2 text-[12px] font-semibold text-rose-300">{error}</p> : null}
      {savedMessage ? (
        <p className="mt-2 text-[12px] font-semibold text-emerald-300">{savedMessage}</p>
      ) : null}

      <button
        type="button"
        disabled={busy}
        data-testid="airport-capture-save"
        onClick={() => {
          void (async () => {
            setBusy(true);
            setError(null);
            try {
              const { synced } = await enqueueAndSyncAirportCapture({
                tripId,
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
              onSaved?.();
              window.setTimeout(() => onClose(), 700);
            } catch (captureError) {
              setError(
                captureError instanceof Error
                  ? captureError.message
                  : "Could not save capture.",
              );
            } finally {
              setBusy(false);
            }
          })();
        }}
        className="mt-4 min-h-[48px] w-full rounded-2xl bg-amber-400 px-4 text-[16px] font-black text-[#0b1f3a] disabled:opacity-60"
      >
        {busy ? "Saving…" : "Save capture"}
      </button>
    </section>
  );
}
