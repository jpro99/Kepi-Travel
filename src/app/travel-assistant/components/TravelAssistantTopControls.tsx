"use client";

import { UserButton } from "@clerk/nextjs";

type TripStage = "readiness" | "pre-departure" | "airport" | "arrival" | "recovery";
type TripStatus = "green" | "yellow" | "red";
type GuidanceTone = "subtle" | "standard";

interface TravelAssistantTopControlsProps {
  tripStatus: TripStatus;
  statusBadgeByTripStatus: Record<TripStatus, string>;
  statusLabelByTripStatus: Record<TripStatus, string>;
  tripStage: TripStage;
  stageLabelByTripStage: Record<TripStage, string>;
  leaveByMinutes: number;
  reviewQueueLength: number;
  operationalConfidenceScore: number;
  blockingIssueCount: number;
  guidanceTone: GuidanceTone;
  suppressedNudgeCount: number;
  lastSessionRestoreAt: string | null;
  formatClock: (value: string | null) => string;
  onTripStageChange: (nextStage: TripStage) => void;
  onTripStatusChange: (nextStatus: TripStatus) => void;
  onGuidanceToneChange: (nextTone: GuidanceTone) => void;
  minutesToDeparture: number;
  onMinutesToDepartureChange: (minutes: number) => void;
  onEvaluateStatus: () => void;
}

const TRIP_STAGES: TripStage[] = ["readiness", "pre-departure", "airport", "arrival", "recovery"];
const TRIP_STATUS_OPTIONS: TripStatus[] = ["green", "yellow", "red"];

export function TravelAssistantTopControls({
  tripStatus,
  statusBadgeByTripStatus,
  statusLabelByTripStatus,
  tripStage,
  stageLabelByTripStage,
  leaveByMinutes,
  reviewQueueLength,
  operationalConfidenceScore,
  blockingIssueCount,
  guidanceTone,
  suppressedNudgeCount,
  lastSessionRestoreAt,
  formatClock,
  onTripStageChange,
  onTripStatusChange,
  onGuidanceToneChange,
  minutesToDeparture,
  onMinutesToDepartureChange,
  onEvaluateStatus,
}: TravelAssistantTopControlsProps) {
  return (
    <section className="overflow-hidden rounded-3xl border border-slate-700/70 bg-gradient-to-br from-slate-900 via-slate-900 to-indigo-950/40 shadow-2xl shadow-indigo-950/30">
      <div className="grid gap-5 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-300">Adaptive Travel Assistant</p>
            <div className="rounded-full border border-slate-700 bg-slate-900/70 p-1">
              <UserButton />
            </div>
          </div>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
            Premium trip execution for families, with anti-miss safeguards.
          </h1>
          <p className="max-w-3xl text-sm text-slate-300">
            Stage-adaptive controls, confidence-aware imports, recovery playbooks, static exports, and consent-based
            family location sharing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${statusBadgeByTripStatus[tripStatus]}`}>
              {statusLabelByTripStatus[tripStatus]} ({tripStatus.toUpperCase()})
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
              Stage: {stageLabelByTripStage[tripStage]}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
              Leave-by buffer: {leaveByMinutes} min
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
              Review queue: {reviewQueueLength}
            </span>
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-indigo-100 ring-1 ring-indigo-300/40">
              Confidence score: {operationalConfidenceScore}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
              Blocking issues: {blockingIssueCount}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-300 ring-1 ring-slate-700">
              Nudges: {guidanceTone} • filtered {suppressedNudgeCount}
            </span>
            {lastSessionRestoreAt ? (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-100 ring-1 ring-violet-400/40">
                Session restored: {formatClock(lastSessionRestoreAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-700 bg-slate-900/60 p-4">
          <p className="text-sm font-semibold text-slate-100">Trip-state editor (live)</p>
          <p className="mt-1 text-xs text-slate-400">Controls update status and screens in real time.</p>
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>Operational confidence</span>
              <span>{operationalConfidenceScore}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-800">
              <div
                className={`h-full rounded-full ${
                  operationalConfidenceScore >= 80
                    ? "bg-emerald-400"
                    : operationalConfidenceScore >= 60
                      ? "bg-amber-400"
                      : "bg-red-400"
                }`}
                style={{ width: `${operationalConfidenceScore}%` }}
              />
            </div>
          </div>
          <div className="mt-3 space-y-3 text-sm">
            <label className="block">
              <span className="mb-1 block text-slate-300">Trip stage</span>
              <select
                value={tripStage}
                onChange={(event) => onTripStageChange(event.target.value as TripStage)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              >
                {TRIP_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabelByTripStage[stage]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Trip status</span>
              <select
                value={tripStatus}
                onChange={(event) => onTripStatusChange(event.target.value as TripStatus)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              >
                {TRIP_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabelByTripStatus[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Guidance tone</span>
              <select
                value={guidanceTone}
                onChange={(event) => onGuidanceToneChange(event.target.value as GuidanceTone)}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2"
              >
                <option value="subtle">Subtle (reduced interruption)</option>
                <option value="standard">Standard</option>
              </select>
              <p className="mt-1 text-xs text-slate-400">
                Subtle mode deduplicates repeated nudges and slows non-critical prompts.
              </p>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-300">Minutes to departure-critical event</span>
              <input
                type="range"
                min={20}
                max={360}
                value={minutesToDeparture}
                onChange={(event) => onMinutesToDepartureChange(Number(event.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-slate-400">{minutesToDeparture} minutes</div>
            </label>
            <button
              type="button"
              onClick={onEvaluateStatus}
              className="w-full rounded-lg bg-cyan-500/90 px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-cyan-400"
            >
              Auto-evaluate status from risk
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
