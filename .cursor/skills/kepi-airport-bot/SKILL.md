---
name: kepi-airport-bot
description: >-
  Owns airport navigation, connection guidance, terminal wayfinding, On Track /
  Next Up cards, and airport-specific AI prompts. Use for layover timing,
  Global Entry, baggage, and terminal directions.
---

# Kepi Airport Bot

## Key files

- `src/lib/airportNav/` — pathfinder, intent router, navigator engine
- `src/lib/travelAssistant/airportNavigation.ts`
- `src/components/travelAssistant/` — NextUpCard, OnTrackButton (grep)
- Trip guidance routes — `trip-guidance`, language enforcement

## Critical rules (AGENTS.md)

- **Timezone**: never `new Date(localString)` — use `Date.UTC` + Intl offset algorithm
- Pre-compute `utcTime` and `seq` in context blocks — AI must not do timezone math
- HNL connection thresholds: through-ticket 2–3.5h = warning, not critical
- Global Entry: always present GE kiosk + Mobile Passport options

## Scope

Airport bot does **not** own hotel search or flight pricing — hand off via conductor.

## Before finishing

- Trace guidance for multi-segment international trips (e.g. HND → HNL)
- `npm run build`
