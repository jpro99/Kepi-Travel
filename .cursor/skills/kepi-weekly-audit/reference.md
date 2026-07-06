# Weekly Audit — reference

## Known / accepted (do not re-flag)

Maintain the canonical list in `bot-deck/memory/conductor.md` § Known / accepted. Always read before auditing.

## Production signals checklist (read-only)

- `app-sitter/europe-2026-prod-pass.spec.ts` — Europe trip regression
- `npm run test:laws` / hotel law tests — pin/geo correctness
- Recent commits on `main` — what shipped vs. what Jeff still sees broken
- `KEPI_PROJECT_MEMORY.md` § Jeff — discuss first unless he says build

## Week 3 scope detail (points + card)

Include in critique when Week = 3:

| Area | Key paths |
|------|-----------|
| Travel Fit / habits | `src/lib/travelFit/`, `TravelFitCard.tsx`, `/api/travel-fit` |
| Card wallet | `PointsTravelProfileCard.tsx`, `pointsTravelProfile.ts`, `/api/points-profile` |
| Earn stack | `earnStack.ts`, Book tab earn hints |
| Benefit playbooks | `benefitPlaybooks.ts`, `loungeRules.ts`, `LoungeEntryGuide.tsx` |
| Points & miles learn | `PointsMilesLearnPanel.tsx`, More tab |
| Pricing display | `tripSpendSummary.ts`, `parseReservationCashUsd.ts`, `hydrateReservationQuotedPrice.ts` |

Delegate card catalog updates → `kepi-card-bot`. Program fit / Volare / status → `kepi-points-bot`. Lounge/airport → `kepi-airport-bot`.

## Handoff to Conductor

When Jeff approves item #N:

1. Conductor reads the audit file path from `conductor.md` log
2. Routes to owner bot from ranked table
3. Smallest shippable slice first
4. lint + build + push per `KEPI_PROJECT_MEMORY.md`
