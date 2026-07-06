import { bestCardForContext } from "@/lib/points/cardEarnRules";
import type { PointsTravelProfile } from "@/lib/memory/pointsTravelProfile";
import type { EarnStackSuggestion, LearnedTravelHabits } from "@/lib/travelFit/types";

export function suggestEarnStack(input: {
  context: "hotel" | "flight" | "general";
  habits: LearnedTravelHabits;
  pointsProfile: PointsTravelProfile | null;
  topHotelChain?: string;
  topAirline?: string;
}): EarnStackSuggestion {
  const chain = input.topHotelChain ?? input.habits.topHotelChains[0]?.chain ?? "your hotel";
  const airline = input.topAirline ?? input.habits.topAirlines[0]?.label ?? "your airline";
  const ownedCards = input.pointsProfile?.ownedCards.map((c) => c.cardId) ?? [];
  const usesRakuten = input.pointsProfile?.usesRakuten ?? false;

  const contextLabel =
    input.context === "hotel"
      ? `${chain} hotel booking`
      : input.context === "flight"
        ? `${airline} flight`
        : "travel purchase";

  const cardHint = bestCardForContext(ownedCards, contextLabel);

  const steps: string[] = [];
  if (input.context === "hotel") {
    steps.push(`Book direct with ${chain} so elite nights and points post correctly.`);
    if (cardHint) {
      steps.push(`Pay with ${cardHint.card.name} — ${cardHint.reason}.`);
    } else if (ownedCards.length === 0) {
      steps.push("Add your cards in Kepi so we can suggest the best one for this stay.");
    }
    if (usesRakuten) {
      steps.push(
        "Activate Rakuten before checkout — e.g. open Rakuten, then Instacart or your shopping portal, then pay with your best card.",
      );
    }
  } else {
    steps.push(`Credit the flight to ${airline} — matches your recent travel pattern.`);
    if (cardHint) steps.push(`Pay with ${cardHint.card.name} — ${cardHint.reason}.`);
  }

  return {
    headline: input.habits.confidence === "low" ? "Earn stack (gets smarter with each trip)" : "Suggested earn stack for this booking",
    steps,
    cardHint: cardHint
      ? { cardId: cardHint.card.id, cardName: cardHint.card.name, reason: cardHint.reason, estimatedMultiplier: cardHint.reason }
      : null,
    portalHint: usesRakuten ? "Rakuten: activate before portal checkout if you skip direct booking." : null,
    disclaimer: "Kepi suggests — you choose. Cashback portals and affiliate links usually don't stack; we show the best total value path.",
  };
}
