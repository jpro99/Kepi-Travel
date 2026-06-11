import type { TravelerGenome } from "@/lib/traveler/types";

/** Default Southern California traveler: Alaska MVP Gold + Hyatt Globalist. */
export function createSampleGenome(userId: string): TravelerGenome {
  const now = new Date().toISOString();
  return {
    userId,
    homeRegion: "Southern California",
    geoCluster: [
      { iata: "SNA", name: "John Wayne", driveMinutes: 20, isPrimary: true },
      { iata: "LAX", name: "Los Angeles Intl", driveMinutes: 45 },
      { iata: "ONT", name: "Ontario Intl", driveMinutes: 35 },
      { iata: "BUR", name: "Hollywood Burbank", driveMinutes: 40 },
      { iata: "SAN", name: "San Diego Intl", driveMinutes: 90 },
    ],
    statuses: [
      {
        program: "Mileage Plan",
        airline: "Alaska Airlines",
        tier: "MVP Gold",
        alliance: "Oneworld",
        expiresAt: "2026-12-31",
        loungeAccess: true,
        prioritySecurity: true,
        freeCheckedBags: 2,
      },
      {
        program: "World of Hyatt",
        hotelChain: "Hyatt",
        tier: "Globalist",
        expiresAt: "2026-02-28",
        loungeAccess: false,
        prioritySecurity: false,
        freeCheckedBags: 0,
      },
    ],
    pointsBalances: [
      { program: "Alaska Mileage Plan", balance: 180_000, baselineCpp: 1.8 },
      { program: "Chase Ultimate Rewards", balance: 95_000, transferableFrom: ["Hyatt", "United", "Airlines"], baselineCpp: 1.5 },
      { program: "World of Hyatt", balance: 42_000, baselineCpp: 1.7 },
    ],
    instruments: [
      {
        id: "inst-globalist-suite-1",
        type: "suite_certificate",
        program: "World of Hyatt",
        label: "Globalist Suite Upgrade Certificate",
        quantity: 2,
        expiresAt: "2026-03-15",
        estimatedValueUsd: 800,
      },
      {
        id: "inst-as-guest-upgrade",
        type: "guest_upgrade",
        program: "Alaska Mileage Plan",
        label: "Guest Upgrade Certificate",
        quantity: 1,
        expiresAt: "2026-12-31",
        estimatedValueUsd: 450,
      },
    ],
    decisionWeights: { comfort: 0.55, value: 0.35, status: 0.1 },
    hotelChainPriority: ["Hyatt", "Marriott", "Hilton"],
    cabinPreference: "business",
    toleratesRepositioning: true,
    toleratesRedeye: false,
    prefersNonstop: false,
    corrections: [],
    tripCount: 0,
    updatedAt: now,
  };
}
