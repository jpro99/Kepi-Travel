"use client";

import { useState } from "react";

interface OnTrackButtonProps {
  reservations: {
    id: string;
    type: string;
    provider: string;
    localTime: string;
    location: string;
    flightNumber?: string;
    flightDepartureAirport?: string;
    flightArrivalAirport?: string;
    checkOutDate?: string;
    confirmationCode?: string;
  }[];
  tripName: string;
}

type CheckState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; pass: boolean; headline: string; detail: string; action?: string }
  | { status: "error" };

const EMAIL_PROVIDERS = new Set(["gmail", "yahoo", "outlook", "hotmail", "icloud", "aol"]);

function buildContext(reservations: OnTrackButtonProps["reservations"]): string {
  return reservations
    .filter((r) => {
      const s = r.localTime.trim().replace("T", " ").slice(0, 16);
      const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
      if (!m) return false;
      const ms = new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]).getTime();
      return ms > Date.now() - 86_400_000;
    })
    .sort((a, b) => Date.parse(a.localTime) - Date.parse(b.localTime))
    .slice(0, 8)
    .map((r) => {
      const provider = r.provider && !EMAIL_PROVIDERS.has(r.provider.toLowerCase()) ? r.provider : null;
      return [
        `type=${r.type}`,
        provider ? `provider="${provider}"` : null,
        `time="${r.localTime}"`,
        r.flightNumber ? `flight=${r.flightNumber}` : null,
        r.flightDepartureAirport && r.flightArrivalAirport
          ? `route=${r.flightDepartureAirport}→${r.flightArrivalAirport}` : null,
        r.location ? `location="${r.location}"` : null,
        r.confirmationCode ? `conf=${r.confirmationCode}` : null,
        r.checkOutDate ? `checkout=${r.checkOutDate}` : null,
      ].filter(Boolean).join(" ");
    })
    .map((parts) => `[${parts}]`)
    .join("\n");
}

export function OnTrackButton({ reservations, tripName }: OnTrackButtonProps) {
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
          reservationContext: buildContext(reservations),
          mode: "on-track-check",
        }),
      });
      if (!res.ok) { setState({ status: "error" }); return; }
      const data = (await res.json()) as {
        urgency?: string;
        headline?: string;
        detail?: string;
        pass?: boolean;
        action?: string;
      };
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
              {state.status === "error" ? "Tap to try again" : "Tap for an instant trip status check"}
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
