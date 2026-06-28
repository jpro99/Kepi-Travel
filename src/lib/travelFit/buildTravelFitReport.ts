import { analyzeTravelHabits, habitsLearningCopy } from "@/lib/travelFit/analyzeTravelHabits";
import { hubFitScore, isWestCoastHome, WEST_COAST_HUBS } from "@/lib/travelFit/hubKnowledge";
import { buildStatusProjections } from "@/lib/travelFit/statusProjection";
import { suggestEarnStack } from "@/lib/points/earnStack";
import type { LoyaltyBalance } from "@/lib/loyalty/optimizer";
import { normalizeLoyaltyBalances } from "@/lib/loyalty/walletBalances";
import type { PointsTravelProfile } from "@/lib/memory/pointsTravelProfile";
import type {
  LearnedTravelHabits,
  ProgramFitScore,
  TravelFitReport,
  TravelFitReservation,
} from "@/lib/travelFit/types";
import type { TravelerGenome } from "@/lib/traveler/types";

function scoreAirlinePrograms(habits: LearnedTravelHabits, genome: TravelerGenome): ProgramFitScore[] {
  const homeAirports = genome.geoCluster.map((a) => a.iata.toUpperCase());
  const westCoast = isWestCoastHome(genome.homeRegion, homeAirports);
  const topCode = habits.topAirlines[0]?.airlineCode;

  return WEST_COAST_HUBS.map((hub) => {
    let score = hubFitScore(hub.airlineCode, homeAirports);
    const reasons: string[] = [];
    const cautions: string[] = [];

    if (habits.topAirlines.some((a) => a.airlineCode === hub.airlineCode)) {
      score += 15;
      const share = habits.topAirlines.find((a) => a.airlineCode === hub.airlineCode)?.share ?? 0;
      reasons.push(`You already fly ${hub.label} on ~${share}% of segments we see`);
    }

    if (genome.statuses.some((s) => s.airline?.includes(hub.label.split(" ")[0] ?? ""))) {
      score += 10;
      reasons.push(`You hold status with ${hub.label}`);
    }

    if (westCoast && hub.primaryAirports.some((a) => homeAirports.includes(a))) {
      reasons.push(`Strong from your home airports (${homeAirports.filter((a) => hub.primaryAirports.includes(a)).join(", ") || "nearby"})`);
    }

    hub.strengths.slice(0, 1).forEach((s) => reasons.push(s));

    if (topCode && topCode !== hub.airlineCode && habits.confidence !== "low") {
      const top = habits.topAirlines[0];
      if (top && top.share >= 50) {
        cautions.push(`${top.label} dominates your history — switching has a loyalty cost`);
      }
    }

    return {
      program: hub.label,
      kind: "airline" as const,
      score: Math.min(100, score),
      recommended: false,
      reasons,
      cautions,
    };
  })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, recommended: index === 0 }));
}

function scoreHotelPrograms(habits: LearnedTravelHabits, genome: TravelerGenome): ProgramFitScore[] {
  const chains = ["Hyatt", "Marriott", "Hilton", "IHG"];
  const priority = genome.hotelChainPriority ?? [];

  return chains
    .map((chain) => {
      let score = 40;
      const reasons: string[] = [];
      const cautions: string[] = [];
      const habit = habits.topHotelChains.find((h) => h.chain === chain);
      const priorityIndex = priority.indexOf(chain);

      if (habit) {
        score += habit.stayCount * 8;
        reasons.push(`${habit.stayCount} stay${habit.stayCount === 1 ? "" : "s"} in your history`);
      }
      if (priorityIndex >= 0) {
        score += (3 - priorityIndex) * 10;
        reasons.push(`In your preferred chains (#${priorityIndex + 1})`);
      }
      if (genome.statuses.some((s) => s.hotelChain === chain || s.program.includes(chain))) {
        score += 15;
        reasons.push(`You already have ${chain} status`);
      }
      if (habits.typicalHotelNightlyUsd != null && chain === "Hyatt") {
        reasons.push(`Fits your ~$${habits.typicalHotelNightlyUsd}/night comfort zone with strong elite perks`);
      }
      if (!habit && habits.confidence === "strong") {
        cautions.push("We haven't seen many stays here yet");
      }

      return {
        program: chain,
        kind: "hotel" as const,
        score: Math.min(100, score),
        recommended: false,
        reasons,
        cautions,
      };
    })
    .sort((a, b) => b.score - a.score)
    .map((item, index) => ({ ...item, recommended: index === 0 }));
}

function topRecommendation(
  airline: ProgramFitScore | undefined,
  hotel: ProgramFitScore | undefined,
  habits: LearnedTravelHabits,
): string {
  if (habits.confidence === "low") {
    return "Keep using Kepi for your next trip — we'll learn your airlines, hotels, and price sweet spot automatically.";
  }
  const air = airline?.recommended ? airline.program : null;
  const stay = hotel?.recommended ? hotel.program : null;
  if (air && stay) {
    return `For how you travel from ${habits.primaryHomeAirports[0] ?? "home"}, ${air} + ${stay} look like the best fit based on your airports and stay history.`;
  }
  return "Your travel fit profile is building — check back after your next booking.";
}

export function buildTravelFitReport(input: {
  userId: string;
  reservations: TravelFitReservation[];
  genome: TravelerGenome;
  pointsProfile?: PointsTravelProfile | null;
  storedHabits?: Partial<LearnedTravelHabits> | null;
  loyaltyBalances?: LoyaltyBalance[] | null;
}): TravelFitReport {
  const homeAirports = input.genome.geoCluster.map((a) => a.iata);
  const habits = analyzeTravelHabits({
    userId: input.userId,
    reservations: input.reservations,
    homeAirports,
    storedHabits: input.storedHabits,
  });

  if (input.pointsProfile?.typicalHotelNightlyUsd) {
    habits.typicalHotelNightlyUsd = input.pointsProfile.typicalHotelNightlyUsd;
  }

  const airlineFit = scoreAirlinePrograms(habits, input.genome);
  const hotelFit = scoreHotelPrograms(habits, input.genome);

  const loyaltyBalances = normalizeLoyaltyBalances(
    input.loyaltyBalances ?? input.genome.loyaltyBalances ?? [],
  );

  const statusProjections = buildStatusProjections({
    loyaltyBalances,
    reservations: input.reservations,
    statuses: input.genome.statuses,
    typicalNightlyUsd: habits.typicalHotelNightlyUsd,
  });

  const hasHotelBooking = input.reservations.some((r) => r.type === "hotel");
  const earnStackPreview = hasHotelBooking
    ? suggestEarnStack({
        context: "hotel",
        habits,
        pointsProfile: input.pointsProfile ?? null,
        topHotelChain: hotelFit[0]?.program,
        topAirline: airlineFit[0]?.program,
      })
    : null;

  return {
    generatedAt: new Date().toISOString(),
    habits,
    learningMessage: habitsLearningCopy(habits),
    airlineFit,
    hotelFit,
    statusProjections,
    topRecommendation: topRecommendation(airlineFit[0], hotelFit[0], habits),
    earnStackPreview,
  };
}
