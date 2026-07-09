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

**G12 — Trip health is one strip, not stacked toasts**  
Gap alerts and missing-pricing counts merge into a single inline `TripHealthStrip` on Home and Plan — collapsed summary by default, expandable list. Never stack multiple fixed floating banners over content.

**G13 — Trip health actions land in context**  
When a gap action is "Add hotel", Kepi must open Book → Hotels with city and dates prefilled from the gap — not a generic empty search.

**Test:** `src/lib/travelAssistant/gapDetectionService.test.ts`, `src/lib/travelAssistant/europe2026TripPass.test.ts`

**G14 — Multi-leg bookings share one price**  
When several flight legs share a confirmation code or the same forwarded email, trip spend counts the booking total once and sibling legs must not each show "need pricing" or require per-leg cash breakdown.

**Test:** `src/lib/travelAssistant/tripSpendSummary.test.ts`

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

**F9 — Flight status freshness is phase-aware**  
Within **6 hours** of departure, client and server polls must run at least every **90 seconds** when the app is open or a background sweep is active. Between 6–24 hours, **5 minutes** is acceptable. Primary source is **AeroDataBox**; optional **FlightAware AeroAPI** merges when configured — discrepancies are logged, never silently discarded.

**Test:** `src/lib/travelAssistant/flightStatusCadence.test.ts`, `src/lib/travelAssistant/flightStatusMerge.test.ts`

**F10 — Check-in handoff is honest**  
Check-in prompts open at **24h before departure**. Kepi may deep-link to airline check-in or a stored Wallet/pass URL — never render a scannable barcode it does not hold. UI must state where the boarding pass actually lives.

**Test:** `src/lib/travelAssistant/checkInHandoff.test.ts`

**F11 — Boarding pass URLs come from imports**  
When a forwarded confirmation includes a boarding-pass or Wallet link, persist it on the flight reservation and surface it in check-in handoff — never invent pass URLs.

**Test:** `src/lib/travelAssistant/reservationLinks.test.ts`, `src/lib/travelAssistant/europe2026TripPass.test.ts`

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

**M9 — Ground transport uses honest deep links first**  
Uber/Lyft actions must prefill pickup/dropoff from known trip locations via universal deep links. Native in-app ride booking is deferred until a partner API is approved — never fake a booked ride.

**Test:** `src/lib/travelAssistant/groundTransportDeepLinks.test.ts`

---

## ITINERARY LAWS

**I1 — Home is a first-class tab**  
Day-by-day planning lives on the **Plan** (`itinerary`) consumer tab — not a hidden sidebar. **Home** (`trip` URL param) stays operational: cinematic hero (destination photo + route globe), journey assist, Next Up, trip health strip, quick actions to Book/Plan/Map. **Book** owns full flight/hotel inventory. Plan tab owns timeline + calendar. Never show a flat reservation dump on Home.

**I2 — Vertical timeline, inline expand**  
Each trip day is one collapsed row. Tap expands details inline below the row — not a modal. Full editing opens only via **Edit plan**.

**I3 — Status dots are meaningful or absent**  
Emerald = fully sorted · Amber = action needed (no hotel, gap) · Blue = travel day · Red = problem detected. Gray dots with no meaning are banned.

**I4 — Calendar and timeline stay in sync (SYNC LAW)**  
Tapping any calendar day must scroll the Trip timeline to that exact date. Tapping a timeline day must highlight that date in the calendar. These views are always in sync via shared `selectedDateKey` / `highlightedLegId` / `scrollToDateKey` in the travel-assistant shell.

**I8 — Calendar leg colors from trip data (COLOR LAW)**  
Trip leg colors are derived from the order legs appear in trip data via `buildTripLegs()`. Travel days are always `#4A6FA5`. Stay legs cycle the palette. Colors are never hardcoded to specific city names.

**Test:** `src/lib/travelAssistant/tripLegColors.test.ts`, `src/lib/travelAssistant/buildTripLegs.test.ts`

**I10 — Never "nothing planned yet" on Plan tab**  
Every day within the trip window shows context: travel days show flight cards; stay days show destination and weather. The phrase "nothing planned yet" is permanently banned from the Plan timeline.

**I11 — Plan tab uses destination blocks**  
The Plan timeline renders **place-first chapters**: a trip route overview (city names), then each destination block as the hero with inbound travel collapsed above it. Travel labels use city names (`Fly to Rome · 2 flights`, `Return home`) — never raw airport chains as headlines. Collapsible destination blocks (leg-colored left border, photo header, day sub-rows with weather + hotel). Mission cards for unbooked hotels appear inside the relevant destination block — not stacked above the timeline.

**I12 — No duplicate flights in travel blocks**  
Duplicate flights must never appear. Always deduplicate by `flightNumber` + `departureTime` before rendering travel cards.

**Test:** `src/lib/travelAssistant/buildTripLegs.test.ts`

**I13 — Destination block photos required**  
Destination blocks must always show city photos at 15% opacity. Primary: `source.unsplash.com`; if it fails, use `picsum.photos/seed/{city}` fallback.

**I14 — Destination border matches calendar leg color**  
Left border color on destination blocks must always match the calendar leg color for that destination (3px solid, same hex as `buildTripLegs` assignment).

**I15 — Stay night counts use checkout math**  
Display nights as `(checkOut − checkIn)` in whole days — not inclusive calendar day count. A stay Sep 12–Sep 24 shows 12 nights, not 13.

**I16 — Light theme by default**  
Kepi uses a light theme by default. Dark backgrounds are used only for the trip header banner. All content cards are white or `#F5F5F7`. Color is an accent, never a background fill.

**I17 — Calendar auto height and leg color separation**  
Calendar container height must always be auto — never fixed. It shrinks to its content. No two adjacent trip legs may use visually similar colors. Colors must be distinguishable at a glance without reading the labels.

**Test:** `src/lib/travelAssistant/buildTripLegs.test.ts`

**I9 — Calendar is a Plan sub-view**  
The leg-colored calendar lives inside the **Plan** tab as a Timeline | Calendar toggle — not a separate bottom-nav tab. Legacy `?tab=calendar` URLs must redirect to Plan with calendar view open.

**I5 — Mission cards for unbooked stays**  
Unbooked hotel gaps render as photo-backed mission cards with one gold CTA — not inline to-do rows.

**I6 — Connection warnings slide in**  
Gap/connection alerts on Plan tab are slide-in banners (auto-dismiss ~8s), not permanent inline boxes.

**I7 — City photos are curated only**  
Destination backgrounds use static Unsplash photo IDs from `cityPhotos.ts` — never live random Unsplash source URLs.

**I18 — Edit buttons must work**  
Every Edit button must open an actual edit interface. No Edit button may exist without a wired action. An Edit button that does nothing when tapped is permanently banned.

**I19 — Calendar cells show trip content**  
Calendar cells must always show trip content — flights, hotel name, or warning — not just color. A colored empty cell is not acceptable.

**I20 — Munich is a distinct amber leg**  
Munich must always appear as a distinct leg in amber (`#C4943A`). It must never be merged visually with Venice or any adjacent leg.

**I21 — Legend covers every itinerary leg**  
Every trip leg that exists in the itinerary must appear in both the calendar AND the legend. If a destination is in the trip but not in the legend, that is a bug.

**I22 — Stay cities come from hotels, not flight arrivals**  
Timeline stay chapters, night counts, and calendar labels must derive from **booked hotel cities and dates**. Landing at BRI does not imply "staying in Bari" when hotels are in Monopoli/Polignano. Flight arrival is a transport event only.

**Test:** `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`

**I23 — Plan notes reconcile with reservations**  
User plan notes ("Leave", "not staying in X", "staying elsewhere") must parse and reconcile against booked hotels — updating `dayPlans` and timeline legs. Decorative notes that ignore hotel truth are banned.

**Test:** `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`

**I24 — Inter-city gaps are decision cockpits**  
Missing ground connectors must show distance, labeled mode estimates, map deep link, and explicit user choice — recommend softly, never prescribe a single mode as orders. No exact invented fares.

**Test:** `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`

**I25 — Hotel name beats OTA provider in UI**  
Reservation drawers, timeline cards, and edit surfaces show the **hotel property name** as the headline. Booking.com / Expedia / etc. are source badges — never the primary title.

**Test:** `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`, `src/lib/travelAssistant/buildTripLegs.test.ts`

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

**D10 — Forwarded reservations gate on confidence before becoming trip fact**  
A parsed forwarded reservation only auto-imports to the live trip when it clears `evaluateForwardedReservationGate` (confidence ≥ 40, no missing critical fields, passes plausibility). Anything below the bar goes to the review queue with explicit `reasons` — never silently auto-imported with just a soft note. `drainForwardReviewQueue` must never auto-promote a review item that carries `reasons` — that field means a human must confirm it first.

**Test:** `src/lib/travelAssistant/forwardedReservationGate.test.ts`, `src/lib/travelAssistant/drainForwardReviewQueue.test.ts`

**D11 — Plausibility checks run before accept, independent of parser confidence**  
Deterministic checks (real 3-letter airport codes, arrival ≠ departure, dates within a sane travel window, checkout after check-in, non-negative price) run via `checkReservationPlausibility` regardless of how confident the parser was. A high-confidence but implausible parse still routes to review.

**Test:** `src/lib/travelAssistant/reservationPlausibility.test.ts`

**D12 — Reservation type detection covers non-transport bookings**  
`emailForwardParser` must classify restaurant reservations, tours, excursions, and other bookable activities as `dinner`, not fall through to `ride`. Both the regex keyword table and the AI fallback prompt's allowed type list must stay in sync — a type added to one must be added to the other.

**Test:** `src/lib/travelAssistant/emailForwardParser.test.ts`

**D13 — No feature may fabricate data on failure**  
An API route that cannot perform its real function (e.g. no OCR engine wired up) must return an explicit error/"not available" response — never a hardcoded success payload that looks like real extracted data. Silent fake success is a worse failure mode than a visible error.

**D14 — Itinerary-scoped offline prefetch**  
Airport layouts and city map bundles prefetch within **48h** of when the traveler needs them. Evict cached assets only when their IATA/city key no longer appears on any **remaining** leg of the same trip — never wipe the whole cache on a single leg completion.

**Test:** `src/lib/travelAssistant/itineraryOfflineCache.test.ts`

**D15 — Offline city map bundles are CSP-safe**  
When network raster tiles are unavailable, Live Map falls back to inline GeoJSON city bundles (pilot cities) built in code — not external style JSON with remote tile sources.

**Test:** `src/lib/map/offlineCityMapBundle.test.ts`

**D16 — Learned nav timing respects minimum samples**  
Crowd-sourced edge walk times and security waits never override curated defaults until **≥5 walk samples** or **≥10 security samples**, with outlier trimming and plausibility gates.

**Test:** `src/lib/airportNav/navTimingCalibration.test.ts`

**D17 — Post-booking briefing is two-stage**  
Before gate assignment or check-in window: show **eligibility only** (benefits on file). After gate or check-in opens: show **actionable** checkpoint and lounge guidance — never specific security lane copy before the gate is known.

**Test:** `src/lib/airportNav/postBookingBriefing.test.ts`

**D18 — Input-style personalization suggests, never silently applies**  
Channel shortcuts require **≥3 attempts**, correction rate **≤25%**, and always surface as an explicit suggestion card — never auto-change import defaults without user acceptance.

**Test:** `src/lib/travelAssistant/inputStyleProfile.test.ts`

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
| M9 | `src/lib/travelAssistant/groundTransportDeepLinks.test.ts` |
| F7 | `src/lib/travelAssistant/itineraryPathCoverage.test.ts` |
| F7 | `src/lib/travelAssistant/itinerarySelfCheck.test.ts` |
| F8 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusCadence.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusMerge.test.ts` |
| F10 | `src/lib/travelAssistant/checkInHandoff.test.ts` |
| F11 | `src/lib/travelAssistant/reservationLinks.test.ts` |
| F11, G13 | `src/lib/travelAssistant/europe2026TripPass.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusLookup.test.ts` |
| G13 | `src/lib/travelAssistant/gapDetectionService.test.ts` |
| G8 | `src/lib/travelAssistant/dayPlanLines.test.ts` |
| G10 | `src/lib/travelAssistant/tripActionItems.test.ts` |
| G14 | `src/lib/travelAssistant/tripSpendSummary.test.ts` |
| I8 | `src/lib/travelAssistant/tripLegColors.test.ts` |
| I8, I10, I12, I15, I17, I20, I21 | `src/lib/travelAssistant/buildTripLegs.test.ts` |
| I22, I23, I24, I25 | `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts` |
| I22, ground connectors | `src/lib/travelAssistant/groundConnectorGaps.test.ts`, `src/lib/hotels/deriveTripStaySegments.test.ts` |
| Support chat API shape | `src/lib/support/buildSupportChatApiMessages.test.ts` |
| D10 | `src/lib/travelAssistant/forwardedReservationGate.test.ts` |
| D10 | `src/lib/travelAssistant/drainForwardReviewQueue.test.ts` |
| D11 | `src/lib/travelAssistant/reservationPlausibility.test.ts` |
| D12 | `src/lib/travelAssistant/emailForwardParser.test.ts` |
| D14 | `src/lib/travelAssistant/itineraryOfflineCache.test.ts` |
| D15 | `src/lib/map/offlineCityMapBundle.test.ts` |
| D16 | `src/lib/airportNav/navTimingCalibration.test.ts` |
| D17 | `src/lib/airportNav/postBookingBriefing.test.ts` |
| D18 | `src/lib/travelAssistant/inputStyleProfile.test.ts` |

New laws must add a row here when a test exists.
