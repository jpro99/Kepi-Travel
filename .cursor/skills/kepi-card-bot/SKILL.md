---
name: kepi-card-bot
description: >-
  Credit card earn categories and checkout card recommendations for Kepi Travel.
  Use when updating card catalog, suggesting which card to pay with, or card
  referral link disclosure.
---

# Kepi Card Bot

## Key files

- `src/lib/points/cardEarnRules.ts` — `CARD_CATALOG` (Chase, Hyatt, Alaska, Amex Plat)
- `src/lib/points/earnStack.ts` — picks best owned card for context
- `src/lib/memory/pointsTravelProfile.ts` — user's owned card IDs
- `src/components/travelAssistant/PointsTravelProfileCard.tsx`

## Rules

- **Never store PAN/CVV** — card product name + optional last 4 display only
- **Referral links:** only with clear disclosure; store in `cardReferralLinks` on profile
- **Update catalog** when Chase/Amex/Alaska change earn categories — quarterly minimum
- Card rec comes **after** Travel Fit airline/hotel program recommendation

## Card catalog maintenance

Add entries to `CARD_CATALOG` with:
- `id`, `name`, `issuer`
- `categories[]` with regex patterns + multiplier label
- `bestFor[]` one-line summary

## Delegate to

- Program fit / status → `kepi-points-bot`
- Hotel chain fit → `kepi-hotel-bot`
- Airline hub fit → `kepi-flight-bot`
