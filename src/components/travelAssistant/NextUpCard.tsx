"use client";

import { useState, useEffect, useCallback } from "react";

interface NextUpReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  location: string;
  confirmationCode: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDate?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  checkOutDate?: string;
}

interface NextUpCardProps {
  reservations: NextUpReservation[];
  tripName: string;
  onReservationTap?: (id: string) => void;
}

type GuidanceState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; text: string; urgency: "critical" | "warning" | "normal"; proactive_flag?: string; action?: string }
  | { status: "error" };

// ── helpers ──────────────────────────────────────────────────────────────────

function parseMs(localTime: string): number {
  if (!localTime) return Number.NaN;
  // "YYYY-MM-DD HH:mm" or "YYYY-MM-DDTHH:mm"
  const normalised = localTime.trim().replace("T", " ").slice(0, 16);
  const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(normalised);
  if (!match) return Number.NaN;
  return new Date(
    Number(match[1]), Number(match[2]) - 1, Number(match[3]),
    Number(match[4]), Number(match[5]),
  ).getTime();
}

function hoursUntil(localTime: string): number {
  const ms = parseMs(localTime);
  if (Number.isNaN(ms)) return Infinity;
  return (ms - Date.now()) / 3_600_000;
}

function formatRelative(localTime: string): string {
  const h = hoursUntil(localTime);
  if (h < 0) return "now";
  if (h < 1) return `${Math.round(h * 60)} min`;
  if (h < 24) return `${Math.round(h)} hr`;
  const days = Math.round(h / 24);
  return `${days} day${days === 1 ? "" : "s"}`;
}

function formatTime(localTime: string): string {
  const match = /(\d{2}):(\d{2})/.exec(localTime);
  if (!match) return "";
  let h = Number(match[1]);
  const m = match[2];
  const ampm = h >= 12 ? "PM" : "AM";
  if (h > 12) h -= 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${ampm}`;
}

function typeEmoji(type: string): string {
  const map: Record<string, string> = {
    flight: "✈️", hotel: "🏨", dinner: "🍽", train: "🚆", ride: "🚗",
  };
  return map[type] ?? "📌";
}

// Build a compact summary of all upcoming reservations to pass to Claude
const EMAIL_PROVIDER_NAMES = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol", "me"]);

function buildContextBlock(reservations: NextUpReservation[]): string {
  const upcoming = reservations
    .filter((r) => (parseBestMs(r) - Date.now()) / 3_600_000 > -2)
    .sort((a, b) => parseBestMs(a) - parseBestMs(b))
    .slice(0, 8);

  if (upcoming.length === 0) return "No upcoming reservations.";

  return upcoming.map((r) => {
    const resolvedProvider = r.provider && !EMAIL_PROVIDER_NAMES.has(r.provider.toLowerCase())
      ? r.provider : null;
    const parts = [
      `type=${r.type}`,
      resolvedProvider ? `provider="${resolvedProvider}"` : null,
      r.flightNumber ? `flightNumber=${r.flightNumber}` : null,
      // Use actual flight departure time if available, otherwise localTime
      r.type === "flight" && (r as NextUpReservation & { flightDepartureTime?: string }).flightDepartureTime
        ? `departureTime="${(r as NextUpReservation & { flightDepartureTime?: string }).flightDepartureTime}"`
        : r.localTime ? `time="${r.localTime}"` : null,
      r.flightDepartureAirport && r.flightArrivalAirport
        ? `route=${r.flightDepartureAirport}→${r.flightArrivalAirport}` : null,
      r.location ? `location="${r.location}"` : null,
      r.confirmationCode ? `conf=${r.confirmationCode}` : null,
      r.checkOutDate ? `hotelCheckout=${r.checkOutDate}` : null,
    ].filter(Boolean);
    return `[${parts.join(" ")}]`;
  }).join("\n");
}

// ── component ─────────────────────────────────────────────────────────────────

export function NextUpCard({ reservations, tripName, onReservationTap }: NextUpCardProps) {
  const [guidance, setGuidance] = useState<GuidanceState>({ status: "idle" });
  const [lastFetchKey, setLastFetchKey] = useState("");

  // Find the single most urgent upcoming reservation
  const nextReservation = reservations
    .filter((r) => (parseBestMs(r) - Date.now()) / 3_600_000 > -2)
    .sort((a, b) => parseBestMs(a) - parseBestMs(b))[0] ?? null;

  const fetchGuidance = useCallback(async () => {
    if (reservations.filter((r) => (parseBestMs(r) - Date.now()) / 3_600_000 > -2).length === 0) return;
    setGuidance({ status: "loading" });
    const contextBlock = buildContextBlock(reservations);

    try {
      const nowIso = new Date().toISOString();
      const res = await fetch("/api/trip-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tripName,
          nowIso,
          reservationContext: contextBlock,
        }),
      });

      if (!res.ok) {
        setGuidance({ status: "error" });
        return;
      }

      const data = (await res.json()) as {
        urgency?: string;
        headline?: string;
        detail?: string;
        error?: string;
      };

      if (data.error) {
        setGuidance({ status: "error" });
        return;
      }

      setGuidance({
        status: "done",
        text: `**${data.headline ?? ""}**
${data.detail ?? ""}`,
        urgency: (data.urgency === "critical" || data.urgency === "warning")
          ? data.urgency : "normal",
        proactive_flag: typeof data.proactive_flag === "string" ? data.proactive_flag : "",
        action: typeof data.action === "string" ? data.action : "",
      });
    } catch {
      setGuidance({ status: "error" });
    }
  }, [reservations, tripName]);

  // Auto-fetch when the next reservation changes (by id + hour bucket)
  useEffect(() => {
    if (!nextReservation) return;
    const hourBucket = Math.floor(Date.now() / 3_600_000);
    const key = `${nextReservation.id}-${hourBucket}`;
    if (key === lastFetchKey) return;
    const timer = window.setTimeout(() => {
      setLastFetchKey(key);
      void fetchGuidance();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [nextReservation, lastFetchKey, fetchGuidance]);

  if (!nextReservation) return null;

  const hours = hoursUntil(nextReservation.localTime);
  const urgency = guidance.status === "done" ? guidance.urgency
    : hours < 4 ? "critical" : hours < 24 ? "warning" : "normal";

  const borderClass = urgency === "critical"
    ? "border-red-400 dark:border-red-500/60"
    : urgency === "warning"
      ? "border-amber-400 dark:border-amber-500/60"
      : "border-cyan-400 dark:border-cyan-500/60";

  const bgClass = urgency === "critical"
    ? "from-red-50 to-white dark:from-red-500/10 dark:to-slate-900"
    : urgency === "warning"
      ? "from-amber-50 to-white dark:from-amber-500/10 dark:to-slate-900"
      : "from-cyan-50 to-white dark:from-cyan-500/10 dark:to-slate-900";

  const accentClass = urgency === "critical"
    ? "text-red-700 dark:text-red-300"
    : urgency === "warning"
      ? "text-amber-700 dark:text-amber-300"
      : "text-cyan-700 dark:text-cyan-300";

  const dotClass = urgency === "critical"
    ? "bg-red-500"
    : urgency === "warning"
      ? "bg-amber-500"
      : "bg-cyan-500";

  // Parse guidance text — bold headline on first line
  let headline = "";
  let detail = "";
  if (guidance.status === "done") {
    const lines = guidance.text.replace(/\*\*/g, "").split("\n");
    headline = lines[0]?.trim() ?? "";
    detail = lines.slice(1).join(" ").trim();
  }

  return (
    <div className={`rounded-3xl border-2 bg-gradient-to-br ${borderClass} ${bgClass} p-5 shadow-sm`}>
      {/* Header row */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={`h-2 w-2 animate-pulse rounded-full ${dotClass}`} />
          <p className={`text-xs font-bold uppercase tracking-widest ${accentClass}`}>
            Next up
          </p>
        </div>
        <p className={`text-xs font-semibold ${accentClass}`}>
          {formatRelative(nextReservation.localTime)}
        </p>
      </div>

      {/* Reservation summary */}
      <button
        type="button"
        onClick={() => onReservationTap?.(nextReservation.id)}
        className="mt-3 w-full text-left"
      >
        <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
          {typeEmoji(nextReservation.type)}{" "}
          {(() => {
            const p = nextReservation.provider ?? "";
            if (EMAIL_PROVIDER_NAMES.has(p.toLowerCase())) {
              return nextReservation.flightNumber
                ?? nextReservation.title
                ?? (nextReservation.type === "flight" ? "Flight" : "Reservation");
            }
            return p || nextReservation.title || "Reservation";
          })()}
        </p>
        <p className="mt-0.5 text-sm text-slate-600 dark:text-slate-400">
          {formatTime(nextReservation.localTime)}
          {nextReservation.flightNumber ? ` · ${nextReservation.flightNumber}` : ""}
          {nextReservation.location ? ` · ${nextReservation.location}` : ""}
        </p>
      </button>

      {/* Claude guidance */}
      <div className="mt-4 rounded-2xl border border-black/10 bg-white/70 p-4 dark:border-white/10 dark:bg-black/20">
        {guidance.status === "loading" ? (
          <div className="flex items-center gap-2">
            <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass}`} />
            <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass} [animation-delay:150ms]`} />
            <div className={`h-1.5 w-1.5 animate-bounce rounded-full ${dotClass} [animation-delay:300ms]`} />
            <p className="text-xs text-slate-500 dark:text-slate-400">Working out your timing…</p>
          </div>
        ) : guidance.status === "done" ? (
          <>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">{headline}</p>
            {detail ? <p className="mt-1.5 text-sm leading-relaxed text-slate-700 dark:text-slate-300">{detail}</p> : null}
            {guidance.proactive_flag ? (
              <div className="mt-2.5 flex items-start gap-2 rounded-xl bg-amber-500/10 px-3 py-2 dark:bg-amber-500/15">
                <span className="shrink-0 text-sm">⚡</span>
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-200">{guidance.proactive_flag}</p>
              </div>
            ) : null}
          </>
        ) : guidance.status === "error" ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Tap refresh to get timing guidance.
          </p>
        ) : null}
      </div>

      {/* Refresh */}
      {guidance.status === "done" || guidance.status === "error" ? (
        <button
          type="button"
          onClick={() => void fetchGuidance()}
          className="mt-3 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
        >
          Refresh guidance
        </button>
      ) : null}
    </div>
  );
}
