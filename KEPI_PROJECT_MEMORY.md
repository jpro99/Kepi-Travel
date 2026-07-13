# Kepi Project Memory

**Purpose:** Durable facts for humans and AI agents working on this repo.  
**Update rule:** When the user states something that should not be forgotten (decisions, completed external steps, preferences), append or edit this file in the same session.

Last updated: 2026-07-13 (official airport wayfinding registry + honest indoor position)

**Neuro Brain (reasoning layer):** `NEURO_BRAIN.md` — why Jeff asks for changes; apply whole-trip thinking site-wide.

---

## Whole-trip execution philosophy (Jeff approved 2026-07-08)

**Why Jeff asked for this:** Kepi must help through the *entire* journey — not only flights and hotels. Landing at an airport ≠ sleeping in that city. Plan notes ("Leave Bari", "not staying here") must *mean something* and reconcile with booked hotels. Ground connectors need distance, options, and maps — **user picks, Kepi tracks** (decision support, not blind orders).

### Core principles (apply everywhere)

| Principle | Meaning |
|-----------|---------|
| **Hotels = truth for where you sleep** | Stay chapters, timeline cities, and spend follow **booked hotel cities + dates**, not flight arrival airports. BRI landing does not imply "8 nights in Bari" when hotels are in Monopoli/Polignano. |
| **Airport = transport problem** | First question after landing: *how do you get to your first hotel?* Not "where are you staying?" at the airport city. |
| **Plan notes reconcile** | Typed intent ("Leave", "not staying in Bari") → parse → match hotels → update `dayPlans` + timeline. Never ignore user edits. |
| **We'll help you plan it** | Missing transport shows distance, mode estimates (labeled), map link, and CTAs. Recommend softly ("most travelers…"); user chooses. |
| **OTA labels ≠ hotel identity** | Show **hotel name** in UI; Booking.com is a badge/source, not the headline. Tappable → full stay detail. |
| **No fake precision** | Guesstimated €/time ranges until live APIs; never invent exact fares. |

### Shipped 2026-07-08 (`bc0994a`)

- `hotelAnchoredStayLegs.ts` — stay legs from hotels + plan notes
- `reconcilePlanNoteWithHotels.ts` — "Leave Bari" → Monopoli from bookings
- `interCityTransportSuggestions.ts` + `TransportRouteSheet` — route decision UI
- `reservationDisplayLabel.ts` — hotel title over OTA provider
- Laws/tests: `hotelAnchoredTimeline.test.ts`

### Apply this thinking next (priority order)

1. **Home / Trip Health** — airport→first-hotel gap card with route sheet (not just Plan)
2. **Book tab** — after hotel book, prompt "how are you getting there from airport/previous city?"
3. **Map tab** — draw connector routes between stay pins (not only hotels as dots)
4. **Gap detection** — classify BRI→Monopoli as `airport_transfer` vs `inter_city`
5. **Support AI prompt** — already inherits whole-trip rules in `/api/support/chat`
6. **Spanish i18n** — nav + Plan sub-views wired; **most trip copy still English** — expand `messages/es.json` incrementally
7. **Award / multi-city** — same hotel-first rules for award trips and rail connectors

### Do NOT

- Tell users "take the train" with no map/options (liability + trust)
- Infer stay city only from flight IATA
- Show "Booking.com" as the hotel name in edit drawers

---

## ML readiness policy (Jeff approved 2026-07-06)

Kepi does **not** train a custom neural net in-product. ML readiness means:

1. **Parser versioning** — `EMAIL_FORWARD_PARSER_VERSION` on every parse + review item; bump when regex/AI/merge logic changes.
2. **Correction triplets** — on review accept, persist `(source snippet, parser guess, user-corrected, version, confidence)` to Redis via `/api/ml-readiness/parse-corrections`.
3. **Active-learning triage** — review queue sorted by implausibility + low confidence + missing fields first.
4. **Held-out parse eval** — frozen fixtures in `src/lib/travelAssistant/__fixtures__/parse-eval/`; never tune prompts against them.
5. **Few-shot from corrections** — email-forward AI fallback injects similar user corrections when available.
6. **Suggestion outcomes** — stub logging (`impression`/`click`/etc.) for future bandits; Trip health missing-pricing CTA wired first.

Later (optional): embedding retrieval, ranker, bandit — only after correction volume justifies it.

---

## Offline nav + personalization (Jeff approved 2026-07-06)

Five Claude-prompt features shipped together:

1. **Itinerary-scoped offline cache (D14)** — `itineraryOfflineCache.ts` + `syncItineraryOfflineAssets` prefetch airport layouts as soon as an IATA is on a trip leg; city GeoJSON bundles still prefetch 48h before need; evict only when IATA/city key leaves remaining trip legs. Wired via `useOfflineTravelKitSync`.
2. **Offline city map fallback (D15)** — Pilot bundles (`munich-de`, `puglia-it`, `rome-it`) in `offlineCityMapBundle.ts`; Live Map uses inline GeoJSON style when offline.
3. **Nav timing calibration (D16)** — `navTimingCalibration.ts` aggregates walk/security samples from airport navigator journey events; min 5/10 samples before overriding curated edge times.
4. **Two-stage post-booking briefing (D17)** — `postBookingBriefing.ts` + `PostBookingBriefingCard` in Airport Mode: eligibility before gate/check-in, actionable guidance after.
5. **Input-style personalization (D18)** — `inputStyleProfile.ts` on traveler genome; `/api/traveler/input-style`; suggestion card on Plan tab; corrections from parse-review POST update channel stats. **Suggest only — never silent apply.**

---

## Competitive gaps memo (Jeff approved defer/build 2026-07-06)

### Shipped this session
- **F9 flight status:** phase-aware polling (90s within 6h), AeroDataBox + optional FlightAware merge, 2-min server sweep via Inngest, discrepancy logging.
- **F10 check-in handoff:** 24h window, airline deep links, honest Wallet/pass URL handoff on Home — no fake barcodes.
- **M9 ground transport:** Uber/Lyft deep links with airport prefilled (Travel Day + card component). Native Uber partner API deferred.
- **F11 boarding pass URLs:** extract ticket/Wallet links from forwarded confirmations; persist on flight reservations; check-in card opens stored pass.
- **G13 contextual gap actions:** Trip Health "Add hotel" opens Book → Hotels with city/dates prefilled from the gap.

### Group planning (Mindtrip-style) — **Shipped (v1, 2026-07-12)**
Paid partners (Pro/Lifetime on **both** sides) can invite by email with **Edit together**, join into My Trips, and co-edit the same trip. View-only share still works for free. JSON trip download is in Share modal. Conflict UX / multi-editor presence still later.

### Conversational NL booking (Mindtrip/Zenvoya-style) — **Don't build now**
Kepi has Command Deck + structured search wizards. Full NL→book is a product pivot (8–12+ weeks, high ambiguity risk). Differentiation is **executing the trip**, not replacing Kayak chat. Revisit only if form-based Book funnel metrics show users bouncing on complexity.

---

- **Discuss first, code second.** If he asks "what would you fix?" or "does this match?" or "tell me before you change anything" — give analysis and a short plan only. Wait for explicit approval before editing — unless he clearly says "fix it now" / "go ahead" / "build it."
- **Auto-push + promote (Jeff, 2026-07-05):** When you implement code and `npm run lint` + `npm run build` pass, **commit, push to `main`, and promote production in the same session** — never ask "want me to push?" or "should I deploy?" If Vercel Production lags behind `main`, run `npx vercel --prod --yes` after push. Production is kepitravel.com. Stale Ready deploys waste Jeff's credits.
- **Do not burn credits** on unapproved refactors or "helpful" extra changes.
- **Match his eye, not a generic template.** Hotels (Stays) tab on mobile is the reference for clean mobile trip UI: trip name → Flights/Hotels picker → map → list. No blue route banner strip on Flights (he removed it — "Ontario to Ontario" was wrong and not clean). Hotels stay as-is with no blue hero.
- **Flights and Stays must feel the same** — same structure, card style, and chrome. Mobile Book now has search launchers + CTAs on both tabs (2026-06-15).
- **Plan tab:** Lined-paper itinerary, inline edit, no reservation popups on line tap.
- Read this section before UI work on Home / Trips / Flights / Hotels / Plan.

---

## Consumer nav — unified (Jeff, 2026-06-15)

**Same mental model on phone and desktop:**

| Order | Label | Job |
|-------|-------|-----|
| 1 | **Home** | Command center — where you are in the journey |
| 2 | **Plan** | Day-by-day timeline + calendar |
| 3 | **Book** | Flights, hotels, confirmations, search |
| 4 | **Map** | Live/family map, airport mode |
| 5 | **More** | Settings, family, loyalty, etc. |

- **Map is not early in the bar** — it sits between Book and More. Users don't open a map first; they open Home.
- **URL compat:** Desktop still uses `?tab=trip` internally for Home; label shown to user is **Home** not Trip.
- **Mobile:** `?mtab=home|plan|book|map|more`. Legacy aliases: `trip`/`flights`/`hotels` → `book`; `itinerary`/`calendar` → `plan`.

---

## Home tab — product law (Jeff, 2026-06-15)

**What Home is NOT (production bug / old design):**  
A flat scroll of every flight row under the trip title (e.g. "Europe 2026" + Alaska/ITA list). That reads like an email parser dump — **not premium**, not "best travel app ever."

**What Home IS:**  
A **journey command center** that answers *"Where am I in this trip?"* before *"Here are all my bookings."*

**Required Home content (desktop + mobile):**
1. **Hero** — trip name, destination, dates, countdown (navy gradient header)
2. **Route flow** — visual map/globe of legs (tap leg for details), not a laundry list
3. **Journey assist** — phase-aware guidance (pre-trip, airport, in-air, etc.)
4. **Quick actions** — cards/shortcuts to Book, Plan, Map
5. **Next up** — prominent card on Home with route, gate, live status (`NextUpCard` + `MobileAssistView`)

**What belongs elsewhere:**
- Full flight/hotel inventory → **Book**
- Day-by-day planning → **Plan**
- Family/live map → **Map** tab

**Premium gaps Jeff called out:**
- ~~Header badges actionable on Home~~ — `TripSpendBadge` on mobile header + Home body (2026-06-15)
- ~~Deduped segments~~ — Done (phase 2)
- ~~Destination feel~~ — photo + globe on Home (phases 6 + mobile)
- ~~Phone and desktop same five tabs~~ — Done

**Implementation note:** `DesktopTripHomeView` rewrite + `mobileShellTypes` unified tabs exist locally; **verify git push / Vercel** before assuming production matches. Old production Home = flat list + "Trip" tab label.

**Supersedes:** Earlier note "Trip tab (desktop): trip name, then flights, then hotels — nothing else." Flight/hotel lists now live on **Book**; Home is command center + route flow.

---

## Home + Plan build order (Jeff approved 2026-06-15)

Execute in this order; do not skip dedupe before polish.

| Phase | Work | Status |
|-------|------|--------|
| **1** | Home command center — hero, route map, Next Up (`DesktopTripHomeView`, unified nav Home label) | Done |
| **2** | **Dedupe flights** at consumer shell — `dedupeConsumerReservations()` before sort/display | Done |
| **3** | **Trip health strip** — one inline “Trip needs attention (N)” on Home + Plan; ban stacked floating gap toasts | Done |
| **4** | Wire **NEED PRICING** into trip health → Book | Done |
| **5** | **Plan = place-first** — destination chapters lead; raw segments collapsed | Done |
| **6** | **Destination feel** on Home — hero photo + embedded globe like mobile | Done |
| **7** | Deploy + verify on kepitravel.com | Auto on push |

Component map: `TripHealthStrip`, `dedupeConsumerReservations`, `DesktopTripHomeView`, `MobileMapForwardShell` (home), `ItineraryTabView` (plan), `bookTabStyles`, `TripSpendBadge`.

## Post–Home/Plan polish (Jeff, 2026-06-15)

- **Spend badge tappable** — header `TripSpendBadge` opens Book when pricing/issues need attention
- **Mobile Home trip health** — `TripHealthStrip` on mobile Home tab
- **Book tab unified** — shared header, toggle chrome, matching flight/hotel list cards via `bookTabStyles.ts`
- **Book search on mobile** — flight/hotel launchers, leg picker, stay planner wired from `page.tsx`
- **Flights/Hotels card parity** — mobile Book list cards share icon tile, expand chevron, cost/miles row

---

## Owner & product

- **Owner:** Jeff Russell
- **Production:** https://kepitravel.com (Vercel + Cloudflare)
- **Canonical repo:** `C:\Projects\Kepi Travel\kepi-travel` only — see `CANONICAL.md`
- **App type:** Invite-only travel assistant (trips, flights, hotels, airport guidance, family map)

---

## External providers — current state

### Duffel (flights + stays)

- **Flights:** Live via `DUFFEL_ACCESS_TOKEN` on Vercel
- **Stays (hotels):** **NOT enabled** on account — search returns 403 until Duffel enables it
- **Owner action:** Jeff has **already emailed Duffel support multiple times** to enable Stays — **do not keep telling him to send another email** unless he asks or status changes
- **While waiting:** App uses **LiteAPI** then estimated fallback

### LiteAPI / Nuitée

- **Status:** Sandbox/production key added to Vercel as `LITEAPI_KEY`
- **Code:** Wired in `src/lib/providers/liteapi/searchHotels.ts` — waterfall after Duffel
- **Owner action:** Deploy latest code; test Monopoli on Hotels tab for real photos/rates

### Travelpayouts

- **Status:** Account exists; **Drive install declined** — correct decision
- **Do not recommend:** Installing Drive, Money Script, or sitewide widgets on kepitravel.com
- **Optional later:** Server-built affiliate deep links only (no site script) — low priority

---

## Hotel product — built features

- **Stay profile** (`/api/hotels/profile`): User describes preferences once (elevator, ocean, breakfast) — voice or text
- **Trip stay planner:** Hotels tab walks trip segment-by-segment (Monopoli, then next city)
- **Ranking:** Hyatt preference, points, memory, profile boosts, chain diversity
- **Destination aliases:** e.g. Monopoly → Monopoli
- **Not yet shipped to prod until deploy:** Confirm with git push / Vercel deploy status

---

## Jeff's hotel preferences (for ranking/testing)

- Prefers **Hyatt** (Globalist) but wants **variety** — not three Hyatts in a row
- Cares about: elevator/no stairs, ocean proximity, train/metro, quality/cleanliness, breakfast nice-to-have
- Example trip search: **Monopoli, Italy**

## Itinerary transport rule (product)

- When consecutive stay cities appear on the trip plan (e.g. Lecce → Venice → Cortina) and no flight/train/ride is booked for that hop, **Flights tab must prompt**: “How are you getting from [A] to [B]?” with **Search flights** and **Add train or transfer**.
- Connector legs are enabled by default in `buildPlannedFlightLegs` / `buildFlightLegsFromStopRanges`.
- City→airport resolution uses `resolveHotelDestinationSync` (Lecce→BDS, Cortina→VCE, Venice→VCE).

## Trip pricing — cash vs points (product)

- **Jeff's trips include award/points-only flights** (e.g. Alaska Atmos). Do **not** require a dollar amount when miles/points are logged.
- **Points-only = priced:** `quotedPointsMiles` + optional `pointsProgram` satisfies trip spend tracking; `reservationMissingPrice` is false without `quotedPriceUsd`.
- **Award + $0 due:** When confirmation text shows miles redeemed and total due $0, do **not** impute cash from “ticket value” lines — use miles for trip total instead.
- **UI:** Review/confirm drawer labels cash as **optional**; header spend badge shows `$0 cash` + points total and “Award trip” when applicable.
- **Parsing:** `applyAcceptedReservationPricing` / `hydrateReservationPricing` on accept and trip load; PDF scan extracts `pointsMiles` + `pointsProgram` when visible.

---

## AI domain bots (Cursor skills)

Project skills live in `.cursor/skills/` — these are **playbooks for Cursor agents**, not autonomous 24/7 processes.

| Bot | Skill path | Bot Deck memory |
|-----|------------|-----------------|
| **Conductor** | `.cursor/skills/kepi-conductor/SKILL.md` | `bot-deck/memory/conductor.md` |
| **Hotel** | `.cursor/skills/kepi-hotel-bot/SKILL.md` | `bot-deck/memory/hotel.md` |
| **Flight** | `.cursor/skills/kepi-flight-bot/SKILL.md` | `bot-deck/memory/flight.md` |
| **Airport** | `.cursor/skills/kepi-airport-bot/SKILL.md` | `bot-deck/memory/airport.md` |
| **Map** | `.cursor/skills/kepi-map-bot/SKILL.md` | `bot-deck/memory/map.md` |
| **Points** | `.cursor/skills/kepi-points-bot/SKILL.md` | `bot-deck/memory/points.md` |
| **Card** | `.cursor/skills/kepi-card-bot/SKILL.md` | `bot-deck/memory/points.md` (shared) |
| **Weekly Audit** | `.cursor/skills/kepi-weekly-audit/SKILL.md` | `bot-deck/memory/conductor.md` § Weekly Audit |

## Weekly Audit (product loop)

- **Skill:** `.cursor/skills/kepi-weekly-audit/SKILL.md` — critique only, no code
- **Rotation:** Week 1 ingestion → 2 trip-state → 3 Travel Fit + points/card → 4 UX/competitive (repeat)
- **Reports:** `bot-deck/memory/audits/`
- **Next run:** Week 2 (after 2026-07-06 Week 1)
- Jeff approves ranked item → Conductor executes

## Travel Fit (product)

- **More tab:** Travel Fit card learns airlines, hotels, hubs from reservations; habits saved **locally on device** + optional Redis backup when signed in
- **Card wallet:** card product names only (no PAN on servers) — `/api/points-profile`
- **Earn stack:** Hotels tab shows suggested earn path — `/api/travel-fit`
- **Hybrid model:** free basics; Pro for deep optimization later
- **Rakuten:** one-tap only, never silent auto-apply

**Local control UI:** `bot-deck/` — run `cd bot-deck && npm start` → http://127.0.0.1:3847 (phone: same Wi‑Fi). Assign tasks, edit memory, copy Cursor prompts. Does **not** auto-spend AI credits.

**Remote control UI:** https://kepitravel.com/admin/bots — admin login + `ADMIN_USER_IDS`. Redis-backed tasks/memory; works from phone anywhere (no PC required).

**How Jeff uses them:** Bot Deck for tasks/memory → paste prompt in Cursor → mark task done.

---

## Agent instructions (read every session)

1. Read this file before giving provider/setup advice
2. Do not repeat completed owner actions (Duffel emails, LiteAPI signup, Travelpayouts skip)
3. After meaningful decisions, update this file
4. App user memory ≠ this file — user prefs live in Redis (`hotelStayProfile`, `hotelMemory`, `traveler-genome`)

---

## Agent workflow — screenshots (mandatory)

When Jeff posts a **map or UI screenshot**, the agent must:

1. **Name what is wrong in the image first** (e.g. pins in the ocean) — not only issues from chat history
2. Fix **data/map correctness before chrome** (slider, buttons)
3. Regression cities for hotel pins: **Polignano a Mare**, Monopoli, Munich

Rule file: `.cursor/rules/40-screenshot-triage.mdc` (always apply).

**Failure logged 2026-06-15:** Polignano map showed hotel pins in the Adriatic; agent fixed slider instead. Root cause: LiteAPI coords ~0.5–1.5 km east of town passed `areCoordsTrusted` but were offshore. Fixed with `isLikelyOffshorePin` in `hotelGeo.ts`.

**Failure logged 2026-07-12:** SEA Plan Airport repeatedly showed only a navy canvas while the family MapLibre map aborted MapTiler requests during handoff. Airport planning now uses a local SVG schematic (no MapTiler/WebGL), and family drawer chrome is removed from Airport Mode; live 3D MapLibre retains the schematic as its context-loss fallback. Mobile must expose `Plan SEA airport` for future SEA flights outside the geofence; destination selection uses 48px controls, one selected map label, and a readable route sheet.

**Failure logged 2026-07-13:** The airport destination box disappeared after selection, indoor GPS looked more precise than it was, and SEA’s curated Checkpoint 3 incorrectly claimed CLEAR. Airport controls must remain visible, GPS uses an accuracy halo/approximate label, SEA live wayfinding hands off to the official Atrius map, and third-party airport maps are never claimed as downloadable/offline.

---

## Lifetime invite flow (2026-07-12)

**User expectation:** Admin sends lifetime invite email → recipient clicks link → **Lifetime/Pro is on automatically** — no manual redeem in More tab, no onboarding step 1 "Next" required.

**Canonical path:**
1. Email CTA → `/redeem?code=XXX`
2. Unsigned → `/sign-up?code=XXX` → Clerk → `/travel-assistant?redeem=XXX`
3. `useAutoRedeemInviteFromUrl` POSTs `/api/invite/redeem`, refreshes billing, strips URL params
4. Onboarding also redeems on load / skip / complete (belt-and-suspenders)

**Gotchas:**
- Invite codes with `intendedEmail` require sign-up with that exact email (403 otherwise).
- `redeemInviteCodeClient` in `@/lib/invite/redeemInviteCodeClient` — use everywhere (More tab, onboarding, URL hook).
- **Never** leave JSX referencing a prop name that was renamed in destructuring (`onCreateTrip` vs `onStartNewTrip` in `DesktopTripHomeView` caused production `ReferenceError` after onboarding).
- **Never** `kvStoreDel(onboarding-complete)` on progress PUT — returning users with trips must auto-skip onboarding (`listTrips` check on GET). Only show `OnboardingFlow` when `!tripsLoading && trips.length === 0`.
- **Regional airport metro:** BRI serves Monopoli/Polignano — do not prompt "how are you getting there?" for airport→hotel when `airportServesStayCity` matches. Trip destination display uses **hotel city first**, then **first inbound flight** (not return leg — was showing Rome/FCO incorrectly).
- **Ground connectors must respect booked flights:** Never prompt SEA→Polignano (absurd distance) or FCO→Polignano when FCO→BRI is booked. Only evaluate **last inbound flight before first hotel**. Skip inter-city hotel hops when booked flights connect stay cities. Max ground distance ~400km airport, ~500km inter-city.
- **Airport day-of (2026-07-12):** Geofence → auto-open `/travel-assistant/live-map?view=airport` once per session. Active flight window **12h** ahead for early arrival. Full indoor turn-by-turn map is **SEA only**; other airports get honest checklist fallback. Gate walk auto-starts when layout+gate+PreCheck answer ready. Zurich IATA is **ZRH** (ZUR kept as alias).

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-12 | **Lifetime auto-redeem** from email links. **Crash fix:** `onCreateTrip` → `onStartNewTrip`. **Returning users:** stop wiping `onboarding-complete` on progress PUT; auto-complete when trips exist; don't show onboarding until trips finish loading. |
| 2026-07-08 | **Whole-trip execution:** hotel-anchored timeline, plan-note reconciliation, inter-city route sheet, hotel display labels. Philosophy in project memory + design laws I22–I25. Support model fix (`claude-sonnet-4-5`). Spanish nav labels. |
| 2026-07-06 | **Trip truth loop:** boarding pass URLs from email imports, merged `/api/travel-updates` flight-lookup, contextual Trip Health → Book hotel search, Europe 2026 unit pass. Laws F11, G13. |
| 2026-07-06 | **Competitive gaps (flight status, check-in, rides):** phase-aware AeroDataBox polling + optional FlightAware merge, 2-min Inngest sweep, honest check-in/Wallet handoff card on Home, Uber/Lyft deep links on Travel Day. Laws F9–F10, M9. Group/NL booking memo — defer. |
| 2026-07-06 | **Offline nav + personalization:** itinerary-scoped IndexedDB prefetch (airport layouts + pilot city GeoJSON), Live Map offline fallback, nav walk/security calibration, two-stage post-booking briefing in Airport Mode, input-style suggestion on Plan tab. Design laws D14–D18. |
| 2026-07-06 | **Parsing reliability:** confidence/plausibility gate now blocks low-confidence or implausible forwarded reservations from auto-becoming trip fact (`evaluateForwardedReservationGate`); `drainForwardReviewQueue` no longer silently auto-promotes gated review items. Added dinner/tour/excursion detection to `emailForwardParser` (previously misclassified as "ride"). `/api/ocr` (Expense Report receipt scan) was a fake stub — now returns an honest "not available" instead of fabricated data; real OCR deferred. See `KEPI_DESIGN_LAW.md` D10–D13. |
| 2026-06-15 | **G11 post-booking + Plan transport:** confirmation card replaces success toasts; hotel save-from-search card; inter-city transport prompts on Plan tab |
| 2026-06-15 | **Plan calendar day editing:** tap day stays on calendar; inline Plan this day editor; plan lines preview on month cells; timeline via explicit button only |
| 2026-06-15 | **Europe 2026 QA + Travel Fit:** trip map regression tests (Polignano/Monopoli/Munich); Book earn stack on Flights+Hotels; mobile More gets Travel Fit + wallets |
| 2026-06-15 | **Plan inline expand (I2):** Day tap expands bookings + notes inline; Edit plan opens full editor; no reservation drawer on Plan tab |
| 2026-06-15 | **Hotel book funnel:** LiteAPI source banner, "Book in Kepi" card CTAs, Stripe return → Book/Hotels tab, save keeps search open |
| 2026-06-15 | **Home spend + card parity:** TripSpendBadge on mobile header/Home; mobile flight cards match hotel list chrome |
| 2026-06-15 | **Book search + Next Up:** mobile Book wired to flight/hotel search (launchers, leg picker, stay planner); loyalty spend in Book header; Next Up shows route/gate/status |
| 2026-06-15 | **Mobile polish:** cinematic Home hero (photo+globe), unified Book chrome (navy header, Flights\|Hotels toggle), tickets as footer; shared `tripHeroVisuals` |
| 2026-06-15 | **Auto-push:** after lint+build pass, commit+push main without asking — Vercel → kepitravel.com |
| 2026-06-15 | **Home+Plan build order** phases 2–4: dedupeConsumerReservations, TripHealthStrip, pricing wired on Home/Plan |
| 2026-06-15 | **Home tab product law:** unified nav Home\|Plan\|Book\|Map\|More; Home = command center + route flow (not flat flight list); Book owns inventory; premium gaps documented |
| 2026-07-06 | **ML readiness scaffolding:** parser version, correction triplets, review triage, held-out fixtures, few-shot AI fallback, suggestion outcome stub |
| 2026-07-06 | **Weekly Audit:** skill + Week 1 ingestion report; Week 3 includes points/card/lounge; rotation in conductor.md |
| 2026-06-15 | Screenshot triage rule + Polignano offshore pin fix (`isLikelyOffshorePin`) |
| 2026-06-15 | Created memory file; documented Duffel emails sent, LiteAPI key set, Travelpayouts Drive skipped, domain bot skills |
