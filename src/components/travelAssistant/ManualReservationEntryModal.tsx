"use client";

import { useRef, useState, useMemo } from "react";

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
  onClose: () => void;
  onSave: (value: ManualReservationFormValue) => void;
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

export function ManualReservationEntryModal({
  familyMembers,
  defaultAssignedTo,
  onClose,
  onSave,
}: ManualReservationEntryModalProps) {
  const defaultAssignees = useMemo(
    () => (defaultAssignedTo.length > 0 ? defaultAssignedTo : familyMembers.slice(0, 1).map((m) => m.id)),
    [defaultAssignedTo, familyMembers],
  );

  const [reservationType, setReservationType] = useState<ManualReservationType>("flight");
  const [title, setTitle] = useState("");
  const [provider, setProvider] = useState("");
  const [localDateTime, setLocalDateTime] = useState(localDateTimeDefault());
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleScanFile = async (file: File): Promise<void> => {
    setScanning(true);
    setScanMessage(null);
    setFormError(null);
    try {
      const formData = new FormData();
      formData.append("image", file);
      const response = await fetch("/api/travel-updates?action=ticket-scan", {
        method: "POST",
        body: formData,
        credentials: "include",
        cache: "no-store",
      });
      const payload = (await response.json()) as {
        error?: string;
        draft?: {
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
        };
      };
      if (!response.ok || !payload.draft) {
        setScanMessage(`Scan failed: ${payload.error ?? "unknown error"}`);
        return;
      }
      const d = payload.draft;
      setReservationType(normalizeScanType(d.type));
      if (d.title?.trim()) setTitle(d.title.trim());
      if (d.provider?.trim()) setProvider(d.provider.trim());
      if (d.localTime?.trim()) setLocalDateTime(toDatetimeLocal(d.localTime));
      if (d.location?.trim()) setLocation(d.location.trim());
      if (d.confirmationCode?.trim()) setConfirmationCode(d.confirmationCode.trim());
      if (d.notes?.trim()) setNotes(d.notes.trim());
      if (d.checkOutDate?.trim()) setCheckOutDate(d.checkOutDate.trim());
      if (d.roomType?.trim()) setRoomType(d.roomType.trim());
      if (d.flightNumber?.trim()) setFlightNumber(d.flightNumber.trim());
      setScanMessage("✓ Fields filled from your photo — review and save.");
    } catch {
      setScanMessage("Scan failed — please fill in the fields manually.");
    } finally {
      setScanning(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/60 p-3 backdrop-blur-sm md:items-center">
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        {/* ── Header (fixed, never scrolls away) ── */}
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border-default)] px-4 py-4">
          <div className="min-w-0">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Add reservation</h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Scan a photo to auto-fill, or enter details manually.
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
        <div className="flex-1 overflow-y-auto px-4 py-4">
          {/* Scan button */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.currentTarget.value = "";
              if (file) void handleScanFile(file);
            }}
          />
          <button
            type="button"
            disabled={scanning}
            onClick={() => fileInputRef.current?.click()}
            className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-cyan-400 bg-cyan-50 px-4 py-3 text-sm font-semibold text-cyan-800 transition hover:bg-cyan-100 disabled:cursor-not-allowed disabled:opacity-60 dark:border-cyan-500/50 dark:bg-cyan-500/10 dark:text-cyan-200 dark:hover:bg-cyan-500/20"
          >
            <span className="text-lg">{scanning ? "⏳" : "📷"}</span>
            {scanning ? "Scanning…" : "Scan ticket or screenshot"}
          </button>
          {scanMessage ? (
            <p className={`-mt-2 mb-4 rounded-lg px-3 py-2 text-xs ${scanMessage.startsWith("✓") ? "bg-emerald-50 text-emerald-800 dark:bg-emerald-500/10 dark:text-emerald-200" : "bg-rose-50 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"}`}>
              {scanMessage}
            </p>
          ) : null}

          <form
            className="space-y-3"
            onSubmit={(event) => {
              event.preventDefault();
              const normalizedTitle = title.trim();
              const normalizedProvider = provider.trim();
              const normalizedLocation = location.trim();
              const locationRequired = reservationType !== "flight" && reservationType !== "train";
              if (!normalizedTitle || !normalizedProvider || !localDateTime.trim() || (locationRequired && !normalizedLocation)) {
                setFormError("Title, provider, and date/time are required.");
                return;
              }
              if (assignedTo.length === 0) {
                setFormError("Choose at least one family member.");
                return;
              }
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
            }}
          >
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
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Title / reservation name</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="AA 123 JFK→LAX, Hyatt Tokyo, Nobu dinner…"
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Provider / airline / restaurant</span>
              <input
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Date and time</span>
              <input
                type="datetime-local"
                value={localDateTime}
                onChange={(e) => setLocalDateTime(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base font-medium text-slate-900 placeholder-slate-400 focus:border-cyan-400 focus:outline-none dark:border-slate-600 dark:bg-slate-800 dark:text-white dark:placeholder-slate-500"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-xs font-bold uppercase tracking-wide text-slate-600 dark:text-slate-300">Location / address</span>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
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

            <div className="flex flex-wrap gap-2 pt-1 pb-2">
              <button
                type="submit"
                className="rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-400"
              >
                Save reservation
              </button>
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-semibold dark:border-slate-700"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
