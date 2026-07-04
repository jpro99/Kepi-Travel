# Decision Engine / Command Deck

Two-stage analyze pipeline: **fast brief** (modeled strategies, no live providers) then optional **enrich** (topology, Duffel cash, Seats.aero awards).

## API routes

| Route | Auth | Live keys | Purpose |
|-------|------|-----------|---------|
| `POST /api/decision/strategies` | Optional | No | Fast brief — ranked strategies in &lt;1.5s |
| `POST /api/decision/enrich` | Optional | Optional | Topology wave + fused cash/award search |
| `POST /api/decision/flex-options` | Required | Optional | Top-3 date-flex options per strategy |
| `POST /api/flights/award-search` | Optional | Optional | Fused Duffel cash + Seats.aero awards |
| `POST /api/decision/stays` | Required | Optional | Hotel ranking for Command Deck |
| `POST /api/decision/activate` | Required | No | Persist chosen strategy → trip |

## Fast brief (`/api/decision/strategies`)

- Parses natural-language intent → `DecisionBrief` with up to 3 flight strategies (or full playbook in `planMode: "full"`).
- Ranks by **total trip value** (cash + imputed points at genome ¢/pt). Rank #1 gets `recommended: true`.
- Never calls Duffel, Seats.aero, or topology — verified by `route.test.ts` latency and absence of `topologySearch` / `fusedFlightSearch`.
- Anonymous users allowed; sign-in only required to save/activate.

**Sample request:**

```json
{
  "prompt": "on September 1st i want to fly from beaumont ca to new york",
  "planMode": "flights",
  "paymentMode": "cash",
  "comfortWeight": 0.55
}
```

## Enrich stage (`/api/decision/enrich`)

Second POST after fast brief when origin + destination are known. Adds:

- **Topology wave search** — multi-airport / date-shift routing (Duffel when configured).
- **Fused flight search** — delegates to `fusedFlightSearch()` (Duffel cash + Seats.aero awards).

Skips live providers when origin is missing (see `enrich/route.test.ts`).

## Flex options (`/api/decision/flex-options`)

Strategy-scoped or origin-scoped date flex. Returns top 3 options ranked by true cost.

| Strategy kind | Cash source | Award source |
|---------------|-------------|--------------|
| `direct_cash` | Live Duffel across date shifts (falls back to modeled) | — |
| `reposition_award` | Live Duffel feeder | `estimateAwardMiles()` + Seats.aero verify URL |
| `instrument_play` / `status_play` | Live where available | Modeled from genome instruments |

Implementation: `src/lib/decision/flexOptions.ts` · tests: `flex-options/route.test.ts`, `awardFlexEstimate.test.ts`.

## Award search (`/api/flights/award-search`)

Fused cash + award leaderboard for a single O&D + date. Used by Command Deck after enrich.

- **Cash:** `fetchDuffelCashOffers` (existing Duffel adapter)
- **Awards:** Seats.aero when `SEATS_AERO_*` env vars set; otherwise award count = 0 with graceful UI copy

Without live keys the UI still shows modeled playbook strategies (price, friction minutes, pre-crime risk warnings).

## UI tradeoffs (Command Deck)

`src/components/decision/CommandDeck.tsx` surfaces on each strategy card:

- **Price:** cash out, trip value, ¢/mi redemption, savings vs live fare
- **Time:** friction minutes badge
- **Risk:** pre-crime warnings (amber), instrument caveats
- **Score:** TVS dial (True Value Score)

Live pricing loads asynchronously via enrich — never blocks the fast brief.

## Tests

```bash
node --import tsx --test \
  src/app/api/decision/strategies/route.test.ts \
  src/app/api/decision/enrich/route.test.ts \
  src/app/api/decision/flex-options/route.test.ts \
  src/lib/decision/strategyRanking.test.ts \
  src/lib/decision/awardFlexEstimate.test.ts
```

Included in `npm run test:adapters` (ship gate).

## Manual smoke

```bash
node --import tsx scripts/debug-analyze-route.mjs "Beaumont California to Italy in September"
```

Command Deck UI: landing page embed (`LandingShell.tsx`) or production `/` → Analyze flow.
