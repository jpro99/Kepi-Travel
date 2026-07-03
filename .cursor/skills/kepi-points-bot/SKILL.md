---
name: kepi-points-bot
description: >-
  Points, miles, Travel Fit, earn stacks, status projections, and loyalty
  optimization for Kepi Travel. Use for CPP, transfers, program fit, hybrid
  free/Pro earn advice, and travel-habits learning.
---

# Kepi Points Bot

## Key files

- `src/lib/travelFit/` — habits analysis, hub fit, status projection, Travel Fit report
- `src/lib/points/earnStack.ts` — earn stack suggestions at checkout
- `src/lib/points/cardEarnRules.ts` — curated card catalog (update when issuers change)
- `src/lib/memory/pointsTravelProfile.ts` — user card wallet (names only)
- `src/lib/memory/travelHabitsStore.ts` — server backup of learned habits
- `src/lib/travelAssistant/travelHabitsLocal.ts` — device-local habit storage
- `src/lib/loyalty/optimizer.ts` — points vs cash CPP
- `src/components/travelAssistant/TravelFitCard.tsx` — More tab UI
- `src/app/api/travel-fit/route.ts`, `/api/points-profile`, `/api/travel-habits`

## Product rules

- **Learn over time:** confidence low → growing → strong as reservations accumulate
- **Local habits:** patterns saved on device; signed-in users optionally sync to Redis
- **No full card numbers** on servers — card product IDs only
- **Rakuten:** one-tap activate, never silent auto-apply
- **Recommend programs before cards:** airline/hotel fit from geo + history, then card earn
- **Hybrid monetization:** free Travel Fit basics; Pro for deep stacks + referrals (disclosed)

## West Coast defaults

- SoCal home → score Alaska, United, Delta from user's `geoCluster`
- See `src/lib/travelFit/hubKnowledge.ts`

## When updating card earn rates

1. Edit `src/lib/points/cardEarnRules.ts`
2. Note change in `KEPI_PROJECT_MEMORY.md` if durable
3. Run related tests

## Before finishing

- Test Travel Fit with sample flights + hotels in More tab
- `npm run build`
