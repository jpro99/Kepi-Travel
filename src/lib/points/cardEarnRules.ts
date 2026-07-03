/** Curated earn rules for top travel cards — update via kepi-card-bot skill. */
export interface CardProduct {
  id: string;
  name: string;
  issuer: string;
  categories: Array<{ label: string; multiplier: string; patterns: RegExp[] }>;
  bestFor: string[];
}

export const CARD_CATALOG: CardProduct[] = [
  {
    id: "chase-sapphire-preferred",
    name: "Chase Sapphire Preferred",
    issuer: "Chase",
    categories: [
      { label: "travel via Chase", multiplier: "5x UR", patterns: [/portal|chase travel/i] },
      { label: "dining", multiplier: "3x UR", patterns: [/dining|restaurant/i] },
      { label: "travel direct", multiplier: "2x UR", patterns: [/airline|hotel|travel/i] },
    ],
    bestFor: ["Flexible UR transfers to Hyatt and airlines", "General travel + dining"],
  },
  {
    id: "chase-ink-business",
    name: "Chase Ink Business",
    issuer: "Chase",
    categories: [
      { label: "office supply / internet", multiplier: "5x UR", patterns: [/staples|office|internet|phone/i] },
      { label: "travel", multiplier: "2x UR", patterns: [/travel|airline|hotel/i] },
    ],
    bestFor: ["Staples gift card runs", "Business travel spend"],
  },
  {
    id: "hyatt-card",
    name: "World of Hyatt Credit Card",
    issuer: "Chase",
    categories: [
      { label: "Hyatt direct", multiplier: "4x Hyatt pts", patterns: [/hyatt/i] },
      { label: "dining", multiplier: "2x Hyatt pts", patterns: [/dining/i] },
    ],
    bestFor: ["Hyatt stays counting toward Globalist", "Free night awards"],
  },
  {
    id: "alaska-card",
    name: "Alaska Airlines Visa",
    issuer: "Bank of America",
    categories: [
      { label: "Alaska purchases", multiplier: "3x miles", patterns: [/alaska/i] },
      { label: "gas / transit / streaming", multiplier: "2x miles", patterns: [/gas|transit|streaming/i] },
    ],
    bestFor: ["Alaska companion fare", "West Coast Alaska flyers"],
  },
  {
    id: "amex-platinum",
    name: "Amex Platinum",
    issuer: "Amex",
    categories: [
      { label: "flights direct or Amex Travel", multiplier: "5x MR", patterns: [/flight|airline|amex travel/i] },
      { label: "hotels via Amex Travel", multiplier: "5x MR", patterns: [/amex travel.*hotel/i] },
    ],
    bestFor: ["Premium flights", "Lounge access"],
  },
];

export function findCard(id: string): CardProduct | undefined {
  return CARD_CATALOG.find((c) => c.id === id);
}

export function bestCardForContext(
  ownedCardIds: string[],
  contextLabel: string,
): { card: CardProduct; reason: string } | null {
  const owned = CARD_CATALOG.filter((c) => ownedCardIds.includes(c.id));
  if (owned.length === 0) return null;

  let best: { card: CardProduct; score: number; reason: string } | null = null;
  for (const card of owned) {
    for (const cat of card.categories) {
      if (cat.patterns.some((p) => p.test(contextLabel))) {
        const score = parseInt(cat.multiplier, 10) || 2;
        if (!best || score > best.score) {
          best = { card, score, reason: `${cat.multiplier} on ${cat.label}` };
        }
      }
    }
  }
  return best ? { card: best.card, reason: best.reason } : { card: owned[0]!, reason: owned[0]!.bestFor[0] ?? "Your default travel card" };
}
