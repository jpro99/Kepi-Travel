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

**G10 — Trip tab shows actionable booking gaps**  
When hotels, flights, or transport are still unbooked, the Trips header must list clickable fix items (e.g. "Book hotel in Monopoli") — never "all good" while planning gaps remain.

**Test:** `src/lib/travelAssistant/tripActionItems.test.ts`

**G11 — Post-booking confirmation**  
After a successful hotel checkout or manual reservation with a confirmation code, show a confirmation card with ref # and "Added to your trip timeline" — not toast alone.

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

**F7 — Multi-hop bookings satisfy planned legs**  
A booked path (e.g. MUC→FCO→SEA→ONT) must satisfy a planned direct leg (MUC→ONT) in itinerary self-check — never flag as unbooked when a valid connection chain exists.

**Test:** `src/lib/travelAssistant/itineraryPathCoverage.test.ts`, `src/lib/travelAssistant/itinerarySelfCheck.test.ts`

**F8 — Email pricing parses exchange totals**  
Forwarded airline exchange emails must surface **New Ticket Value** per passenger even when **Total due = $0**; miles spent/earned parsed when present.

**Test:** `src/lib/travelAssistant/parseReservationCashUsd.test.ts`

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

**H10 — Live price honesty**  
Dollar amounts on cards require a **bookable offer id** (`bookOfferId`). Indicative partner rates show **"From $X"**. Estimated/catalog inventory shows **"Check site"** — never a fake nightly price.

**Test:** `src/lib/hotels/__tests__/hotelLiveRate.test.ts`, `src/lib/hotels/__tests__/hotelCardDisplay.test.ts`

**H11 — Budget slider moves both ways**  
The nightly budget slider uses independent draggable thumbs (min and max). Neither thumb may steal pointer events from the other.

**Test:** `src/lib/hotels/__tests__/priceRangeSlider.test.ts`

**H12 — Points mode shows chain hotels without wallet balance**  
Points pay mode must list Hyatt, Marriott, Hilton, and IHG properties when they appear in search results. Catalog points estimates (~X pts) are shown even when the traveler has no loyalty balances saved — booking happens on the chain site.

**Test:** `src/lib/hotels/__tests__/hotelPointsEstimate.test.ts`

---

## MAP LAWS

**M1 — 50 km render cap**  
Same as **H1**: no pin or list item beyond 50 km from search center. Enforced in `filterHotelsWithinRenderDistance` + coord trust.

**Test:** `src/lib/hotels/__tests__/hotelDistance.test.ts`

**M2 — Reject untrusted provider coordinates**  
If provider lat/lng fails trust check (ocean, swapped lat/lng, too far), use synthetic placement near city center — never plot in water. Offshore drift within the trust radius (common at Polignano / Monopoli) is rejected via `isLikelyOffshorePin`.

**Test:** `src/lib/hotels/hotelCoordinates.test.ts`, `src/lib/hotels/__tests__/hotelOffshore.test.ts`

**M3 — Small towns use tight radius**  
Destinations like Monopoli use **≤1.6 km** trusted coord radius; synthetic pins stay in town, not the Adriatic.

**Test:** `src/lib/hotels/hotelCoordinates.test.ts`

**M4 — Geolocation denial is safe**  
Map and family location features must not crash when GPS permission is denied or stale.

**M5 — Map legend stays quiet**  
Gold + grayscale only on map chrome. Transit toggles and Refine — no competing green/blue/yellow chip rows.

**M6 — Streets default for hotel stay map**  
Hotel search map defaults to streets view (rail/transit readable); satellite is optional toggle.

**M7 — Family sharing survives refresh**  
GPS permission errors or transient watch failures must **never** persist `kepi:family-sharing-off`. Only an explicit user **Stop sharing** may opt out.

**Test:** `src/lib/family/geolocationQuality.test.ts`

**M8 — Precise fix replaces coarse mis-pin**  
When a more accurate GPS reading arrives (e.g. house after Wi‑Fi placed the pin in a park), accept the correction even after a large jump. Never lock the first coarse bootstrap pin when a precise fix is available.

**Test:** `src/lib/family/locationFixUpgrade.test.ts`, `src/lib/family/geolocationQuality.test.ts`

---

## ITINERARY LAWS

**I1 — Plan is a first-class tab**  
Day-by-day planning lives on the **Plan** (`itinerary`) consumer tab — not a hidden sidebar. Trip tab stays operational (countdown, Next Up); Plan tab owns timeline + calendar.

**I2 — Vertical timeline, inline expand**  
Each trip day is one collapsed row. Tap expands details inline below the row — not a modal. Full editing opens only via **Edit plan**.

**I3 — Status dots are deterministic**  
Gray = empty · Emerald = covered · Amber = needs booking · Red = gap/integrity issue on that day.

**I4 — Calendar and timeline stay in sync**  
Active day and highlighted leg sync via shared `selectedDateKey` / `highlightedLegId` in the travel-assistant shell. Tapping a calendar day scrolls the Plan timeline; legend clicks jump to Plan and scroll to the leg start.

**I8 — Calendar leg colors from trip data**  
Leg colors are derived from `buildTripLegModel()` — chronological destination legs from stay cities and reservations. Never hardcode colors to specific city names.

**Test:** `src/lib/travelAssistant/tripLegColors.test.ts`

**I9 — Calendar is its own tab**  
The leg-colored calendar lives on the **Calendar** consumer tab at full width — not split beside the Plan timeline on the same view.

**I5 — Mission cards for unbooked stays**  
Unbooked hotel gaps render as photo-backed mission cards with one gold CTA — not inline to-do rows.

**I6 — Connection warnings slide in**  
Gap/connection alerts on Plan tab are slide-in banners (auto-dismiss ~8s), not permanent inline boxes.

**I7 — City photos are curated only**  
Destination backgrounds use static Unsplash photo IDs from `cityPhotos.ts` — never live random Unsplash source URLs.

---

## DATA / API LAWS

**D1 — Build gate**  
Design-law tests run on every build: `npm run test:laws` (wired into `prebuild`). Failed law test = failed build. CI ship-gate runs the same bundle.

**D9 — Verification gate before ship**  
`npm run verify:ship` must pass locally before push: design-law tests + full production build. No exceptions — failed Vercel builds cost real credits.

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
| H10 | `src/lib/hotels/__tests__/hotelLiveRate.test.ts` |
| H11 | `src/lib/hotels/__tests__/priceRangeSlider.test.ts` |
| H12 | `src/lib/hotels/__tests__/hotelPointsEstimate.test.ts` |
| M2, M3 | `src/lib/hotels/hotelCoordinates.test.ts` |
| M2 | `src/lib/hotels/__tests__/hotelOffshore.test.ts` |
| M7, M8 | `src/lib/family/geolocationQuality.test.ts` |
| M8 | `src/lib/family/locationFixUpgrade.test.ts` |
| F7 | `src/lib/travelAssistant/itineraryPathCoverage.test.ts` |
| F7 | `src/lib/travelAssistant/itinerarySelfCheck.test.ts` |
| F8 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts` |
| G8 | `src/lib/travelAssistant/dayPlanLines.test.ts` |
| G10 | `src/lib/travelAssistant/tripActionItems.test.ts` |
| I8 | `src/lib/travelAssistant/tripLegColors.test.ts` |

New laws must add a row here when a test exists.
