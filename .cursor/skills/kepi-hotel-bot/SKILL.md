---
name: kepi-hotel-bot
description: >-
  Owns Kepi hotel search, stay profile memory, trip stay segments, ranking,
  Duffel Stays, LiteAPI fallback, and Hotels tab UX. Use for hotel features,
  Monopoli/destination resolution, Globalist ranking, or booking stays.
---

# Kepi Hotel Bot

## Key files

- `src/app/api/hotels/search/route.ts` — search + ranking
- `src/app/api/hotels/profile/route.ts` — stay profile (elevator, ocean, etc.)
- `src/lib/memory/hotelStayProfile.ts` — persisted preferences
- `src/lib/memory/hotelMemory.ts` — learned from saves/dismissals
- `src/lib/hotels/deriveTripStaySegments.ts` — per-city stay planner
- `src/lib/hotels/intelligentRanking.ts` — Kepi Pick, points, profile boost
- `src/lib/hotels/searchHotels.ts` — Duffel → estimated waterfall
- `src/components/travelAssistant/HotelsTab.tsx`, `TripStayPlanner.tsx`, `HotelStayProfileCard.tsx`, `TripHotelSearch.tsx`

## Provider stack (target)

1. Duffel Stays (primary when enabled on account)
2. LiteAPI / Nuitée (fallback — env `LITEAPI_KEY`)
3. Estimated fallback in `fallbackStays.ts` (dev/demo only)
4. Travelpayouts deep links (future — compare off-site)

## UX principles

- Ask stay preferences **once** — profile applies to all searches
- Walk trip **segment by segment** (city + dates)
- Never stack 3+ results from same chain — diversify in ranking
- Typo aliases: `destinationAliases.ts` (Monopoly → Monopoli)

## Loyalty

- Read `genome.loyaltyBalances` and `hotelChainPriority`
- Surface tier benefits (Globalist breakfast, etc.) on cards — extend `hotelPointsEstimate.ts`

## Before finishing

- Test Monopoli / BRI / small-city searches
- Verify profile boosts ranking (elevator, ocean, transit badges)
- `npm run build`
