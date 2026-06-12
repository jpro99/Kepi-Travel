import type { TravelerGenome } from "@/lib/traveler/types";
import type { DecisionQuestion } from "@/lib/decision/types";
import type { TravelStrategy } from "@/lib/decision/types";

export function buildQuestionBudget(
  strategies: TravelStrategy[],
  genome: TravelerGenome,
): DecisionQuestion[] {
  const questions: DecisionQuestion[] = [];
  const sorted = [...strategies].sort((a, b) => b.scores.tvs - a.scores.tvs);
  const top = sorted[0];
  const second = sorted[1];
  if (!top || !second) return questions;

  const repositionWins =
    top.kind === "reposition_award" ||
    (second.kind === "reposition_award" && Math.abs(top.scores.tvs - second.scores.tvs) < 8);

  if (repositionWins && genome.toleratesRepositioning === undefined) {
    questions.push({
      id: "q-reposition",
      prompt: "Willing to reposition for better value?",
      stakes: `This decides whether ${top.title} or ${second.title} wins.`,
      flipsRanking: Math.abs(top.scores.tvs - second.scores.tvs) < 6,
      options: [
        { id: "yes", label: "Yes — save money/time with repositioning", genomeOverride: "willing_to_reposition" },
        { id: "no", label: "No — keep it simple from home airport", genomeOverride: "not_willing_to_reposition" },
      ],
    });
  }

  if (!genome.toleratesRepositioning && top.kind === "reposition_award") {
    questions.push({
      id: "q-reposition-blocked",
      prompt: "Your profile says no repositioning — reconsider for this trip?",
      stakes: "Reposition Play saves ~$1,400 on this routing.",
      flipsRanking: true,
      options: [
        { id: "yes", label: "Yes, for this trip", genomeOverride: "willing_to_reposition" },
        { id: "no", label: "Keep direct only", genomeOverride: "not_willing_to_reposition" },
      ],
    });
  }

  const instrumentPlay = strategies.find((s) => s.kind === "instrument_play");
  if (instrumentPlay && instrumentPlay.instrumentsUsed.some((i) => !i.optimal)) {
    questions.push({
      id: "q-cert",
      prompt: "Use upgrade or suite certificates on this trip?",
      stakes: "Certificate timing affects hotel and cabin strategy.",
      flipsRanking: false,
      options: [
        { id: "yes", label: "Use certs when advantageous" },
        { id: "no", label: "Save instruments for a higher-value trip" },
      ],
    });
  }

  if (genome.tripCount >= 2) {
    questions.push({
      id: "q-playbook",
      prompt: "Same playbook as your last similar trip?",
      stakes: "Skips re-asking airport and flexibility questions.",
      flipsRanking: false,
      options: [
        { id: "same", label: "Same playbook — go" },
        { id: "new", label: "Try something different" },
      ],
    });
  }

  return questions.slice(0, 2);
}

export function applyPriorityWeights(
  strategies: TravelStrategy[],
  comfortWeight: number,
): TravelStrategy[] {
  const valueWeight = 1 - comfortWeight;
  return strategies
    .map((s) => {
      const blended =
        s.scores.comfortScore * comfortWeight +
        s.scores.valueScore * valueWeight +
        s.scores.statusScore * 0.1;
      const tvs = Math.round(Math.min(100, blended));
      return {
        ...s,
        scores: { ...s.scores, tvs },
        recommended: false,
      };
    })
    .sort((a, b) => b.scores.tvs - a.scores.tvs)
    .map((s, i) => ({ ...s, recommended: i === 0 }));
}
