"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserButton } from "@clerk/nextjs";
import { ThemeToggle } from "@/components/ThemeToggle";

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
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const checkAdminAccess = async (): Promise<void> => {
      try {
        const response = await fetch("/api/admin/health?probe=1", {
          method: "GET",
          cache: "no-store",
        });
        if (!cancelled) {
          setIsAdmin(response.ok);
        }
      } catch {
        if (!cancelled) {
          setIsAdmin(false);
        }
      }
    };
    void checkAdminAccess();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-white via-slate-50 to-indigo-100/40 shadow-xl dark:border-slate-700/70 dark:from-slate-900 dark:via-slate-900 dark:to-indigo-950/40 dark:shadow-2xl dark:shadow-indigo-950/30">
      <div className="grid gap-5 p-5 sm:gap-6 sm:p-6 lg:grid-cols-[1.8fr_1fr]">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <p className="text-xs uppercase tracking-[0.24em] text-cyan-700 dark:text-cyan-300">Adaptive Travel Assistant</p>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              {isAdmin ? (
                <Link
                  href="/admin"
                  className="rounded-full border border-indigo-300 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-100 dark:border-indigo-500/40 dark:bg-indigo-500/20 dark:text-indigo-100 dark:hover:bg-indigo-500/30"
                >
                  Admin
                </Link>
              ) : null}
              <div className="rounded-full border border-slate-200 bg-white/80 p-1 dark:border-slate-700 dark:bg-slate-900/70">
                <UserButton />
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
            Premium trip execution for families, with anti-miss safeguards.
          </h1>
          <p className="max-w-3xl text-sm text-slate-700 dark:text-slate-300">
            Stage-adaptive controls, confidence-aware imports, recovery playbooks, static exports, and consent-based
            family location sharing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${statusBadgeByTripStatus[tripStatus]}`}>
              {statusLabelByTripStatus[tripStatus]} ({tripStatus.toUpperCase()})
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              Stage: {stageLabelByTripStage[tripStage]}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              Leave-by buffer: {leaveByMinutes} min
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              Review queue: {reviewQueueLength}
            </span>
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-indigo-800 ring-1 ring-indigo-300/40 dark:text-indigo-100">
              Confidence score: {operationalConfidenceScore}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              Blocking issues: {blockingIssueCount}
            </span>
            <span className="rounded-full bg-slate-200 px-3 py-1 text-sm text-slate-700 ring-1 ring-slate-300 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700">
              Nudges: {guidanceTone} • filtered {suppressedNudgeCount}
            </span>
            {lastSessionRestoreAt ? (
              <span className="rounded-full bg-violet-500/15 px-3 py-1 text-sm text-violet-800 ring-1 ring-violet-400/40 dark:text-violet-100">
                Session restored: {formatClock(lastSessionRestoreAt)}
              </span>
            ) : null}
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white/70 p-4 dark:border-slate-700 dark:bg-slate-900/60">
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Trip-state editor (live)</p>
          <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Controls update status and screens in real time.</p>
          <div className="mt-3 rounded-lg border border-slate-200 bg-slate-100/70 p-3 dark:border-slate-700 dark:bg-slate-950/60">
            <div className="flex items-center justify-between text-xs text-slate-700 dark:text-slate-300">
              <span>Operational confidence</span>
              <span>{operationalConfidenceScore}%</span>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-slate-300 dark:bg-slate-800">
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
              <span className="mb-1 block text-slate-700 dark:text-slate-300">Trip stage</span>
              <select
                value={tripStage}
                onChange={(event) => onTripStageChange(event.target.value as TripStage)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {TRIP_STAGES.map((stage) => (
                  <option key={stage} value={stage}>
                    {stageLabelByTripStage[stage]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-700 dark:text-slate-300">Trip status</span>
              <select
                value={tripStatus}
                onChange={(event) => onTripStatusChange(event.target.value as TripStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                {TRIP_STATUS_OPTIONS.map((status) => (
                  <option key={status} value={status}>
                    {statusLabelByTripStatus[status]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-700 dark:text-slate-300">Guidance tone</span>
              <select
                value={guidanceTone}
                onChange={(event) => onGuidanceToneChange(event.target.value as GuidanceTone)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
              >
                <option value="subtle">Subtle (reduced interruption)</option>
                <option value="standard">Standard</option>
              </select>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">
                Subtle mode deduplicates repeated nudges and slows non-critical prompts.
              </p>
            </label>
            <label className="block">
              <span className="mb-1 block text-slate-700 dark:text-slate-300">Minutes to departure-critical event</span>
              <input
                type="range"
                min={20}
                max={360}
                value={minutesToDeparture}
                onChange={(event) => onMinutesToDepartureChange(Number(event.target.value))}
                className="w-full"
              />
              <div className="mt-1 text-xs text-slate-600 dark:text-slate-400">{minutesToDeparture} minutes</div>
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
