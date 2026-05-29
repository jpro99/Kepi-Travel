"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getAirportProximity, type UserAirportStatus } from "@/lib/travelAssistant/airportGeo";
import {
  AIRLINE_PROGRAMS,
  HOTEL_PROGRAMS,
  CAR_RENTAL_PROGRAMS,
  findProgram,
  findTier,
  getLoungesForAirport,
  type AirlineStatusProgram,
  type AirlineLoungeInfo,
  type StatusTier,
} from "@/lib/travelAssistant/airlineStatus";
import { buildGateInstructions, getAirportNav } from "@/lib/travelAssistant/airportNavigation";

/* ─── Types ──────────────────────────────────────────────────── */
interface FlightReservation {
  id: string;
  type: string;
  title: string;
  provider: string;
  localTime: string;
  timezone?: string;
  location: string;
  confirmationCode?: string;
  flightNumber?: string;
  flightAirline?: string;
  flightDepartureAirport?: string;
  flightArrivalAirport?: string;
  flightDepartureTime?: string;
  flightArrivalTime?: string;
  flightDepartureGate?: string;
  flightDepartureTerminal?: string;
  flightArrivalGate?: string;
  flightArrivalTerminal?: string;
  flightDelayMinutes?: number;
  flightOnTime?: boolean;
  flightStatus?: string;
}

interface AirportModeProps {
  reservations: FlightReservation[];
  onViewReservations?: () => void;
}

/* ─── Time helpers ───────────────────────────────────────────── */
function toUtcMs(localTime: string, timezone?: string): number {
  const s = localTime.trim().replace("T", " ").slice(0, 16);
  const m = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2})$/.exec(s);
  if (!m) return NaN;
  const approxUtc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  if (!timezone) return approxUtc;
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone, year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false,
    });
    const parts = Object.fromEntries(fmt.formatToParts(new Date(approxUtc)).map(p => [p.type, p.value]));
    const tzAsUtc = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    return approxUtc - (tzAsUtc - approxUtc);
  } catch { return approxUtc; }
}

function fmtCountdown(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function localDisplay(localTime: string): string {
  const m = /(\d{2}):(\d{2})$/.exec(localTime.trim().slice(0, 16));
  if (!m) return "";
  const h = +m[1];
  const ampm = h >= 12 ? "PM" : "AM";
  return `${h % 12 || 12}:${m[2]} ${ampm}`;
}

function fmtTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes().toString().padStart(2, "0");
  return `${h % 12 || 12}:${m} ${h >= 12 ? "PM" : "AM"}`;
}

/* ─── Location-aware phase ────────────────────────────────────── */
type LocationPhase =
  | "off"           // too far out
  | "leave-soon"    // 90–180 min, not at airport
  | "leave-now"     // 45–90 min, not at airport
  | "check-in"      // at airport outer zone, before security
  | "security"      // at airport, need to get through security
  | "lounge"        // in terminal, lounge access available, time permits
  | "head-to-gate"  // in terminal, should head to gate now
  | "at-gate"       // boarding window, in terminal
  | "final-call"    // <20 min
  | "departed";

interface PhaseConfig {
  label: string;
  sublabel: string;
  icon: string;
  bg: string;
  urgent: boolean;
}

function getLocationPhase(
  deptUtcMs: number,
  nowMs: number,
  locationStatus: UserAirportStatus,
  hasLoungeAccess: boolean,
  hasStatus: boolean,
): LocationPhase {
  const min = (deptUtcMs - nowMs) / 60_000;

  if (min > 180) return "off";
  if (min < 0) return min > -60 ? "departed" : "off";
  if (min < 20) return "final-call";

  // User is in the terminal (past security)
  if (locationStatus === "in-terminal") {
    if (min > 60 && hasLoungeAccess) return "lounge";
    if (min > 30) return "head-to-gate";
    return "at-gate";
  }

  // User is at the airport (check-in/landside zone)
  if (locationStatus === "at-airport") {
    if (min < 45) return "security"; // cutting it close
    return "check-in";
  }

  // User is away from airport
  if (min < 45) return "leave-now";
  if (min < 90) return "leave-now";
  return "leave-soon";
}

const PHASE_CONFIG: Record<LocationPhase, PhaseConfig> = {
  off:          { label: "", sublabel: "", icon: "", bg: "", urgent: false },
  "leave-soon": { label: "Flight today", sublabel: "Plan to leave for the airport", icon: "🗓", bg: "from-sky-600 to-blue-700", urgent: false },
  "leave-now":  { label: "Leave for the airport", sublabel: "Head out now to arrive with time to spare", icon: "🚗", bg: "from-amber-500 to-orange-600", urgent: true },
  "check-in":   { label: "You're at the airport", sublabel: "Head to check-in or security", icon: "🏛", bg: "from-sky-500 to-blue-600", urgent: false },
  security:     { label: "Get through security now", sublabel: "Head to the TSA checkpoint", icon: "🛡", bg: "from-amber-500 to-orange-500", urgent: true },
  lounge:       { label: "You're airside — enjoy the lounge", sublabel: "Plenty of time before boarding", icon: "🛋", bg: "from-indigo-500 to-violet-600", urgent: false },
  "head-to-gate": { label: "Head to your gate", sublabel: "Make your way there now", icon: "🚶", bg: "from-amber-500 to-orange-600", urgent: true },
  "at-gate":    { label: "You're at the gate ✓", sublabel: "Board when your group is called", icon: "🛫", bg: "from-emerald-500 to-teal-600", urgent: false },
  "final-call": { label: "Final boarding call!", sublabel: "Get on the plane now", icon: "🚨", bg: "from-red-500 to-red-700", urgent: true },
  departed:     { label: "Flight departed", sublabel: "Safe travels!", icon: "✈️", bg: "from-slate-500 to-slate-700", urgent: false },
};

/* ─── Leave-by calculator ─────────────────────────────────────── */
function calcLeaveByMs(
  deptUtcMs: number,
  locationStatus: UserAirportStatus,
  hasPrioritySecurity: boolean,
  hasPrecheck: boolean,
  hasLoungeAccess: boolean,
): { leaveByMs: number; reason: string } {
  // Time at airport before departure:
  // Standard: 90 min domestic, 120 min international (simplified: 90)
  // Priority security: saves ~20 min
  // Precheck/GE: saves another 15 min
  // Lounge: add 30 min buffer to enjoy it
  let bufferMin = 90;
  if (hasPrioritySecurity || hasPrecheck) bufferMin -= 20;
  if (hasLoungeAccess) bufferMin += 30;
  bufferMin = Math.max(40, bufferMin);
  const reason = hasLoungeAccess
    ? `${bufferMin} min allows time for lounge + gate`
    : hasPrioritySecurity
    ? `${bufferMin} min (priority security lane)`
    : `${bufferMin} min for check-in + security`;
  return { leaveByMs: deptUtcMs - bufferMin * 60_000, reason };
}

/* ─── Status setup modal ──────────────────────────────────────── */
interface StatusSetupProps {
  onSave: (profile: TravelProfile) => void;
  onSkip: () => void;
  existing: TravelProfile | null;
}

function StatusSetupModal({ onSave, onSkip, existing }: StatusSetupProps) {
  const [airline, setAirline] = useState(existing?.airlineStatuses?.[0]?.airline ?? "");
  const [airlineTier, setAirlineTier] = useState(existing?.airlineStatuses?.[0]?.tier ?? "");
  const [hotel, setHotel] = useState(existing?.hotelStatuses?.[0]?.chain ?? "");
  const [hotelTier, setHotelTier] = useState(existing?.hotelStatuses?.[0]?.tier ?? "");
  const [carCo, setCarCo] = useState(existing?.carRentalStatuses?.[0]?.company ?? "");
  const [carTier, setCarTier] = useState(existing?.carRentalStatuses?.[0]?.tier ?? "");
  const [tsa, setTsa] = useState(existing?.tsa_precheck ?? false);
  const [ge, setGe] = useState(existing?.global_entry ?? false);
  const [clear, setClear] = useState(existing?.clear ?? false);
  const [saving, setSaving] = useState(false);
  const [step, setStep] = useState<"airline" | "hotel" | "security" | "done">("airline");

  const matchedProgram = useMemo(() => airline ? findProgram(airline) : null, [airline]);
  const matchedHotel = useMemo(() => hotel ? HOTEL_PROGRAMS.find(h => h.chain === hotel) : null, [hotel]);
  const matchedCar = useMemo(() => carCo ? CAR_RENTAL_PROGRAMS.find(c => c.company === carCo) : null, [carCo]);

  const handleSave = async () => {
    setSaving(true);
    const profile: TravelProfile = {
      airlineStatuses: airline && airlineTier ? [{ airline, tier: airlineTier, iata: matchedProgram?.iata[0] }] : [],
      hotelStatuses: hotel && hotelTier ? [{ chain: hotel, tier: hotelTier }] : [],
      carRentalStatuses: carCo && carTier ? [{ company: carCo, tier: carTier }] : [],
      tsa_precheck: tsa,
      global_entry: ge,
      clear,
    };
    try {
      await fetch("/api/travel-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      onSave(profile);
    } catch { onSave(profile); }
    finally { setSaving(false); }
  };

  const steps = ["airline", "hotel", "security"] as const;
  const stepIdx = steps.indexOf(step as typeof steps[number]);
  const stepLabels = ["✈️ Airline", "🏨 Hotel", "🛡 Security"];

  return (
    <div className="rounded-3xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-5 space-y-4 shadow-xl">
      <div>
        <p className="font-bold text-slate-900 dark:text-slate-100 text-base">Your travel profile</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
          Kepi uses this to route you through airports, unlock lounges, and give you the right leave time.
        </p>
      </div>

      {/* Step indicators */}
      <div className="flex gap-1">
        {stepLabels.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setStep(steps[i])}
            className={`flex-1 rounded-lg py-1.5 text-xs font-semibold transition ${
              i === stepIdx
                ? "bg-sky-600 text-white"
                : i < stepIdx
                ? "bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300"
                : "bg-slate-100 dark:bg-slate-800 text-slate-500"
            }`}
          >
            {i < stepIdx ? "✓ " : ""}{label}
          </button>
        ))}
      </div>

      {/* Step: Airline */}
      {step === "airline" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Airline</label>
            <select
              value={airline}
              onChange={e => { setAirline(e.target.value); setAirlineTier(""); }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">No status / not sure</option>
              {AIRLINE_PROGRAMS.map(p => (
                <option key={p.iata[0]} value={p.airline}>{p.airline} ({p.program})</option>
              ))}
            </select>
          </div>
          {matchedProgram && matchedProgram.tiers.length > 0 && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Status tier</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {matchedProgram.tiers.map(t => (
                  <button
                    key={t.tier}
                    type="button"
                    onClick={() => setAirlineTier(t.tier)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                      airlineTier === t.tier
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t.tier}{t.loungeAccess ? " 🛋" : ""}
                  </button>
                ))}
              </div>
              {airlineTier && (() => {
                const t = findTier(matchedProgram, airlineTier);
                return t ? (
                  <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                    {t.loungeAccess ? "✅ Lounge" : "❌ No lounge"} · {t.priorityBoarding ? "Priority boarding" : "Standard"} · {t.freeCheckedBags} free bag{t.freeCheckedBags !== 1 ? "s" : ""}
                  </p>
                ) : null;
              })()}
            </div>
          )}
          <button type="button" onClick={() => setStep("hotel")} className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white">
            Next: Hotel status →
          </button>
        </div>
      )}

      {/* Step: Hotel */}
      {step === "hotel" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Hotel chain</label>
            <select
              value={hotel}
              onChange={e => { setHotel(e.target.value); setHotelTier(""); }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">No status</option>
              {HOTEL_PROGRAMS.map(h => (
                <option key={h.chain} value={h.chain}>{h.chain} ({h.program})</option>
              ))}
            </select>
          </div>
          {matchedHotel && (
            <div>
              <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Hotel tier</label>
              <div className="mt-1 flex flex-wrap gap-2">
                {matchedHotel.tiers.map(t => (
                  <button
                    key={t.tier}
                    type="button"
                    onClick={() => setHotelTier(t.tier)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                      hotelTier === t.tier
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t.tier}
                  </button>
                ))}
              </div>
              {hotelTier && matchedHotel.tiers.find(t => t.tier === hotelTier) && (
                <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                  {matchedHotel.tiers.find(t => t.tier === hotelTier)?.benefits.join(" · ")}
                </p>
              )}
            </div>
          )}
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Car rental</label>
            <select
              value={carCo}
              onChange={e => { setCarCo(e.target.value); setCarTier(""); }}
              className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm text-slate-900 dark:text-slate-100"
            >
              <option value="">No status</option>
              {CAR_RENTAL_PROGRAMS.map(c => (
                <option key={c.company} value={c.company}>{c.company}</option>
              ))}
            </select>
            {matchedCar && (
              <div className="mt-2 flex flex-wrap gap-2">
                {matchedCar.tiers.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setCarTier(t)}
                    className={`rounded-xl px-3 py-1.5 text-xs font-bold border transition ${
                      carTier === t
                        ? "bg-sky-600 text-white border-sky-600"
                        : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("airline")} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-500">← Back</button>
            <button type="button" onClick={() => setStep("security")} className="flex-1 rounded-xl bg-sky-600 py-2.5 text-sm font-bold text-white">Next: Security →</button>
          </div>
        </div>
      )}

      {/* Step: Security */}
      {step === "security" && (
        <div className="space-y-3">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Security programs</label>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-2">These affect your leave-by time and security lane guidance.</p>
            <div className="flex flex-wrap gap-2">
              {[
                { key: "tsa", label: "TSA PreCheck ✓", val: tsa, set: setTsa, note: "Dedicated lane, no shoes/laptop removal" },
                { key: "ge",  label: "Global Entry ✓",  val: ge,  set: setGe,  note: "Includes PreCheck + expedited customs" },
                { key: "clear", label: "CLEAR ✓",      val: clear, set: setClear, note: "Biometric scan, skip to front of security" },
              ].map(({ key, label, val, set, note }) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => set(!val)}
                  className={`rounded-xl px-3 py-2 text-xs font-bold border transition text-left ${
                    val
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700"
                  }`}
                >
                  <p>{label}</p>
                  {!val && <p className="opacity-60 font-normal mt-0.5">{note}</p>}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("hotel")} className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm font-semibold text-slate-500">← Back</button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex-1 rounded-xl bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving ? "Saving…" : "✅ Save my profile"}
            </button>
          </div>
        </div>
      )}

      <button type="button" onClick={onSkip} className="w-full text-center text-xs text-slate-400 hover:text-slate-600 py-1">
        Skip for now
      </button>
    </div>
  );
}
/* ─── Main component ──────────────────────────────────────────── */
export function AirportMode({ reservations, onViewReservations }: AirportModeProps) {
  const [now, setNow] = useState(() => Date.now());
  const [userLat, setUserLat] = useState<number | null>(null);
  const [userLon, setUserLon] = useState<number | null>(null);
  const watchRef = useRef<number | null>(null);
  const [profile, setProfile] = useState<TravelProfile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [showSetup, setShowSetup] = useState(false);

  // Tick every second
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Load travel profile
  useEffect(() => {
    void fetch("/api/travel-profile", { cache: "no-store" })
      .then(r => r.json())
      .then((d: { profile?: TravelProfile }) => {
        setProfile(d.profile ?? null);
        setProfileLoaded(true);
      })
      .catch(() => setProfileLoaded(true));
  }, []);

  // Watch GPS
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchRef.current = navigator.geolocation.watchPosition(
      pos => { setUserLat(pos.coords.latitude); setUserLon(pos.coords.longitude); },
      () => null,
      { enableHighAccuracy: false, maximumAge: 30_000, timeout: 15_000 }
    );
    return () => { if (watchRef.current !== null) navigator.geolocation.clearWatch(watchRef.current); };
  }, []);

  // Find active flight
  const activeFlight = useMemo(() => {
    const flights = reservations.filter(r => r.type === "flight");
    return flights
      .map(f => ({ f, utcMs: toUtcMs(f.localTime, f.timezone) }))
      .filter(({ utcMs }) => !isNaN(utcMs) && (utcMs - now) / 60_000 < 180 && (now - utcMs) / 60_000 < 60)
      .sort((a, b) => a.utcMs - b.utcMs)[0] ?? null;
  }, [reservations, now]);

  // Airport proximity
  const proximity = useMemo(() =>
    getAirportProximity(userLat, userLon, activeFlight?.f.flightDepartureAirport),
    [userLat, userLon, activeFlight]
  );

  // Resolve status for this flight's airline
  const { program, tier, lounges } = useMemo(() => {
    if (!profile || !activeFlight) return { program: null, tier: null, lounges: [] };
    const f = activeFlight.f;
    const airlineHint = f.flightAirline ?? f.provider ?? "";
    const st = profile.airlineStatuses?.[0];
    if (!st) return { program: null, tier: null, lounges: [] };
    // Match by profile airline first, then flight airline
    const prog = findProgram(st.airline) ?? findProgram(airlineHint);
    if (!prog) return { program: null, tier: null, lounges: [] };
    const tierObj = findTier(prog, st.tier);
    const apt = f.flightDepartureAirport ?? "";
    const loungeList = tierObj?.loungeAccess ? getLoungesForAirport(prog, apt) : [];
    return { program: prog, tier: tierObj, lounges: loungeList };
  }, [profile, activeFlight]);

  const hasLoungeAccess = Boolean(tier?.loungeAccess && lounges.length > 0);
  const hasPrioritySecurity = Boolean(tier?.prioritySecurity || profile?.tsa_precheck || profile?.global_entry);
  const hasPrecheck = Boolean(profile?.tsa_precheck || profile?.global_entry);

  if (!activeFlight) return null;

  const { f, utcMs: deptUtcMs } = activeFlight;
  const phase = getLocationPhase(deptUtcMs, now, proximity.status, hasLoungeAccess, Boolean(tier));
  if (phase === "off") return null;

  const config = PHASE_CONFIG[phase];
  const msUntilDept = deptUtcMs - now;
  const isDelayed = (f.flightDelayMinutes ?? 0) > 0;

  const { leaveByMs, reason: leaveReason } = calcLeaveByMs(
    deptUtcMs, proximity.status, hasPrioritySecurity, hasPrecheck, hasLoungeAccess
  );
  const msUntilLeave = leaveByMs - now;
  const showLeaveCountdown = proximity.status === "away" && msUntilLeave > 0 && msUntilLeave < 3 * 3600_000;
  const leavingLate = proximity.status === "away" && msUntilLeave < 0 && phase !== "departed";

  // Show setup prompt if profile not loaded yet or no statuses set and we're within 3h
  const showSetupPrompt = profileLoaded && !profile?.airlineStatuses?.length && !showSetup;

  return (
    <div className="space-y-3">
      {/* Setup prompt — one-time, non-blocking */}
      {showSetupPrompt && !showSetup && (
        <div className="rounded-2xl border border-sky-200 dark:border-sky-500/30 bg-sky-50 dark:bg-sky-500/10 p-3 flex items-center gap-3">
          <span className="text-xl shrink-0">🎖</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-sky-800 dark:text-sky-200">Do you have airline status?</p>
            <p className="text-xs text-sky-600 dark:text-sky-400 mt-0.5">
              Tell Kepi your tier — it'll route you through the lounge and give you the right leave time.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowSetup(true)}
            className="shrink-0 rounded-xl bg-sky-600 px-3 py-1.5 text-xs font-bold text-white"
          >
            Set up
          </button>
        </div>
      )}

      {showSetup && (
        <StatusSetupModal
          existing={profile}
          onSave={p => { setProfile(p); setShowSetup(false); }}
          onSkip={() => setShowSetup(false)}
        />
      )}

      {/* Main airport card */}
      <div className={`relative overflow-hidden rounded-3xl bg-gradient-to-br ${config.bg} p-5 shadow-xl shadow-blue-900/30`}>
        {config.urgent && (
          <div className="absolute inset-0 rounded-3xl bg-white/10 animate-pulse pointer-events-none" />
        )}

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-2xl">{config.icon}</span>
              <p className="text-white/70 text-xs font-bold uppercase tracking-widest">Airport Mode</p>
            </div>
            <p className="mt-1 text-white text-xl font-bold leading-tight">{config.label}</p>
            <p className="text-white/70 text-xs mt-0.5">{config.sublabel}</p>
          </div>
          {phase !== "departed" && (
            <div className="text-right shrink-0">
              <p className="text-white/60 text-[10px] font-bold uppercase tracking-wider">Departs in</p>
              <p className="text-white text-2xl font-black tabular-nums leading-none mt-0.5">
                {fmtCountdown(msUntilDept)}
              </p>
            </div>
          )}
        </div>

        {/* Flight strip */}
        <div className="mt-4 rounded-2xl bg-white/15 backdrop-blur-sm border border-white/10 p-3">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-white font-bold text-base leading-tight truncate">
                {f.flightAirline ?? f.provider}{f.flightNumber ? ` ${f.flightNumber}` : ""}
              </p>
              <p className="text-white/60 text-sm mt-0.5">
                {f.flightDepartureAirport && f.flightArrivalAirport
                  ? `${f.flightDepartureAirport} → ${f.flightArrivalAirport}`
                  : f.title}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-white font-bold text-lg">
                {localDisplay(f.flightDepartureTime ?? f.localTime)}
              </p>
              {isDelayed && <p className="text-amber-300 text-xs font-bold">+{f.flightDelayMinutes}m delay</p>}
            </div>
          </div>
        </div>

        {/* Gate / terminal / status */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          {[
            { label: "Terminal", value: f.flightDepartureTerminal },
            { label: "Gate",     value: f.flightDepartureGate },
            { label: "Status",   value: f.flightStatus ?? (f.flightOnTime === false ? "Delayed" : "On time"), color: f.flightOnTime === false ? "text-amber-300" : "text-emerald-300" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-xl bg-white/10 p-2 text-center">
              <p className="text-white/50 text-[9px] font-bold uppercase tracking-wider">{label}</p>
              <p className={`font-bold text-base leading-tight mt-0.5 ${color ?? "text-white"}`}>
                {value ?? "—"}
              </p>
            </div>
          ))}
        </div>

        {/* Late warning */}
        {leavingLate && (
          <div className="mt-3 rounded-2xl border border-red-300/40 bg-red-500/20 p-3 flex items-center gap-2">
            <span className="text-xl shrink-0">🚨</span>
            <div>
              <p className="text-white font-black text-sm">You should have left already</p>
              <p className="text-white/70 text-xs">Leave immediately — you may be cutting it very close.</p>
            </div>
          </div>
        )}

        {/* Leave-by countdown */}
        {showLeaveCountdown && (
          <div className="mt-3 rounded-2xl border border-white/20 bg-white/15 p-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-white font-bold text-sm">Leave by {fmtTime(leaveByMs)}</p>
              <p className="text-white/60 text-xs mt-0.5">{leaveReason}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-white/50 text-[10px] uppercase tracking-wider">In</p>
              <p className="text-white font-black text-lg tabular-nums">{fmtCountdown(msUntilLeave)}</p>
            </div>
          </div>
        )}

        {/* Confirmation */}
        {f.confirmationCode && (
          <p className="mt-3 text-center text-[11px] font-mono text-white/50">
            {f.confirmationCode}
          </p>
        )}
      </div>

      {/* Where you are right now */}
      {proximity.status !== "unknown" && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 flex items-center gap-3">
          <span className="text-lg shrink-0">
            {proximity.status === "in-terminal" ? "✅" : proximity.status === "at-airport" ? "🏛" : "📍"}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
              {proximity.status === "in-terminal"
                ? `You're airside at ${proximity.airport?.name ?? "the airport"}`
                : proximity.status === "at-airport"
                ? `You're at ${proximity.airport?.name ?? "the airport"}`
                : `${proximity.airport ? `${(proximity.distanceKm ?? 0).toFixed(1)} km from ${proximity.airport.name}` : "Location tracked"}`}
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">
              {proximity.status === "in-terminal"
                ? "GPS shows you inside the terminal"
                : proximity.status === "at-airport"
                ? "GPS shows you at the airport — head to security"
                : "Not yet at the airport"}
            </p>
          </div>
        </div>
      )}

      {/* Status badge + lounge info */}
      {tier && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50 dark:bg-indigo-500/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-indigo-900 dark:text-indigo-200">
                🎖 {program?.airline} {tier.tier}
              </p>
              <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">
                {[
                  tier.priorityBoarding && "Priority boarding",
                  (tier.prioritySecurity || hasPrecheck) && "Priority security",
                  profile?.tsa_precheck && "TSA PreCheck",
                  profile?.global_entry && "Global Entry",
                  profile?.clear && "CLEAR",
                ].filter(Boolean).join(" · ")}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSetup(true)}
              className="text-xs text-indigo-500 dark:text-indigo-400 hover:underline"
            >
              Edit
            </button>
          </div>

          {/* Lounge cards */}
          {lounges.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                🛋 Your lounge{lounges.length > 1 ? "s" : ""} at {f.flightDepartureAirport}
              </p>
              {lounges.map((lounge, i) => (
                <LoungeCard
                  key={i}
                  lounge={lounge}
                  gate={f.flightDepartureGate}
                  terminal={f.flightDepartureTerminal}
                  deptUtcMs={deptUtcMs}
                  now={now}
                  hasPrecheck={hasPrecheck}
                />
              ))}
            </div>
          )}

          {/* No lounge at this airport */}
          {tier.loungeAccess && lounges.length === 0 && f.flightDepartureAirport && (
            <p className="text-xs text-indigo-500 dark:text-indigo-400">
              No {program?.airline} lounge at {f.flightDepartureAirport} — check partner lounges or Priority Pass.
            </p>
          )}
        </div>
      )}

      {/* Airport walkthrough steps */}
      <AirportWalkthrough
        phase={phase}
        locationStatus={proximity.status}
        hasLoungeAccess={hasLoungeAccess}
        hasPrioritySecurity={hasPrioritySecurity}
        hasPrecheck={hasPrecheck}
        hasGlobalEntry={Boolean(profile?.global_entry)}
        hasClear={Boolean(profile?.clear)}
        gate={f.flightDepartureGate}
        terminal={f.flightDepartureTerminal}
        iata={f.flightDepartureAirport}
        lounges={lounges}
        tier={tier}
        deptUtcMs={deptUtcMs}
        now={now}
      />

      {/* Pre-flight checklist */}
      {(phase === "leave-soon" || phase === "leave-now") && (
        <PreFlightChecklist />
      )}

      {onViewReservations && (
        <button
          type="button"
          onClick={onViewReservations}
          className="w-full text-center text-xs text-slate-400 hover:text-sky-600 py-1 transition"
        >
          View all reservations →
        </button>
      )}
    </div>
  );
}

/* ─── Lounge card ─────────────────────────────────────────────── */
function LoungeCard({ lounge, gate, terminal, deptUtcMs, now, hasPrecheck }: {
  lounge: AirlineLoungeInfo;
  gate?: string;
  terminal?: string;
  deptUtcMs: number;
  now: number;
  hasPrecheck: boolean;
}) {
  const minUntilDept = (deptUtcMs - now) / 60_000;
  // Suggest leaving lounge 40 min before departure to reach gate
  const leaveByMs = deptUtcMs - 40 * 60_000;
  const msUntilLeave = leaveByMs - now;
  const canEnjoySafely = minUntilDept > 50;

  return (
    <div className="rounded-xl bg-white dark:bg-slate-800 border border-indigo-100 dark:border-indigo-500/20 p-3 space-y-1.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-sm text-slate-900 dark:text-slate-100 truncate">{lounge.name}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">📍 {lounge.location}</p>
        </div>
        {lounge.hours && (
          <span className="shrink-0 text-[10px] text-slate-400 bg-slate-100 dark:bg-slate-700 rounded-md px-1.5 py-0.5">
            {lounge.hours}
          </span>
        )}
      </div>
      {lounge.gateProximityNote && (
        <p className="text-xs text-indigo-600 dark:text-indigo-400">
          🚶 {lounge.gateProximityNote}
        </p>
      )}
      {gate && (
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Your gate: <span className="font-bold">{terminal ? `${terminal} · ` : ""}{gate}</span>
        </p>
      )}
      {canEnjoySafely ? (
        <div className="rounded-lg bg-emerald-50 dark:bg-emerald-500/10 px-2.5 py-1.5 flex items-center justify-between gap-2">
          <p className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">
            ✅ Enough time — enjoy the lounge
          </p>
          <p className="text-xs font-bold text-emerald-700 dark:text-emerald-300 shrink-0">
            Leave by {new Date(leaveByMs).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
      ) : (
        <div className="rounded-lg bg-amber-50 dark:bg-amber-500/10 px-2.5 py-1.5">
          <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">
            ⚠️ Tight — head straight to the gate instead
          </p>
        </div>
      )}
    </div>
  );
}

/* ─── Airport walkthrough steps ──────────────────────────────── */
function AirportWalkthrough({ phase, locationStatus, hasLoungeAccess, hasPrioritySecurity,
  hasPrecheck, hasGlobalEntry, hasClear, gate, terminal, iata, lounges, tier, deptUtcMs, now }: {
  phase: LocationPhase;
  locationStatus: UserAirportStatus;
  hasLoungeAccess: boolean;
  hasPrioritySecurity: boolean;
  hasPrecheck: boolean;
  hasGlobalEntry: boolean;
  hasClear: boolean;
  gate?: string;
  terminal?: string;
  iata?: string;
  lounges: AirlineLoungeInfo[];
  tier: StatusTier | null;
  deptUtcMs: number;
  now: number;
}) {
  const airside = locationStatus === "in-terminal";
  const atAirport = locationStatus === "at-airport" || airside;
  const minUntilDept = (deptUtcMs - now) / 60_000;

  const { steps: navSteps, totalMinutes } = useMemo(() => {
    if (!iata) return { steps: [], totalMinutes: 0 };
    return buildGateInstructions(iata, gate, terminal, hasClear, hasPrecheck, hasGlobalEntry);
  }, [iata, gate, terminal, hasClear, hasPrecheck, hasGlobalEntry]);

  const allSteps = useMemo(() => {
    const list: { icon: string; text: string; detail?: string; done: boolean; minutes?: number }[] = [];

    if (!atAirport) {
      list.push({ icon: "🚗", text: "Get to the airport", done: false });
    }

    if (!airside) {
      if (tier?.freeCheckedBags) {
        list.push({ icon: "🧳", text: `Check bags — ${tier.freeCheckedBags} free with your status`, done: atAirport });
      } else {
        list.push({ icon: "🧳", text: "Drop checked bags if needed", done: atAirport });
      }
    }

    if (!airside && navSteps.length > 0) {
      navSteps.forEach(step => {
        list.push({ icon: step.icon, text: step.text, detail: step.detail, done: airside, minutes: step.minutes });
      });
    } else if (airside && iata && gate) {
      const nav = getAirportNav(iata);
      if (nav) {
        const gatePrefix = gate.match(/^([A-Z]+)/)?.[1];
        const route = nav.concourseRoutes.find(r =>
          r.fromZone.toLowerCase() === "security" &&
          r.toZone.toUpperCase() === gatePrefix?.toUpperCase()
        );
        if (route) {
          route.steps.forEach(step => {
            const icon = step.mode === "train" ? "🚇" : step.mode === "tram" ? "🚃" : step.mode === "shuttle" ? "🚌" : "🚶";
            list.push({ icon, text: step.instruction, detail: step.detail ?? step.landmark, done: false, minutes: step.estimatedMinutes });
          });
        }
      }
    }

    if (hasLoungeAccess && lounges.length > 0 && minUntilDept > 50) {
      const lounge = lounges[0];
      list.push({ icon: "🛋", text: `${lounge.name} — ${lounge.location}`, detail: lounge.gateProximityNote ?? lounge.hours, done: false });
    }

    if (gate) {
      list.push({ icon: "🚪", text: terminal ? `Gate ${gate} · Terminal ${terminal}` : `Gate ${gate}`, detail: "Check boards for any last-minute changes", done: phase === "at-gate" || phase === "final-call" || phase === "departed" });
    } else {
      list.push({ icon: "🚪", text: "Check boards for your gate number", done: false });
    }

    if (tier?.priorityBoarding) {
      list.push({ icon: "🎖", text: "Priority boarding — board when your group is called", done: phase === "departed" });
    } else {
      list.push({ icon: "🛫", text: "Board when your group is called", done: phase === "departed" });
    }

    return list;
  }, [phase, airside, atAirport, hasLoungeAccess, gate, terminal, iata, lounges, tier, navSteps, minUntilDept]);

  if (phase === "off" || phase === "leave-soon") return null;

  const hasNavData = Boolean(iata && getAirportNav(iata));

  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
          {hasNavData ? `Step-by-step · ${iata}` : "Your airport path"}
        </p>
        {totalMinutes > 0 && !airside && (
          <span className="text-xs text-slate-400">~{totalMinutes} min to gate</span>
        )}
      </div>
      <div className="divide-y divide-slate-100 dark:divide-slate-800">
        {allSteps.map((step, i) => (
          <div key={i} className={`flex items-start gap-3 px-4 py-3 transition-opacity ${step.done ? "opacity-35" : ""}`}>
            <div className="flex flex-col items-center shrink-0 mt-0.5">
              <span className="text-base">{step.done ? "✅" : step.icon}</span>
              {i < allSteps.length - 1 && (
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mt-1" />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-0.5">
              <p className={`text-sm leading-snug ${step.done ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
                {step.text}
              </p>
              {step.detail && !step.done && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{step.detail}</p>
              )}
              {step.minutes !== undefined && step.minutes > 0 && !step.done && (
                <p className="text-[11px] text-slate-400 mt-0.5">~{step.minutes} min</p>
              )}
            </div>
          </div>
        ))}
      </div>
      {hasNavData && (
        <div className="px-4 py-2 border-t border-slate-100 dark:border-slate-800">
          <p className="text-[10px] text-slate-400">Routing based on {iata} layout · Always verify on airport boards</p>
        </div>
      )}
    </div>
  );
}
/* ─── Pre-flight checklist ───────────────────────────────────── */
function PreFlightChecklist() {
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const items = [
    { icon: "🪪", text: "Passport / ID in your carry-on" },
    { icon: "📱", text: "Boarding pass downloaded" },
    { icon: "🔋", text: "Phone charged" },
    { icon: "💊", text: "Medications in personal item" },
    { icon: "💳", text: "Cards + local currency" },
    { icon: "🔑", text: "House / hotel keys" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 space-y-2">
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">Before you leave</p>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          onClick={() => setChecked(prev => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; })}
          className={`w-full flex items-center gap-3 rounded-xl px-3 py-2 text-left transition ${
            checked.has(i) ? "bg-emerald-50 dark:bg-emerald-500/10" : "hover:bg-slate-50 dark:hover:bg-slate-800"
          }`}
        >
          <div className={`h-5 w-5 shrink-0 rounded-full border-2 flex items-center justify-center ${
            checked.has(i) ? "border-emerald-500 bg-emerald-500" : "border-slate-300 dark:border-slate-600"
          }`}>
            {checked.has(i) && <span className="text-white text-[10px] font-bold">✓</span>}
          </div>
          <span className="text-base">{item.icon}</span>
          <span className={`text-sm ${checked.has(i) ? "line-through text-slate-400" : "text-slate-800 dark:text-slate-200"}`}>
            {item.text}
          </span>
        </button>
      ))}
    </div>
  );
}
