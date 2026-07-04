"use client";

import { useMemo, useState } from "react";
import { ImportConfirmationDropzone } from "@/components/travelAssistant/ImportConfirmationDropzone";
import {
  pickScanDraftForType,
  readTicketScanResponse,
} from "@/lib/travelAssistant/confirmationScanClient";

type ManualReservationType = "flight" | "hotel" | "train" | "car" | "dinner" | "tour" | "experience" | "other";

export interface ManualReservationFormValue {
  reservationType: ManualReservationType;
  title: string;
  provider: string;
  localDateTime: string;
  location: string;
  confirmationCode: string;
  notes: string;
  assignedTo: string[];
  checkOutDate: string;
  roomType: string;
  flightNumber: string;
}

interface FamilyMemberOption {
  id: string;
  name: string;
}

interface ManualReservationEntryModalProps {
  familyMembers: FamilyMemberOption[];
  defaultAssignedTo: string[];
  defaultReservationType?: ManualReservationType;
  defaultLocalDateTime?: string;
  /** When true, type is fixed (e.g. opened from Book → Flights or Hotels). */
  lockReservationType?: boolean;
  onClose: () => void;
  onSave: (value: ManualReservationFormValue) => void;
}

interface ScanDraftPayload {
  type?: string;
  title?: string;
  provider?: string;
  localTime?: string;
  location?: string;
  confirmationCode?: string;
  notes?: string;
  checkOutDate?: string;
  roomType?: string;
  flightNumber?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
}

const RESERVATION_TYPE_OPTIONS: Array<{ value: ManualReservationType; label: string }> = [
  { value: "flight", label: "✈️ Flight" },
  { value: "hotel", label: "🏨 Hotel" },
  { value: "train", label: "🚆 Train" },
  { value: "car", label: "🚗 Car rental / Ride" },
  { value: "dinner", label: "🍽 Dinner" },
  { value: "tour", label: "🗺 Tour" },
  { value: "experience", label: "🎟 Experience" },
  { value: "other", label: "📌 Other" },
];

function localDateTimeDefault(): string {
  const now = new Date(Date.now() + 60 * 60 * 1000);
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hour = String(now.getHours()).padStart(2, "0");
  const minute = String(now.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}T${hour}:${minute}`;
}

function normalizeScanType(raw: string | undefined): ManualReservationType {
  const v = (raw ?? "").toLowerCase();
  if (v === "flight") return "flight";
  if (v === "hotel") return "hotel";
  if (v === "train") return "train";
  if (v === "ride" || v === "car") return "car";
  if (v === "dinner") return "dinner";
  return "other";
}

function toDatetimeLocal(localTime: string): string {
  // localTime is "YYYY-MM-DD HH:mm" — convert to datetime-local "YYYY-MM-DDTHH:mm"
  const trimmed = localTime.trim();
  if (!trimmed) return localDateTimeDefault();
  const withT = trimmed.replace(" ", "T");
  // Validate rough format
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(withT)) {
    return withT.slice(0, 16);
  }
  return localDateTimeDefault();
}

function modalCopy(reservationType: ManualReservationType): { title: string; saveLabel: string } {
  if (reservationType === "flight") {
    return { title: "Add existing flight", saveLabel: "Save flight" };
  }
  if (reservationType === "hotel") {
    return { title: "Add existing hotel", saveLabel: "Save hotel" };
  }
  return { title: "Add reservation", saveLabel: "Save booking" };
}

export function ManualReservationEntryModal({
  familyMembers,
  defaultAssignedTo,
  defaultReservationType = "flight",
  defaultLocalDateTime,
  lockReservationType = false,
  onClose,
  onSave,
}: ManualReservationEntryModalProps) {
  const defaultAssignees = useMemo(
    () => (defaultAssignedTo.length > 0 ? defaultAssignedTo : familyMembers.slice(0, 1).map((m) => m.id)),
    [defaultAssignedTo, familyMembers],
  );

  const [reservationType, setReservationType] = useState<ManualReservationType>(defaultReservationType);
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [localDateTime, setLocalDateTime] = useState(
    () => defaultLocalDateTime ?? localDateTimeDefault(),
  );
  const [location, setLocation] = useState("");
  const [confirmationCode, setConfirmationCode] = useState("");
  const [notes, setNotes] = useState("");
  const [checkOutDate, setCheckOutDate] = useState("");
  const [roomType, setRoomType] = useState("");
  const [flightNumber, setFlightNumber] = useState("");
  const [assignedTo, setAssignedTo] = useState<string[]>(defaultAssignees);
  const [formError, setFormError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMessage, setScanMessage] = useState<string | null>(null);

  const { title: modalTitle, saveLabel } = modalCopy(reservationType);

  const submitForm = (): void => {
    const normalizedTitle = title.trim();
    const normalizedProvider = provider.trim();
    const normalizedLocation = location.trim();
    const locationRequired = reservationType !== "flight" && reservationType !== "train";
    if (!normalizedTitle || !normalizedProvider || !localDateTime.trim() || (locationRequired && !normalizedLocation)) {
      setFormError(
        reservationType === "hotel"
          ? "Hotel name, provider, check-in date/time, and location are required."
          : reservationType === "flight"
            ? "Flight title, airline, and departure date/time are required."
            : "Title, provider, and date/time are required.",
      );
      return;
    }
    if (assignedTo.length === 0) {
      setFormError("Choose at least one family member.");
      return;
    }
    setFormError(null);
    onSave({
      reservationType,
      title: normalizedTitle,
      provider: normalizedProvider,
      localDateTime: localDateTime.trim(),
      location: normalizedLocation,
      confirmationCode: confirmationCode.trim(),
      notes: notes.trim(),
      assignedTo,
      checkOutDate: checkOutDate.trim(),
      roomType: roomType.trim(),
      flightNumber: flightNumber.trim(),
    });
  };

  const handleScanFile = async (file: File): Promise<void> => {
    setScanning(true);
    setScanMessage(null);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch("/api/travel-updates/ticket-scan", {
        method: "POST",
        body: formData,
        credentials: "include",
        cache: "no-store",
      });
      const { ok, payload } = await readTicketScanResponse(response);
      const scannedDrafts =
        payload.drafts && payload.drafts.length > 0
          ? (payload.drafts as ScanDraftPayload[])
          : payload.draft
            ? [payload.draft as ScanDraftPayload]
            : [];
      if (!ok || scannedDrafts.length === 0) {
        setScanMessage(`Scan failed: ${payload.error ?? "unknown error"}`);
        return;
      }
      const preferredType = lockReservationType ? reservationType : undefined;
      const d = pickScanDraftForType(scannedDrafts, preferredType);
      if (!d) {
        setScanMessage("Scan failed: empty result.");
        return;
      }
      if (!lockReservationType) {
        setReservationType(normalizeScanType(d.type));
      }
      if (d.title?.trim()) setTitle(d.title.trim());
      if (d.provider?.trim()) setProvider(d.provider.trim());
      if (d.localTime?.trim()) setLocalDateTime(toDatetimeLocal(d.localTime));
      if (d.location?.trim()) setLocation(d.location.trim());
      if (d.confirmationCode?.trim()) setConfirmationCode(d.confirmationCode.trim());
      if (d.notes?.trim()) setNotes(d.notes.trim());
      if (d.checkOutDate?.trim()) setCheckOutDate(d.checkOutDate.trim());
      if (d.roomType?.trim()) setRoomType(d.roomType.trim());
      if (d.flightNumber?.trim()) setFlightNumber(d.flightNumber.trim());
      setScanMessage(
        scannedDrafts.length > 1
          ? `✓ Found ${scannedDrafts.length} bookings — ${lockReservationType === "hotel" ? "hotel" : "first leg"} filled; review and save.`
          : "✓ Fields filled from your file — review and save.",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      setScanMessage(`Scan failed: ${message}. You can fill in the fields manually.`);
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-0 backdrop-blur-sm sm:p-3 md:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-xl min-h-0 flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900 sm:rounded-2xl">
        {/* ── Header (fixed, never scrolls away) ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-default)] px-4 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">{modalTitle}</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Drop a PDF or screenshot to auto-fill, or enter details and tap Save below.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-md border border-[var(--border-default)] bg-[var(--bg-muted)] px-2 py-1 text-xs font-semibold text-[var(--text-primary)]"
          >
            Close
          </button>
        </div>

        {/* ── Scrollable body ── */}
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain touch-pan-y px-4 py-4">
          <ImportConfirmationDropzone
            busy={scanning}
            compact
            className="mb-4"
            onFile={(file) => void handleScanFile(file)}
          />
          {scanMessage ? (
            <p className={`-mt-2 mb-4 rounded-lg px-3 py-2 text-xs ${scanMessage.startsWith("✓") ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>
              {scanMessage}
            </p>
          ) : null}

          <form
            id="manual-reservation-entry-form"
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              submitForm();
            }}
          >
            {!lockReservationType ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Reservation type</span>
                <select
                  value={reservationType}
                  onChange={(e) => setReservationType(e.target.value as ManualReservationType)}
                  className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                >
                  {RESERVATION_TYPE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {reservationType === "flight" ? "Flight description" : reservationType === "hotel" ? "Hotel name" : "Title / reservation name"}
              </span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={
                  reservationType === "flight"
                    ? "e.g. ONT → FCO · Alaska AS123"
                    : reservationType === "hotel"
                      ? "e.g. Hyatt Centric Monopoli"
                      : "AA 123 JFK→LAX, Nobu dinner…"
                }
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {reservationType === "flight" ? "Airline" : reservationType === "hotel" ? "Hotel brand / booking site" : "Provider / airline / restaurant"}
              </span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {reservationType === "flight"
                  ? "Departure date and time"
                  : reservationType === "hotel"
                    ? "Check-in date and time"
                    : "Date and time"}
              </span>
              <input
                type="datetime-local"
                value={localDateTime}
                onChange={(e) => setLocalDateTime(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                {reservationType === "hotel" ? "City / address" : reservationType === "flight" ? "Route or airport (optional)" : "Location / address"}
              </span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={
                  reservationType === "flight" ? "e.g. ONT → FCO" : reservationType === "hotel" ? "Monopoli, Italy" : ""
                }
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Confirmation code (optional)</span>
              <input
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            {reservationType === "hotel" ? (
              <>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Check-out date</span>
                  <input
                    type="date"
                    value={checkOutDate}
                    onChange={(e) => setCheckOutDate(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </label>
                <label className="block text-sm">
                  <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Room type (optional)</span>
                  <input
                    value={roomType}
                    onChange={(e) => setRoomType(e.target.value)}
                    placeholder="e.g. King, Deluxe, Suite"
                    className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                  />
                </label>
              </>
            ) : null}
            {reservationType === "flight" || reservationType === "train" ? (
              <label className="block text-sm">
                <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">
                  {reservationType === "flight" ? "Flight number" : "Train number"}
                </span>
                <input
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  placeholder={reservationType === "flight" ? "e.g. VI3557" : "e.g. Nozomi 15"}
                  className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
                />
              </label>
            ) : null}
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Notes (optional)</span>
              <textarea
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            {familyMembers.length > 1 ? (
              <fieldset className="rounded-xl border border-slate-200 p-3 dark:border-slate-700">
                <legend className="px-1 text-xs font-semibold text-slate-600 dark:text-slate-300">Assigned to</legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {familyMembers.map((member) => (
                    <label key={member.id} className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm dark:border-slate-700">
                      <input
                        type="checkbox"
                        checked={assignedTo.includes(member.id)}
                        onChange={(e) => {
                          setAssignedTo((prev) =>
                            e.target.checked
                              ? [...new Set([...prev, member.id])]
                              : prev.filter((x) => x !== member.id),
                          );
                        }}
                      />
                      {member.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}

            {formError ? (
              <p className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200">
                {formError}
              </p>
            ) : null}
          </form>
        </div>

        <div className="shrink-0 border-t border-[var(--border-default)] bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] dark:bg-slate-900">
          {formError ? (
            <p className="mb-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200 md:hidden">
              {formError}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              form="manual-reservation-entry-form"
              className="min-h-[52px] flex-1 rounded-xl bg-[#007AFF] px-4 text-base font-bold text-white hover:bg-[#0066DD]"
            >
              {saveLabel}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="min-h-[52px] rounded-xl border border-slate-300 px-4 text-sm font-semibold dark:border-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
