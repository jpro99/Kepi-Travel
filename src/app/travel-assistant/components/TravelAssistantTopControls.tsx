"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useClerk, useUser } from "@clerk/nextjs";
import { LanguageToggle } from "@/components/LanguageToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Logo } from "@/components/ui/Logo";

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
  toggleDisruption: () => void; // Added for testing
}

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
  toggleDisruption,
}: TravelAssistantTopControlsProps) {
  const { user } = useUser();
  const clerk = useClerk();
  const [isAdmin, setIsAdmin] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);

  const avatarLabel =
    user?.firstName?.slice(0, 1)?.toUpperCase() ??
    user?.primaryEmailAddress?.emailAddress?.slice(0, 1)?.toUpperCase() ??
    "U";

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
    <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-xl">
      <div className="grid gap-5 p-5 sm:gap-6 sm:p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <Logo size="sm" />
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
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAvatarMenuOpen((value) => !value)}
                  className="flex h-10 w-10 items-center justify-center rounded-full bg-cyan-500 text-sm font-bold text-slate-950 shadow-sm ring-1 ring-cyan-300"
                  aria-label="Open account menu"
                >
                  {avatarLabel}
                </button>
                {avatarMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-40 w-72 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    <div className="mt-2 rounded-xl bg-slate-100 p-2 dark:bg-slate-950">
                      <p className="mb-2 px-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Language</p>
                      <LanguageToggle />
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setAvatarMenuOpen(false);
                        void clerk.signOut();
                      }}
                      className="mt-2 w-full rounded-xl px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-500/10"
                    >
                      Sign out
                    </button>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <h1 className="text-3xl font-semibold leading-tight md:text-4xl">
            Premium trip execution for families, with anti-miss safeguards.
          </h1>
          <p className="max-w-3xl text-sm text-slate-200">
            Stage-adaptive controls, confidence-aware imports, recovery playbooks, static exports, and consent-based
            family location sharing.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-3 py-1 text-sm font-medium ring-1 ${statusBadgeByTripStatus[tripStatus]}`}>
              {statusLabelByTripStatus[tripStatus]}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100 ring-1 ring-slate-700">
              Stage: {stageLabelByTripStage[tripStage]}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100 ring-1 ring-slate-700">
              Leave-by buffer: {leaveByMinutes} min
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100 ring-1 ring-slate-700">
              Review queue: {reviewQueueLength}
            </span>
            <span className="rounded-full bg-indigo-500/20 px-3 py-1 text-sm text-indigo-100 ring-1 ring-indigo-400/40">
              Confidence score: {operationalConfidenceScore}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100 ring-1 ring-slate-700">
              Blocking issues: {blockingIssueCount}
            </span>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-sm text-slate-100 ring-1 ring-slate-700">
              Nudges: {guidanceTone} • filtered {suppressedNudgeCount}
            </span>
            {lastSessionRestoreAt ? (
              <span className="rounded-full bg-violet-500/20 px-3 py-1 text-sm text-violet-100 ring-1 ring-violet-400/40">
                Session restored: {formatClock(lastSessionRestoreAt)}
              </span>
            ) : null}
            {/* Test-only button to trigger disruption */}
                        <button id="test-trigger-disruption" onClick={toggleDisruption} className="rounded-full bg-red-500/20 px-3 py-1 text-sm text-red-100 ring-1 ring-red-400/40">
              Trigger Disruption
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
