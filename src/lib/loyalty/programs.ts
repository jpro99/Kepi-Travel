// Loyalty programs with real CPP (cents per point) valuations
// Based on industry valuations updated 2026

export interface LoyaltyProgram {
  id: string;
  name: string;
  shortName: string;
  type: "airline" | "hotel" | "transferable";
  color: string;
  emoji: string;
  iataCode?: string;         // for matching to flight results
  cppEstimate: number;       // cents per point baseline
  transferPartners?: string[]; // program IDs this transfers to
  expirationMonths?: number;  // 0 = never, 24 = 2 years
}

export const LOYALTY_PROGRAMS: LoyaltyProgram[] = [
  // Transferable currencies (most valuable)
  { id: "chase_ur", name: "Chase Ultimate Rewards", shortName: "Chase UR", type: "transferable", color: "#003087", emoji: "💳", cppEstimate: 1.8,
    transferPartners: ["united", "southwest", "british", "air_france", "singapore", "hyatt"], expirationMonths: 0 },
  { id: "amex_mr", name: "Amex Membership Rewards", shortName: "Amex MR", type: "transferable", color: "#006FCF", emoji: "💎", cppEstimate: 1.8,
    transferPartners: ["delta", "british", "air_france", "singapore", "emirates", "hilton", "marriott"], expirationMonths: 0 },
  { id: "citi_tt", name: "Citi ThankYou Points", shortName: "Citi TY", type: "transferable", color: "#003B70", emoji: "🔵", cppEstimate: 1.6,
    transferPartners: ["turkish", "singapore", "air_france", "jetblue"], expirationMonths: 0 },
  { id: "cap1_miles", name: "Capital One Miles", shortName: "Cap One", type: "transferable", color: "#D03027", emoji: "💰", cppEstimate: 1.5,
    transferPartners: ["air_france", "turkish", "singapore", "avianca"], expirationMonths: 0 },

  // US Airlines
  { id: "alaska", name: "Alaska Mileage Plan", shortName: "Alaska", type: "airline", color: "#01426A", emoji: "✈️", iataCode: "AS", cppEstimate: 1.5, expirationMonths: 24 },
  { id: "delta", name: "Delta SkyMiles", shortName: "Delta", type: "airline", color: "#E01933", emoji: "🔺", iataCode: "DL", cppEstimate: 1.1, expirationMonths: 0 },
  { id: "united", name: "United MileagePlus", shortName: "United", type: "airline", color: "#005DAA", emoji: "⭕", iataCode: "UA", cppEstimate: 1.3, expirationMonths: 0 },
  { id: "american", name: "AAdvantage", shortName: "American", type: "airline", color: "#CC0000", emoji: "🦅", iataCode: "AA", cppEstimate: 1.4, expirationMonths: 0 },
  { id: "southwest", name: "Southwest Rapid Rewards", shortName: "Southwest", type: "airline", color: "#304CB2", emoji: "💙", iataCode: "WN", cppEstimate: 1.4, expirationMonths: 24 },
  { id: "jetblue", name: "JetBlue TrueBlue", shortName: "JetBlue", type: "airline", color: "#003876", emoji: "💎", iataCode: "B6", cppEstimate: 1.3, expirationMonths: 0 },

  // International Airlines
  { id: "british", name: "British Airways Avios", shortName: "BA Avios", type: "airline", color: "#075AAA", emoji: "🇬🇧", iataCode: "BA", cppEstimate: 1.4, expirationMonths: 36 },
  { id: "air_france", name: "Air France Flying Blue", shortName: "Flying Blue", type: "airline", color: "#003087", emoji: "🇫🇷", iataCode: "AF", cppEstimate: 1.3, expirationMonths: 24 },
  { id: "singapore", name: "Singapore KrisFlyer", shortName: "KrisFlyer", type: "airline", color: "#00234B", emoji: "🦁", iataCode: "SQ", cppEstimate: 1.6, expirationMonths: 36 },
  { id: "turkish", name: "Turkish Miles&Smiles", shortName: "Turkish", type: "airline", color: "#E30613", emoji: "🇹🇷", iataCode: "TK", cppEstimate: 1.5, expirationMonths: 36 },
  { id: "avianca", name: "Avianca LifeMiles", shortName: "LifeMiles", type: "airline", color: "#CC0000", emoji: "✈️", iataCode: "AV", cppEstimate: 1.4, expirationMonths: 0 },
  { id: "emirates", name: "Emirates Skywards", shortName: "Emirates", type: "airline", color: "#CC0000", emoji: "🇦🇪", iataCode: "EK", cppEstimate: 1.1, expirationMonths: 36 },

  // Hotels
  { id: "hyatt", name: "World of Hyatt", shortName: "Hyatt", type: "hotel", color: "#5C0632", emoji: "🏨", cppEstimate: 2.0, expirationMonths: 24 },
  { id: "marriott", name: "Marriott Bonvoy", shortName: "Bonvoy", type: "hotel", color: "#8A1538", emoji: "🏰", cppEstimate: 0.7, expirationMonths: 24 },
  { id: "hilton", name: "Hilton Honors", shortName: "Hilton", type: "hotel", color: "#003F5F", emoji: "⬛", cppEstimate: 0.5, expirationMonths: 0 },
  { id: "ihg", name: "IHG One Rewards", shortName: "IHG", type: "hotel", color: "#003F87", emoji: "🔷", cppEstimate: 0.5, expirationMonths: 12 },
];

export function getProgramById(id: string): LoyaltyProgram | undefined {
  return LOYALTY_PROGRAMS.find(p => p.id === id);
}

export function getProgramsByType(type: LoyaltyProgram["type"]): LoyaltyProgram[] {
  return LOYALTY_PROGRAMS.filter(p => p.type === type);
}

export function getProgramByIata(iata: string): LoyaltyProgram | undefined {
  return LOYALTY_PROGRAMS.find(p => p.iataCode === iata.toUpperCase());
}
