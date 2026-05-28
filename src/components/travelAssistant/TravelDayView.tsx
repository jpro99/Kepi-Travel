"use client";

import { useState, useEffect, useCallback } from "react";

type TransportMode = "driving-myself" | "getting-dropped-off" | "uber-lyft" | "train-bus" | "other";

interface TravelFlight {
  id: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  localTime: string;
  timezone?: string;
  flightArrivalTime?: string;
  flightArrivalTimezone?: string;
  confirmationCode?: string;
  provider?: string;
}

interface TravelDayViewProps {
  flights: TravelFlight[];
  departureDate: string;
  tripName: string;
  transport: TransportMode | null;
  hotelCheckout?: string | null;
  onTransportChange: (t: TransportMode) => void;
  onClose: () => void;
}

const TRANSPORT_OPTIONS: Array<{
  value: TransportMode; label: string; icon: string;
  leadTime: number; driveMin: number;
}> = [
  { value: "driving-myself",      label: "Driving myself",      icon: "🚗", leadTime: 15, driveMin: 45 },
  { value: "getting-dropped-off", label: "Getting dropped off", icon: "👋", leadTime: 10, driveMin: 40 },
  { value: "uber-lyft",           label: "Uber / Lyft",         icon: "🚕", leadTime: 15, driveMin: 50 },
  { value: "train-bus",           label: "Train / Bus",         icon: "🚌", leadTime: 20, driveMin: 60 },
  { value: "other",               label: "Other",               icon: "🚶", leadTime: 20, driveMin: 45 },
];

const US_POE = ["HNL","LAX","SFO","JFK","SEA","ORD","MIA","DFW","IAH","BOS","ATL","EWR","LAS","PHX","MSP"];

/** Parse "YYYY-MM-DD HH:MM" as UTC ms (date-aware, not just time-of-day) */
function parseUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16); // "YYYY-MM-DD HH:MM"
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  // Use Date.UTC to avoid browser timezone pollution
  const approxUtc = Date.UTC(+m[1], +m[2]-1, +m[3], +m[4], +m[5]);
  if (!timezone) return approxUtc;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(formatter.formatToParts(new Date(approxUtc)).map(p => [p.type, p.value]));
    const tzAsUtc = Date.UTC(+parts.year, +parts.month-1, +parts.day, +parts.hour, +parts.minute);
    return approxUtc - (tzAsUtc - approxUtc);
  } catch { return approxUtc; }
}

/** Format a UTC ms timestamp as local time HH:MM AM/PM */
function fmtMs(utcMs: number, timezone?: string): string {
  const tz = timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const d = new Date(utcMs);
  const h = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hour12: false }).format(d));
  const min = parseInt(new Intl.DateTimeFormat("en-US", { timeZone: tz, minute: "2-digit" }).format(d));
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${String(min).padStart(2, "0")} ${ampm}`;
}

/** Format ms offset as "Xh Ym" */
function fmtDiff(ms: number): string {
  const min = Math.round(ms / 60_000);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Subtract minutes from a UTC ms timestamp */
function subMin(utcMs: number, minutes: number): number {
  return utcMs - minutes * 60_000;
}

type ReadinessStatus = "green" | "yellow" | "red";

interface ReadinessItem {
  label: string;
  status: ReadinessStatus;
  detail: string;
}

interface TimelineStep {
  icon: string;
  title: string;
  time: string;
  timeMinutes: number;
  detail?: string;
  type: "normal" | "highlight" | "warning" | "critical";
  countdown?: number; // minutes from now
}

export function TravelDayView({
  flights, departureDate, tripName, transport,
  hotelCheckout, onTransportChange, onClose
}: TravelDayViewProps) {
  const [askTransport, setAskTransport] = useState(!transport);
  const [nowMs, setNowMs] = useState(Date.now());

  // Update every minute
  useEffect(() => {
    const t = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const transportOpt = TRANSPORT_OPTIONS.find(o => o.value === transport) ?? TRANSPORT_OPTIONS[0];

  const sortedFlights = [...flights].sort((a, b) => 
    parseUtcMs(a.localTime, a.timezone) - parseUtcMs(b.localTime, b.timezone)
  );
  const firstFlight = sortedFlights[0];
  if (!firstFlight && !askTransport) {
    return (
      <div className="fixed inset-0 z-[8000] bg-slate-950 flex items-center justify-center">
        <p className="text-white">No flights found for this trip.</p>
      </div>
    );
  }

  const deptMs = firstFlight ? parseUtcMs(firstFlight.localTime, firstFlight.timezone) : nowMs + 86_400_000;
  const deptTz = firstFlight?.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
  const isIntl = flights.some(f =>
    f.flightDepartureAirport && !["ONT","LAX","SFO","JFK","SEA","ORD","MIA","DFW","IAH","LAS","PHX","ATL","DEN","MSP","BOS","EWR"].includes(f.flightDepartureAirport)
  );
  const airportCutoffMs = (isIntl ? 180 : 90) * 60_000;
  const arriveAirportMs = deptMs - airportCutoffMs;
  const leaveHotelMs = arriveAirportMs - transportOpt.driveMin * 60_000 - transportOpt.leadTime * 60_000;

  // Hotel checkout - treat as today's date with given HH:MM
  const checkoutMs = hotelCheckout ? (() => {
    const parts = hotelCheckout.split(":");
    const h = parseInt(parts[0] ?? "12");
    const m = parseInt(parts[1] ?? "0");
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d.getTime();
  })() : null;

  const effectiveLeaveMs = checkoutMs ? Math.min(leaveHotelMs, checkoutMs) : leaveHotelMs;
  const msUntilLeave = effectiveLeaveMs - nowMs;
  const msUntilFlight = deptMs - nowMs;

  // Confidence score
  const totalBufferMs = deptMs - airportCutoffMs - transportOpt.driveMin * 60_000 - nowMs;
  const confidence = Math.max(0, Math.min(100, Math.round((totalBufferMs / 3_600_000) * 20 + 50)));
  const confidenceStatus: ReadinessStatus = confidence >= 75 ? "green" : confidence >= 50 ? "yellow" : "red";

  // Readiness items
  const readinessItems: ReadinessItem[] = [
    {
      label: "Departure timing",
      status: msUntilLeave > 90 * 60_000 ? "green" : msUntilLeave > 30 * 60_000 ? "yellow" : "red",
      detail: msUntilLeave > 0
        ? `Leave in ${fmtDiff(msUntilLeave)} — ${fmtMs(effectiveLeaveMs, deptTz)}`
        : `OVERDUE — leave immediately`,
    },
    {
      label: "Airport cutoff",
      status: msUntilFlight > airportCutoffMs + 30 * 60_000 ? "green" : msUntilFlight > airportCutoffMs ? "yellow" : "red",
      detail: `${isIntl ? 180 : 90} min cutoff · Arrive by ${fmtMs(arriveAirportMs, deptTz)}`,
    },
    {
      label: "Transport",
      status: transport ? "green" : "yellow",
      detail: transport ? `${transportOpt.icon} ${transportOpt.label}` : "Not set — tap to choose",
    },
    ...(checkoutMs ? [{
      label: "Hotel checkout",
      status: (nowMs < checkoutMs - 30 * 60_000 ? "green" : nowMs < checkoutMs ? "yellow" : "red") as ReadinessStatus,
      detail: `Check out by ${fmtMs(checkoutMs, deptTz)}`,
    }] : []),
    {
      label: "Passport / Docs",
      status: "yellow" as ReadinessStatus,
      detail: "Confirm passport, boarding pass, and visa if needed",
    },
    {
      label: "Bags",
      status: "yellow" as ReadinessStatus,
      detail: "Confirm all bags packed and weight checked",
    },
  ];

  const overallStatus: ReadinessStatus = readinessItems.some(i => i.status === "red") ? "red"
    : readinessItems.some(i => i.status === "yellow") ? "yellow" : "green";

  // Timeline
  const timeline: TimelineStep[] = [];

  if (checkoutMs) {
    timeline.push({
      icon: "🏨", title: "Hotel checkout deadline",
      time: fmtMs(checkoutMs, deptTz), timeMinutes: checkoutMs,
      detail: "Return key, collect receipt, pick up luggage",
      type: nowMs > checkoutMs - 30 * 60_000 ? "warning" : "normal",
      countdown: checkoutMs - nowMs,
    });
  }

  if (transport === "uber-lyft") {
    timeline.push({
      icon: "📱", title: "Book Uber / Lyft now",
      time: fmtMs(effectiveLeaveMs - 15 * 60_000, deptTz), timeMinutes: effectiveLeaveMs - 15 * 60_000,
      detail: "Book 15 min before planned departure to avoid surge",
      type: "normal",
    });
  }
  if (transport === "train-bus") {
    timeline.push({
      icon: "🚌", title: "Check transit schedule",
      time: fmtMs(effectiveLeaveMs - 20 * 60_000, deptTz), timeMinutes: effectiveLeaveMs - 20 * 60_000,
      detail: "Confirm train/bus time. Have ticket ready.",
      type: "normal",
    });
  }

  timeline.push({
    icon: transportOpt.icon, title: "Leave for airport",
    time: fmtMs(effectiveLeaveMs, deptTz), timeMinutes: effectiveLeaveMs,
    detail: `~${transportOpt.driveMin} min to airport · ${isIntl ? "3 hr" : "90 min"} check-in time`,
    type: "highlight",
    countdown: msUntilLeave,
  });

  timeline.push({
    icon: "🛫", title: `Arrive ${firstFlight?.flightDepartureAirport ?? "airport"} — check in`,
    time: fmtMs(arriveAirportMs, deptTz), timeMinutes: arriveAirportMs,
    detail: isIntl
      ? "International: 3 hrs early · Passport + docs · Check bag"
      : "Domestic: 90 min early · Online check-in saves time",
    type: "highlight",
  });

  // Security / boarding
  timeline.push({
    icon: "🔒", title: "Clear security",
    time: fmtMs(arriveAirportMs + 30 * 60_000, deptTz), timeMinutes: arriveAirportMs + 30 * 60_000,
    detail: "TSA PreCheck/Global Entry line if available",
    type: "normal",
  });

  // Each flight - using sortedFlights for correct UTC order
  sortedFlights.forEach((flight, i) => {
    const flightMs = parseUtcMs(flight.localTime, flight.timezone);
    const flightTz = flight.timezone ?? deptTz;
    timeline.push({
      icon: "✈️",
      title: `${flight.flightNumber ?? "Flight"} ${flight.flightDepartureAirport ?? ""} → ${flight.flightArrivalAirport ?? ""}`,
      time: fmtMs(flightMs, flightTz), timeMinutes: flightMs,
      detail: `${flight.provider ?? ""}${flight.confirmationCode ? ` · ${flight.confirmationCode}` : ""}`,
      type: "highlight",
      countdown: flightMs - nowMs,
    });

    if (flight.flightArrivalTime) {
      const arrTz = flight.flightArrivalTimezone ?? flightTz;
      const arrMs = parseUtcMs(flight.flightArrivalTime, arrTz);
      const nextFlight = sortedFlights[i + 1];
      const isPoE = US_POE.includes(flight.flightArrivalAirport ?? "");

      if (nextFlight) {
        const nextDeptMs = parseUtcMs(nextFlight.localTime, nextFlight.timezone);
        const layoverMs = nextDeptMs - arrMs;
        const layoverMin = Math.round(layoverMs / 60_000);
        timeline.push({
          icon: "🛬", title: `Land ${flight.flightArrivalAirport ?? ""}`,
          time: fmtMs(arrMs, arrTz), timeMinutes: arrMs,
          detail: isPoE
            ? `US Port of Entry — CBP + bags + USDA + TSA (~90 min). ${fmtDiff(layoverMs)} to next flight.`
            : `${fmtDiff(layoverMs)} layover`,
          type: isPoE && layoverMin < 210 ? "warning" : "normal",
        });
        if (isPoE) {
          timeline.push({
            icon: "🛃", title: "Customs · Bags · USDA · TSA",
            time: `~${fmtMs(arrMs + 90 * 60_000, arrTz)}`, timeMinutes: arrMs + 90 * 60_000,
            detail: layoverMin < 210
              ? "⚠ Tight — Global Entry kiosk or CBP Mobile Passport. Move immediately on landing."
              : "Use Global Entry kiosk (5–15 min) or CBP Mobile Passport app.",
            type: layoverMin < 210 ? "warning" : "normal",
          });
        }
      } else {
        timeline.push({
          icon: "🛬", title: `Land ${flight.flightArrivalAirport ?? ""} — final destination`,
          time: fmtMs(arrMs, arrTz), timeMinutes: arrMs,
          detail: "Bag claim ~20 min",
          type: "highlight",
        });
        timeline.push({
          icon: "🏠", title: "Estimated home / hotel arrival",
          time: fmtMs(arrMs + 75 * 60_000, arrTz), timeMinutes: arrMs + 75 * 60_000,
          detail: "Bag claim + transit (~75 min estimate)",
          type: "normal",
        });
      }
    }
  });

  // Sort by UTC ms
  timeline.sort((a, b) => a.timeMinutes - b.timeMinutes);

  const statusColor: Record<ReadinessStatus, string> = {
    green: "text-emerald-400",
    yellow: "text-amber-400",
    red: "text-rose-400",
  };
  const statusBg: Record<ReadinessStatus, string> = {
    green: "bg-emerald-500",
    yellow: "bg-amber-500",
    red: "bg-rose-500",
  };
  const statusLabel: Record<ReadinessStatus, string> = {
    green: "On Track",
    yellow: "Attention Needed",
    red: "Action Required",
  };

  const todayLabel = new Date(departureDate + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric",
  });

  // TRANSPORT PICKER SCREEN
  if (askTransport) {
    return (
      <div className="fixed inset-0 z-[8000] bg-slate-950 flex flex-col overflow-hidden">
        <div className="bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-5 pt-12 pb-6">
          <button type="button" onClick={onClose} className="text-sky-200 text-sm mb-4 flex items-center gap-1">
            ← Back to trip
          </button>
          <p className="text-xs font-bold uppercase tracking-widest text-sky-200">Travel Day · {todayLabel}</p>
          <h1 className="text-2xl font-bold text-white mt-1">{tripName}</h1>
          <p className="text-sky-100 mt-1">How are you getting to the airport?</p>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
          <p className="text-xs text-slate-400">This calculates your leave-by time based on travel method and adds the right time buffer.</p>
          {TRANSPORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onTransportChange(opt.value); setAskTransport(false); }}
              className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-4 text-left transition active:scale-[0.98] hover:border-sky-500 hover:bg-sky-500/10"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-bold text-white">{opt.icon} {opt.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5">+{opt.leadTime} min prep · ~{opt.driveMin} min transit</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">Leave by ~</p>
                  <p className="text-sm font-bold text-sky-400">
                    {firstFlight ? fmtMs(deptMs - (isIntl ? 180 : 90) * 60_000 - opt.driveMin * 60_000 - opt.leadTime * 60_000, deptTz) : "—"}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // TRAVEL DAY MAIN SCREEN
  return (
    <div className="fixed inset-0 z-[8000] bg-slate-950 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-[#0c2461] via-[#1a56b0] to-[#0ea5e9] px-5 pt-12 pb-4 shrink-0">
        <div className="flex items-center justify-between">
          <button type="button" onClick={onClose} className="text-sky-200 text-sm flex items-center gap-1">← Trip</button>
          <button type="button" onClick={() => setAskTransport(true)} className="text-xs text-sky-200 border border-sky-400/40 rounded-lg px-2.5 py-1">
            {transportOpt.icon} Change
          </button>
        </div>

        <p className="text-xs font-bold uppercase tracking-widest text-sky-200 mt-3">Travel Day · {todayLabel}</p>
        <h1 className="text-xl font-bold text-white mt-0.5">{tripName}</h1>

        {/* Leave by hero card */}
        <div className="mt-3 rounded-2xl bg-black/25 backdrop-blur-sm p-3.5 flex items-center gap-4">
          <div className="flex-1">
            <p className="text-xs font-bold uppercase tracking-wider text-sky-200">Leave by</p>
            <p className="text-3xl font-black text-white leading-none mt-0.5">{fmtMs(effectiveLeaveMs, deptTz)}</p>
            <p className="text-xs text-sky-100 mt-1">
              {msUntilLeave > 0 ? `${fmtDiff(msUntilLeave)} from now` : "⚠ Leave immediately"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs text-sky-200 font-semibold">Flight</p>
            <p className="text-xl font-bold text-white">{fmtMs(deptMs, deptTz)}</p>
            <p className="text-xs text-sky-100">{firstFlight?.flightNumber}</p>
          </div>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Readiness score */}
        <div className="px-5 pt-4 pb-2">
          <div className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-bold text-white">Trip Readiness</p>
              <div className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
                overallStatus === "green" ? "bg-emerald-500/20 text-emerald-300"
                  : overallStatus === "yellow" ? "bg-amber-500/20 text-amber-300"
                  : "bg-rose-500/20 text-rose-300"
              }`}>
                <span className={`inline-block h-2 w-2 rounded-full ${statusBg[overallStatus]}`} />
                {statusLabel[overallStatus]}
              </div>
            </div>

            {/* Progress bar */}
            <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${statusBg[confidenceStatus]}`}
                style={{ width: `${confidence}%` }}
              />
            </div>

            {/* Readiness grid */}
            <div className="space-y-2">
              {readinessItems.map((item, i) => (
                <div key={i} className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`inline-block h-2 w-2 shrink-0 rounded-full mt-0.5 ${statusBg[item.status]}`} />
                    <p className="text-xs font-semibold text-slate-300 truncate">{item.label}</p>
                  </div>
                  <p className={`text-xs shrink-0 text-right max-w-[55%] ${statusColor[item.status]}`}>{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bags + Docs quick actions */}
        <div className="px-5 pb-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Critical items</p>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              {["🛂 Passport", "📱 Phone + charger", "💊 Medications", "💳 Cards + cash", "🔑 Keys", "🔋 Power bank"].map(item => (
                <p key={item}>{item}</p>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-slate-900 border border-slate-800 p-3">
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Bag checklist</p>
            <div className="mt-2 space-y-1 text-xs text-slate-300">
              {["✓ Boarding pass ready", "✓ Bags labeled", "⚠ Check bag weight", "⚠ No liquids >100ml", "✓ Laptop accessible", "✓ Remove belt/watch"].map(item => (
                <p key={item} className={item.startsWith("⚠") ? "text-amber-400" : ""}>{item}</p>
              ))}
            </div>
          </div>
        </div>

        {/* Timeline */}
        <div className="px-5 pb-4">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Your day</p>
          <div className="space-y-0">
            {timeline.map((step, i) => {
              const isPast = step.timeMinutes < nowMs - 5 * 60_000;
              const isCurrent = step.timeMinutes >= nowMs - 5 * 60_000 && step.timeMinutes <= nowMs + 30 * 60_000;
              return (
                <div key={i} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`mt-0.5 h-9 w-9 rounded-full flex items-center justify-center text-sm shrink-0 ${
                      isPast ? "bg-slate-800 opacity-40"
                        : isCurrent ? "bg-sky-600 shadow-lg shadow-sky-500/30 ring-2 ring-sky-400"
                        : step.type === "highlight" ? "bg-sky-700"
                        : step.type === "warning" ? "bg-amber-600"
                        : step.type === "critical" ? "bg-rose-600"
                        : "bg-slate-800"
                    }`}>
                      {step.icon}
                    </div>
                    {i < timeline.length - 1 && (
                      <div className={`w-0.5 flex-1 my-1 min-h-[16px] ${isPast ? "bg-slate-800" : "bg-slate-700"}`} />
                    )}
                  </div>
                  <div className={`pb-4 pt-1 flex-1 min-w-0 ${isPast ? "opacity-40" : ""}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <p className={`text-sm font-semibold leading-tight ${
                        isCurrent ? "text-sky-300"
                          : step.type === "highlight" ? "text-white"
                          : step.type === "warning" ? "text-amber-300"
                          : "text-slate-300"
                      }`}>{step.title}</p>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold ${
                          isCurrent ? "text-sky-400"
                            : step.type === "warning" ? "text-amber-400"
                            : "text-slate-500"
                        }`}>{step.time}</p>
                        {step.countdown !== undefined && step.countdown > 0 && (
                          <p className="text-[10px] text-slate-600">in {fmtDiff(step.countdown)}</p>
                        )}
                      </div>
                    </div>
                    {step.detail && (
                      <p className={`text-xs mt-0.5 ${
                        step.type === "warning" ? "text-amber-500" : "text-slate-500"
                      }`}>{step.detail}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Recovery quick links */}
        <div className="px-5 pb-8">
          <p className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">If something goes wrong</p>
          <div className="space-y-2">
            {[
              { icon: "✈️", label: "Missed or delayed flight", detail: "Call airline immediately — through-ticket = airline must rebook" },
              { icon: "🧳", label: "Overweight bag", detail: "Move items to carry-on or personal item. Laptop, charger, shoes help." },
              { icon: "🛂", label: "Passport issue", detail: "Contact airline + nearest consulate. Do not leave airport." },
              { icon: "🏨", label: "Late checkout denied", detail: "Ask for 1-hr grace, store luggage, use lobby. Status helps." },
            ].map((item, i) => (
              <div key={i} className="rounded-xl bg-slate-900 border border-slate-800 p-3 flex gap-3">
                <span className="text-lg shrink-0">{item.icon}</span>
                <div>
                  <p className="text-xs font-bold text-slate-200">{item.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{item.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Bottom CTA */}
      <div className="px-5 py-4 border-t border-slate-800 shrink-0">
        <button type="button" onClick={onClose} className="w-full rounded-2xl bg-slate-800 py-3 text-sm font-bold text-slate-300">
          Back to trip dashboard
        </button>
      </div>
    </div>
  );
}
