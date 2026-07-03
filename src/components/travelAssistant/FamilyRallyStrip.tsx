"use client";

import type { JourneyPhaseId } from "@/lib/airportNav/journeyMachine";
import type { GroupBoardingPressure } from "@/lib/airportNav/groupBoardingMath";
import {
  humanJourneyPhaseLabel,
  type FamilyAirportSyncDocument,
  type FamilyRally,
} from "@/lib/family/familyAirportSync";

interface RallyMember {
  id: string;
  name: string;
  color: string;
}

interface FamilyRallyStripProps {
  members: RallyMember[];
  myMemberId: string | null;
  sync: FamilyAirportSyncDocument | null;
  groupBoarding: GroupBoardingPressure | null;
  activeRally: FamilyRally | null;
  gateCode: string | null;
  iata: string;
  busy?: boolean;
  onSetPhase: (phase: JourneyPhaseId) => void;
  onSetRallyAtGate: () => void;
  onCancelRally: () => void;
  compact?: boolean;
}

const PHASE_BUTTONS: { phase: JourneyPhaseId; label: string }[] = [
  { phase: "security", label: "At security" },
  { phase: "airside", label: "Through security" },
  { phase: "lounge", label: "At lounge" },
  { phase: "at_gate", label: "At gate" },
];

function verdictColor(verdict: string): string {
  if (verdict === "comfortable") return "text-emerald-300";
  if (verdict === "tight") return "text-amber-300";
  if (verdict === "sprint") return "text-orange-300";
  return "text-red-300";
}

export function FamilyRallyStrip({
  members,
  myMemberId,
  sync,
  groupBoarding,
  activeRally,
  gateCode,
  iata,
  busy = false,
  onSetPhase,
  onSetRallyAtGate,
  onCancelRally,
  compact = false,
}: FamilyRallyStripProps) {
  if (members.length < 2) return null;

  const journeys = sync?.journeys ?? {};
  const hasAnyJourney = members.some((m) => journeys[m.id]);

  return (
    <div
      data-testid="family-rally-strip"
      className={
        compact
          ? "pointer-events-auto rounded-2xl border border-white/10 bg-black/60 p-3 backdrop-blur-md"
          : "pointer-events-auto mx-3 rounded-2xl border border-white/15 bg-black/70 p-3 shadow-xl backdrop-blur-md"
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-sky-200/90">
          👪 Family journey
        </p>
        {groupBoarding ? (
          <p className={`text-[11px] font-bold ${verdictColor(groupBoarding.verdict)}`}>
            {groupBoarding.line}
          </p>
        ) : null}
      </div>

      <ul className="mt-2 space-y-1.5">
        {members.map((member) => {
          const journey = journeys[member.id];
          const isMe = member.id === myMemberId;
          return (
            <li
              key={member.id}
              data-testid={`family-journey-row-${member.id}`}
              className="flex items-center gap-2 rounded-xl bg-white/5 px-2.5 py-1.5"
            >
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white"
                style={{ background: member.color }}
              >
                {member.name.charAt(0).toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{member.name}</span>
              <span className="text-xs font-medium text-sky-100/85">
                {journey ? humanJourneyPhaseLabel(journey.phase) : isMe ? "Tap status below" : "No update yet"}
              </span>
            </li>
          );
        })}
      </ul>

      {groupBoarding?.straggler ? (
        <p className="mt-2 text-xs font-semibold text-amber-200" data-testid="family-straggler-callout">
          ⏱ Slowest: {groupBoarding.straggler.name} ({humanJourneyPhaseLabel(groupBoarding.straggler.phase).toLowerCase()})
        </p>
      ) : null}

      {activeRally?.status === "active" ? (
        <div
          className="mt-3 rounded-xl border border-[#f4c95d]/40 bg-[#f4c95d]/10 px-3 py-2"
          data-testid="family-rally-active"
        >
          <p className="text-xs font-bold text-[#f4c95d]">
            Rally: {activeRally.target.label}
            {activeRally.createdByName ? ` · set by ${activeRally.createdByName}` : ""}
          </p>
          <button
            type="button"
            disabled={busy}
            onClick={onCancelRally}
            className="mt-1 text-[10px] font-semibold text-sky-100/80 underline"
          >
            Cancel rally
          </button>
        </div>
      ) : (
        <button
          type="button"
          data-testid="family-rally-at-gate"
          disabled={busy || !gateCode}
          onClick={onSetRallyAtGate}
          className="mt-3 w-full rounded-xl bg-[#f4c95d] px-3 py-2.5 text-sm font-bold text-[#0b1f3a] disabled:opacity-50"
        >
          📍 Rally at {gateCode ? `Gate ${gateCode.toUpperCase()}` : "gate"} ({iata})
        </button>
      )}

      <div className="mt-3">
        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">My status</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {PHASE_BUTTONS.map(({ phase, label }) => (
            <button
              key={phase}
              type="button"
              data-testid={`family-phase-${phase}`}
              disabled={busy}
              onClick={() => onSetPhase(phase)}
              className="rounded-full border border-sky-400/35 bg-sky-600/80 px-2.5 py-1 text-[10px] font-bold text-white active:opacity-90 disabled:opacity-50"
            >
              {label}
            </button>
          ))}
        </div>
        {!hasAnyJourney && myMemberId ? (
          <p className="mt-1.5 text-[10px] text-slate-400">One tap updates your family — no GPS guesswork.</p>
        ) : null}
      </div>
    </div>
  );
}
