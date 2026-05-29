"use client";

import { useState } from "react";

interface OnTrackButtonProps {
  reservations: {
    id: string;
    type: string;
    provider: string;
    localTime: string;
    timezone?: string;
    location: string;
    flightDate?: string;
    flightNumber?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    flightDepartureTime?: string;
    flightArrivalTime?: string;
    checkOutDate?: string;
    confirmationCode?: string;
    notes?: string;
  }[];
  tripName: string;
  locationStatus?: "away" | "at-airport" | "in-terminal" | "airborne" | "unknown";
  nearestAirport?: string;
}

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; pass: boolean; headline: string; detail: string; action?: string }
  | { status: "error"; message?: string };

const EMAIL_PROVIDERS = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol"]);

function toUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return Number.NaN;
  if (!timezone) return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
  try {
    // Parse components as UTC reference point — avoids browser timezone pollution
    const approxUtcMs = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
    // Format that reference in the target timezone to measure the offset
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(
      formatter.formatToParts(new Date(approxUtcMs)).map(p => [p.type, p.value])
    );
    const tzAsUtcMs = Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute);
    const offsetMs = tzAsUtcMs - approxUtcMs; // positive = ahead of UTC (e.g. JST +9h)
    return approxUtcMs - offsetMs; // local - offset = UTC
  } catch {
    return Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
  }
}

function utcLabel(localTime: string, timezone: string): string {
  const utcMs = toUtcMs(localTime, timezone);
  if (Number.isNaN(utcMs)) return "";
  const d = new Date(utcMs);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth()+1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

function buildContext(reservations: OnTrackButtonProps["reservations"]): string {
  const getMs = (r: OnTrackButtonProps["reservations"][0]): number => {
    return toUtcMs(r.localTime, r.timezone ?? "");
  };

  const sorted = reservations
    .filter((r) => {
      const ms = getMs(r);
      return !Number.isNaN(ms) && ms > Date.now() - 86_400_000;
    })
    .sort((a, b) => getMs(a) - getMs(b))
    .slice(0, 8);

  const lines = sorted.map((r, idx) => {
    const provider = r.provider && !EMAIL_PROVIDERS.has(r.provider.toLowerCase()) ? r.provider : null;
    const tz = r.timezone ?? "";
    const utc = tz ? utcLabel(r.localTime, tz) : "";
    return [
      `seq=${idx + 1}`,
      `type=${r.type}`,
      provider ? `provider="${provider}"` : null,
      r.flightNumber ? `flight=${r.flightNumber}` : null,
      r.localTime ? `localTime="${r.localTime} (${tz || "unknown tz"})"` : null,
      utc ? `utcTime="${utc}"` : null,
      r.flightDepartureAirport && r.flightArrivalAirport
        ? `route=${r.flightDepartureAirport}→${r.flightArrivalAirport}` : null,
      r.flightDepartureTime ? `departureTime="${r.flightDepartureTime}"` : null,
      r.flightArrivalTime ? `arrivalTime="${r.flightArrivalTime}"` : `arrivalTime="[not stored — do not estimate]"`,
      r.location ? `location="${r.location}"` : null,
      r.confirmationCode ? `conf=${r.confirmationCode}` : null,
      r.checkOutDate ? `checkout=${r.checkOutDate}` : null,
      r.notes ? `notes="${r.notes.slice(0, 120)}"` : null,
    ].filter(Boolean).join(" ");
  }).map(parts => `[${parts}]`);

  return `RESERVATION SEQUENCE (sorted by UTC — use seq for order, utcTime for all time comparisons):\n${lines.join("\n")}`;
}

export function OnTrackButton({ reservations, tripName, locationStatus = "unknown", nearestAirport = "" }: OnTrackButtonProps) {
  const [state, setState] = useState<CheckState>({ status: "idle" });

  const runCheck = async () => {
    setState({ status: "loading" });
    try {
      const res = await fetch("/api/trip-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          tripName,
          nowIso: new Date().toISOString(),
          userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userLocalTime: new Date().toLocaleString("en-US", { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone, hour12: false }),
          reservationContext: buildContext(reservations),
          mode: "on-track-check",
          locationStatus,
          nearestAirport,
        }),
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({})) as { error?: string };
        setState({ status: "error", message: errBody.error ?? `Server error ${res.status}` });
        return;
      }
      const data = (await res.json()) as {
        urgency?: string;
        headline?: string;
        detail?: string;
        pass?: boolean;
        action?: string;
        error?: string;
      };
      if (data.error) {
        setState({ status: "error", message: data.error });
        return;
      }
      setState({
        status: "done",
        pass: data.urgency === "normal",
        headline: data.headline ?? "Check complete",
        detail: data.detail ?? "",
        action: data.action,
      });
    } catch {
      setState({ status: "error" });
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      {state.status === "idle" || state.status === "error" ? (
        <button
          type="button"
          onClick={() => void runCheck()}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-4 text-left transition hover:bg-slate-50 dark:hover:bg-slate-800"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-xl">
            ✅
          </span>
          <div>
            <p className="text-sm font-bold text-slate-900 dark:text-slate-100">Am I on track?</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {state.status === "error"
                ? (state.message ? `Error: ${state.message}` : "Tap to try again")
                : "Tap for an instant trip status check"}
            </p>
          </div>
          <span className="ml-auto text-slate-300 dark:text-slate-600">›</span>
        </button>
      ) : state.status === "loading" ? (
        <div className="flex items-center gap-3 px-4 py-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-500/15">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-300">Checking your trip…</p>
        </div>
      ) : (
        <div className={`rounded-2xl p-4 ${state.pass ? "bg-emerald-50 dark:bg-emerald-500/10" : "bg-amber-50 dark:bg-amber-500/10"}`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{state.pass ? "✅" : "⚠️"}</span>
            <div className="min-w-0">
              <p className={`text-sm font-bold ${state.pass ? "text-emerald-900 dark:text-emerald-100" : "text-amber-900 dark:text-amber-100"}`}>
                {state.headline}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-700 dark:text-slate-300">{state.detail}</p>
              {state.action ? (
                <p className="mt-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
                  Next: {state.action}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={() => setState({ status: "idle" })}
            className="mt-3 text-xs text-slate-400 underline underline-offset-2 hover:text-slate-600 dark:hover:text-slate-200"
          >
            Check again
          </button>
        </div>
      )}
    </div>
  );
}
