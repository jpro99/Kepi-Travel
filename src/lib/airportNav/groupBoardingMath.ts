import type { JourneyPhaseId } from "@/lib/airportNav/journeyMachine";
import {
  computeBoardingPressure,
  type BoardingPressure,
  type BoardingVerdict,
} from "@/lib/airportNav/boardingMath";
import { humanJourneyPhaseLabel, journeyPhaseRank } from "@/lib/family/familyAirportSync";

export interface GroupMemberBoardingInput {
  memberId: string;
  name: string;
  phase: JourneyPhaseId;
  throughSecurity: boolean;
  walkToGateSeconds?: number | null;
}

export interface GroupBoardingPressure {
  groupSpareMinutes: number;
  verdict: BoardingVerdict;
  line: string;
  straggler: { memberId: string; name: string; phase: JourneyPhaseId; spareMinutes: number } | null;
  members: Array<{
    memberId: string;
    name: string;
    phase: JourneyPhaseId;
    pressure: BoardingPressure;
  }>;
}

const DEFAULT_SECURITY_WAIT_SEC = 15 * 60;
const SECURITY_LINE_SEC = 8 * 60;

function securityWaitForPhase(phase: JourneyPhaseId, throughSecurity: boolean): number {
  if (throughSecurity) return 0;
  if (phase === "security") return SECURITY_LINE_SEC;
  if (phase === "landside" || phase === "checkin") return DEFAULT_SECURITY_WAIT_SEC;
  return 0;
}

/** Phase-based walk estimate when no graph route exists for a member. */
export function estimatedWalkToGateSeconds(
  phase: JourneyPhaseId,
  explicit?: number | null,
): number | null {
  if (explicit != null && Number.isFinite(explicit)) return explicit;
  switch (phase) {
    case "boarding_soon":
    case "at_gate":
      return 2 * 60;
    case "lounge":
      return 5 * 60;
    case "airside":
      return 8 * 60;
    case "security":
      return 12 * 60;
    case "checkin":
      return 16 * 60;
    case "landside":
      return 18 * 60;
    default:
      return 18 * 60;
  }
}

export function computeGroupBoardingPressure(
  members: GroupMemberBoardingInput[],
  minutesToDeparture: number,
): GroupBoardingPressure | null {
  if (members.length === 0) return null;

  const evaluated = members.map((member) => {
    const pressure = computeBoardingPressure({
      minutesToDeparture,
      walkToGateSeconds: estimatedWalkToGateSeconds(member.phase, member.walkToGateSeconds),
      securityWaitSeconds: securityWaitForPhase(member.phase, member.throughSecurity),
      throughSecurity: member.throughSecurity,
    });
    return { ...member, pressure };
  });

  const slowest = evaluated.reduce((worst, current) =>
    current.pressure.spareMinutes < worst.pressure.spareMinutes ? current : worst,
  );

  const groupSpareMinutes = slowest.pressure.spareMinutes;
  const verdict = slowest.pressure.verdict;

  const straggler =
    evaluated.length > 1 && groupSpareMinutes < 25
      ? {
          memberId: slowest.memberId,
          name: slowest.name,
          phase: slowest.phase,
          spareMinutes: slowest.pressure.spareMinutes,
        }
      : null;

  let line: string;
  if (verdict === "at_risk") {
    line =
      evaluated.length > 1
        ? `Group at risk — ${slowest.name} is ${humanJourneyPhaseLabel(slowest.phase).toLowerCase()} (${Math.abs(groupSpareMinutes)}m short)`
        : slowest.pressure.line;
  } else if (straggler) {
    line = `${slowest.name} is the slowest (${humanJourneyPhaseLabel(slowest.phase).toLowerCase()}) — ${groupSpareMinutes}m group slack`;
  } else {
    line = `${groupSpareMinutes}m spare for everyone`;
  }

  return {
    groupSpareMinutes,
    verdict,
    line,
    straggler,
    members: evaluated.map(({ memberId, name, phase, pressure }) => ({
      memberId,
      name,
      phase,
      pressure,
    })),
  };
}

/** Member furthest behind in the journey (by phase rank). */
export function findJourneyStraggler(
  members: Array<{ memberId: string; name: string; phase: JourneyPhaseId }>,
): { memberId: string; name: string; phase: JourneyPhaseId } | null {
  if (members.length < 2) return null;
  const sorted = [...members].sort((a, b) => journeyPhaseRank(a.phase) - journeyPhaseRank(b.phase));
  const slowest = sorted[0];
  const fastest = sorted[sorted.length - 1];
  if (!slowest || !fastest || slowest.memberId === fastest.memberId) return null;
  if (journeyPhaseRank(fastest.phase) - journeyPhaseRank(slowest.phase) < 2) return null;
  return slowest;
}
