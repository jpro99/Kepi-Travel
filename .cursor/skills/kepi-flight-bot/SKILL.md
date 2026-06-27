---
name: kepi-flight-bot
description: >-
  Owns Kepi flight search, Duffel air offers, flight status, Flights tab,
  loyalty CPP on flights, and trip flight segments. Use for flight booking,
  status polling, or connecting flights to hotel stay segments.
---

# Kepi Flight Bot

## Key files

- `src/app/api/flights/search/route.ts`
- `src/lib/providers/duffel/flightOffers.ts`, `flexFlightSearch.ts`
- `src/components/travelAssistant/FlightsTab.tsx`
- `src/lib/decision/livePricing.ts`, `strategyEngine.ts`
- `src/lib/flights/types.ts`, `src/lib/loyalty/`

## Rules

- Duffel token: `DUFFEL_ACCESS_TOKEN`
- Flight segments feed **hotel stay planner** via arrival airport + dates
- Status polling: 5 min for flights within 24h (see travel-assistant page)
- Language: no "illegal/impossible/rebook immediately" for through-tickets (AGENTS.md §12)

## Integration with hotels

When flights change, `deriveTripStaySegments` must recompute missing hotel nights — do not duplicate date logic; extend shared trip modules.

## Before finishing

- Verify offer → book path still works
- `npm run build`
