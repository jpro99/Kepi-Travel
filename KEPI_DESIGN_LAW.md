# KEPI_DESIGN_LAW.md

Permanent product and engineering rules for Kepi Travel. **Append only — never remove.**

When a bug is reported (especially via screenshot): fix it, add a one-line law in the correct section, add/update a test, verify build.

---

## GLOBAL LAWS (apply everywhere, always)

**G1 — Append-only laws**  
This file only grows. Never delete or rewrite a law. When scope changes, add a clarifying line under the same law number.

**G2 — Screenshot feedback protocol**  
When Jeff sends a screenshot and asks "what's wrong":
1. Analyze the image — layout, hierarchy, spacing, broken states.
2. Report top 3 problems ranked by severity.
3. Fix them.
4. Add one law + test per fix (in the correct section below).
5. State which laws were added.

**G3 — Never claim fixed without proof**  
Every code change must pass `npm run lint` and `npm run build`. Domain tests (`npm run test:hotels`, etc.) must pass before push.

**G4 — Visual system (Apple-grade)**  
One accent: **Kepi gold `#f4c95d`**. Everything else grayscale or navy `#0b1f3a`.  
Cards float on `#fafafa` (light) or deep navy (dark) with soft shadows and **16px+ rounded corners** — no hard 1px boxes around everything.  
Generous whitespace: **≥20px padding inside cards**, **≥16px between cards**.  
One large bold headline per surface; secondary text muted; no competing mid-weight labels.  
No yellow apology boxes. No shouting counters ("110 hidden"). Filters live behind **Refine**, not stacked control rows.

**G5 — Inventory must never vanish silently**  
If upstream data returns **N > 0** items, the UI must show **≥ 1** unless the user explicitly filtered to zero via Refine. Auto-relax and explain quietly — never an empty screen with inventory in memory.

**G6 — Safe IDs**  
Never use raw `crypto.randomUUID()` / `randomUUID()`. Always `@/lib/utils/generateId`.

**G8 — Spaces must work while typing**  
Free-text inputs (itinerary day lines, trip prompts, stay-style notes) must preserve spaces on every keystroke. Never trim line bodies during live `onChange` — only trim when parsing intent for display logic.

**Test:** `src/lib/travelAssistant/dayPlanLines.test.ts`

---

## FLIGHTS LAWS

**F1 — No alarmist connection language**  
Never headline "illegal", "impossible", or "rebook immediately" for through-tickets. Present factual options (make connection vs protect with insurance/time buffer).

**F2 — AI never does timezone math**  
Pre-compute `utcTime` and `seq` in context blocks. Use `Date.UTC` + `Intl` offset algorithm — never `new Date(localTimeString)` (browser TZ pollutes UTC).

**F3 — Missing arrival times stay missing**  
When arrival is not stored, show `[not stored — do not estimate]`. AI and UI must not invent arrival clocks.

**F4 — Through-ticket connection thresholds**  
Short connections on through-tickets (e.g. HNL 2–3.5h) are **warnings**, not critical panic, unless separate tickets.

**F5 — Flight changes update stays**  
When flights change, hotel stay segments recompute via shared trip modules (`deriveTripStaySegments`) — do not duplicate date logic in flight-only code.

**F6 — Status polling scope**  
Auto flight-status polling only for flights within 24h; must not spam or crash when provider is down.

---

## HOTELS LAWS

**H1 — No ocean hotels**  
No hotel may render with coordinates more than **50 km** from the search city center. Bad provider coords are dropped; synthetic coords stay within trusted radius.

**Test:** `src/lib/hotels/__tests__/hotelDistance.test.ts`

**H2 — Never zero when inventory exists**  
If the API returns **N > 0** hotels, the UI must display **at least 1**. If strict filters would hide everything, relax the narrowest filter and show: *"Showing all N — none matched your exact style, ranked closest first."*

**Test:** `src/lib/hotels/__tests__/hotelSearchFilters.test.ts`

**H3 — Every card has a hero image**  
Every hotel card shows a photo **or** a branded gradient fallback with hotel initials. No broken image icons. No empty image boxes.

**Test:** `src/lib/hotels/__tests__/hotelCardDisplay.test.ts`

**H4 — No broken price display**  
No result renders with `"undefined"`, `"NaN"`, or an empty price label. Browse-only / missing rates show **"Check site"**.

**Test:** `src/lib/hotels/__tests__/hotelCardDisplay.test.ts`

**H5 — Stay style is opt-in hard filter**  
Saved stay-profile preferences rank and explain matches but do **not** hard-hide results until the traveler taps **Refine → Apply**. Profile load alone never zeroes the list.

**Test:** `src/lib/hotels/__tests__/hotelSearchFilters.test.ts`

**H6 — Three picks first**  
After search, show **3 ranked hotels immediately**. Only city + dates above them. All other filters behind **Refine**.

**H7 — Hotel card hierarchy (strict)**  
Hero photo/gradient → name (large bold) → stars + guest score (muted, one line) → price/night (gold) + total (muted) → **one** match reason (emerald) → max 3 amenity icons → full-width gold **Select →**.

**H8 — Stay profile asked once**  
Elevator, transit, ocean, budget preferences persist in `hotelStayProfile` and apply to ranking across searches — not re-asked every city.

**H9 — Chain diversity**  
Never stack 3+ results from the same chain in top picks; diversify in ranking.

---

## MAP LAWS

**M1 — 50 km render cap**  
Same as **H1**: no pin or list item beyond 50 km from search center. Enforced in `filterHotelsWithinRenderDistance` + coord trust.

**Test:** `src/lib/hotels/__tests__/hotelDistance.test.ts`

**M2 — Reject untrusted provider coordinates**  
If provider lat/lng fails trust check (ocean, swapped lat/lng, too far), use synthetic placement near city center — never plot in water.

**Test:** `src/lib/hotels/hotelCoordinates.test.ts`

**M3 — Small towns use tight radius**  
Destinations like Monopoli use **≤1.6 km** trusted coord radius; synthetic pins stay in town, not the Adriatic.

**Test:** `src/lib/hotels/hotelCoordinates.test.ts`

**M4 — Geolocation denial is safe**  
Map and family location features must not crash when GPS permission is denied or stale.

**M5 — Map legend stays quiet**  
Gold + grayscale only on map chrome. Transit toggles and Refine — no competing green/blue/yellow chip rows.

**M6 — Streets default for hotel stay map**  
Hotel search map defaults to streets view (rail/transit readable); satellite is optional toggle.

---

## DATA / API LAWS

**D1 — Build gate**  
Hotel design-law tests run on every build: `npm run test:hotels` (wired into `prebuild`). Failed law test = failed build.

**D2 — Redis lazy init**  
No `Redis.fromEnv()` at module top level. All KV access inside lazy functions with try/catch degrade.

**D3 — Search routes return ranked inventory**  
`/api/hotels/search` must return `hotels[]` with `rank`, `fitScore`, and live or browse-only pricing — never an empty array when provider has inventory without an explicit error.

**D4 — Profile API is idempotent**  
`GET/POST /api/hotels/profile` degrades safely for anonymous users; never 500 on missing KV.

**D5 — Provider waterfall**  
Hotels: Duffel Stays → LiteAPI → estimated fallback (dev/demo). Fail one provider, continue — do not blank the UI.

**D6 — Timezone in API responses**  
Server-side context for AI routes includes pre-computed UTC fields; clients display local labels with explicit timezone where stored.

**D7 — No secrets in client bundles**  
Provider tokens (`DUFFEL_ACCESS_TOKEN`, `LITEAPI_KEY`, etc.) stay server-only. Browser gets public keys only.

**D8 — Email HTML via render**  
Resend emails use `@react-email/render` → `html:` — never `react:` prop or `renderToStaticMarkup`.

---

## Test index

| Law | Test file |
|-----|-----------|
| H1, M1 | `src/lib/hotels/__tests__/hotelDistance.test.ts` |
| H2, H5 | `src/lib/hotels/__tests__/hotelSearchFilters.test.ts` |
| H3, H4 | `src/lib/hotels/__tests__/hotelCardDisplay.test.ts` |
| M2, M3 | `src/lib/hotels/hotelCoordinates.test.ts` |
| G8 | `src/lib/travelAssistant/dayPlanLines.test.ts` |

New laws must add a row here when a test exists.
