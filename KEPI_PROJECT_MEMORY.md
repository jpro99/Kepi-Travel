# Kepi Project Memory

**Purpose:** Durable facts for humans and AI agents working on this repo.  
**Update rule:** When the user states something that should not be forgotten (decisions, completed external steps, preferences), append or edit this file in the same session.

Last updated: 2026-08-21 (LAX arrivals nav pilot — draft, dormant pending coachMode wiring)

## Decision 2026-08-21 — Second live-nav pilot is LAX **arrivals-only**, not a full second airport

**Why Jeff asked:** wants Kepi to "walk a person through the airport as much as possible" — the
live turn-by-turn nav (arrow, position fusion, journey phases) only ever covered departures
(check-in → security → gate). Arrivals (deplane → customs → baggage claim → ground transport) had
zero indoor graph behind it, at any airport.

**Decision:** Second pilot = **LAX, arrivals only** — not a full LAX departure rebuild (LAX already
has departure curation from the 2026-07-14 "airport #2" pass; this is purely additive) and not a
"hundreds of airports" push (full human-verified precision doesn't scale to that — see 2026-07-15
narrow-scope decision, unchanged). Live turn-by-turn nav stays capped at verified pilots; a
lighter "researched arrival-facts" tier (no geometry, just verified prose) is the realistic path
for broader-than-two-airport coverage, not yet built.

**Method upgrade — apply to every future airport pass:** draft data by reading the airport's own
official, current public PDFs directly (found via web search, downloaded with a browser
user-agent — flylax.com blocks the generic fetch tool's default UA — and read as images/PDFs),
not by aggregating travel-blog summaries. This caught a real error on the first pass: blogs
described "the LAX-it shuttle" as one system; LAX's own Ground Transportation Waiting Areas map
(rev. SP26-0810) shows LAX-it (green, rideshare/taxi) and the Terminal Connector (pink,
parking/inter-terminal) are separate systems. See `LAX_ARRIVALS_RESEARCH_MEMO.md`.

**Shipped this session (draft, unverified, currently dormant — see below):**
- `JourneyPhaseId` extended with `customs` / `baggage_claim` / `ground_transport`
  (`journeyMachine.ts`), detected purely from node kind at the traveler's position — never
  inferred from itinerary, so no "are you international?" guessing is needed.
- `GraphNodeKind` extended with `customs` / `baggage_claim` / `ground_transport`; `PoiCategory`
  with `customs` / `ground_transport` (`baggage` already existed); `SecurityLaneType` with
  `customs` (CBP is a real border crossing, not a security bypass — see M40).
- `LAX_LAYOUT` (`layouts/lax.ts`) gained a TBIT customs/baggage-claim chain and the two
  ground-transport nodes (LAX-it, Terminal Connector), all `precision: "extrapolated"` — no OSM
  ground truth exists for any of these anywhere, so nothing here is verified yet.
- Design law **M40**. Test: `journeyMachine.test.ts` (+ existing cross-airport suites updated:
  `layoutQuality.ts` CONTEXTUAL_CATEGORIES, `airportLayoutPackage.ts` Zod schema, `poiDetail.ts`
  zoom tiers, `familyAirportSync.ts` phase labels — all were hand-mirrored enums that needed the
  same update as `types.ts`, a recurring duplication risk worth knowing about next time a
  category/kind is added).

**Discovered mid-session — local checkout was ~200 commits stale (root-caused a failed push):**
Work started from a local `main` pinned at `86a268a`; real `origin/main` was already at `84e8be5`.
In that gap, remote had independently shipped an **Arrival Day Coach** (`coachMode: "depart" |
"arrive"` on `AirportNavigatorMap`/`AirportNavigatorFallback` — live baggage-carousel number from
FlightAware/AeroDataBox, ride-from-airport deep link, time-since-landed) and **deleted
`ArrivalMode.tsx`** (superseded by the Coach). Also consumed M38/M39 (map helpers; travel-day
flight order) — this session's law was renumbered M40 to avoid collision. **Lesson: verify the
local checkout is actually current (`git fetch` + compare to `origin/main`) before trusting a
"first pass" diagnosis of what exists in the codebase** — an out-of-date local tree produces
confidently wrong "this doesn't exist yet" claims.

**Not yet done / currently dormant:** the shipped Day Coach has no customs guidance and no indoor
walking — it's live data + deep links, genuinely complementary to this session's graph, not
redundant with it. But `coachMode === "arrive"` **always** renders the fallback Coach, never the
live indoor map, so this session's customs/baggage/ground-transport graph currently has **no path
to ever render** for a real arrival. Wiring the two together (or deciding they should stay separate)
is its own next decision — Jeff chose "merge as dormant, wire later" over wiring it in this pass.
LAX-it/customs coordinates are diagram-derived estimates, not click-to-place human-confirmed —
same verification step SEA went through still applies before this is "real."

## Incident 2026-08-20 — "You can read every number except the price" (Jeff)

Jeff was right and it was two bugs. (1) The ticket-scan API **discarded the PDF plain text** and only returned drafts, so the proven `New Ticket Value` parser never saw the document; the scan also created new reservations instead of pricing existing ones. (2) The AI prompt said `cashUsd=0` for award tickets, so `Total charges for air travel: USD $0.00` beat `New Ticket Value: $1,386.43`. Probing 7 real Alaska layouts found 3 parser failures (loyalty branding without redeemed miles, bare `Total 1,386.43 USD`, collapsed PDF spacing) — all fixed. **Drag-and-drop lives in Trip Accounting whenever a row shows Add price.**

## Incident 2026-08-20 — The fare hunt was behind a disabled button (Jeff)

G39/G40 shipped and nothing changed for Jeff because `countRescannableReservations` only counted bookings that already had stored email text. His DPNNWG legs had none, so the Re-scan button was **disabled** and the auto-hunt returned early — the Gmail sweep was unreachable code. G41 makes a confirmation code sufficient. **Lesson: verify the runtime path end to end before shipping, not just the unit under test.** Proven with `pricingEndToEnd.test.ts` and a live store probe (0 → $1,386 persisted across 4 legs).

## Decision 2026-08-20 — Kepi finds the fare, Jeff never types it (Jeff)

After G39 the DPNNWG group still showed 4 flights with no price: Kepi had the code but never had a receipt with a total. Gmail import only read `text/plain` and skipped PDF attachments, and nothing ever searched Gmail by confirmation code. G40 adds HTML + PDF reading and a Gmail search per unpriced PNR, plus per-confirmation reasons instead of a silent "no new prices". **Manual price entry is not an acceptable answer for this product.**

## Incident 2026-08-19 — Re-forwarding DELETED prices, proven (Jeff)

Root cause found by probe, not guesswork: `mergeFlightReservationUpdate` spread the incoming draft over the stored reservation, so a re-forwarded itinerary with `quotedPriceUsd: undefined` overwrote `1386` and replaced the receipt text. Every extra forward made it worse — exactly what Jeff reported. G39 fixes the merge, makes dedupe carry fares, and adds an inbox sweep that finds the receipt again. **Never ask Jeff to type prices manually.**

## Incident 2026-08-19 — Re-forwards wiped DPNNWG / Z84T4Z prices (Jeff)

Trip Accounting grouped DPNNWG (4 flights) and Z84T4Z (3 flights) but still showed Add price after multiple forwards. Later itinerary forwards were longer and replaced the receipt that had `New Ticket Value` / PDF fare. G38: never overwrite a priced source with a fare-less itinerary; stamp one total on every PNR leg. Confirmations untouched.

## Decision 2026-08-16 — End-to-end trip orchestration layer (Jeff)

G31 ships gentle passport/entry nudges, Home readiness summary, schedule overlap detection, and forward-only consumer stage hints. Kepi trip is truth; orchestration guides — never quizzes. Visa/passport links go to official sites only.

## Decision 2026-08-16 — Calendar sync is quiet background copy (Jeff)

After approve, a “Calendar sync failed” toast appeared and vanished — confusing because trip save succeeded. G30: never toast calendar errors on approve/import; sync only the booking that changed; skip incomplete rows; background retry on transient failures. Trip is truth; calendar is optional mirror.

## Decision 2026-08-16 — Forwarding is consent; review is for real conflicts (Jeff)

Jeff: if he forwards a booking, he wants it on the trip. Do not make him scroll GetYourGuide Privacy Policy to tap Add. Match booking `GYGVN24XVY58` against the trip and dismiss. Only interrupt when dates/times are wrong or two activities collide. Legal-only “ticket instructions” PDFs are not bookings. Confirmations untouched.

## Incident 2026-08-16 — Viator ticket-link review showed URL wall (Jeff)

1 of 3 was “pickup for your tour” + Parser confidence + a viator.com/MptUrl tracking link and Add / Already / Not mine. End users must never see that. G29: read Viator Booking 1435134507, auto-dismiss link stubs, calm Apple copy only. Confirmations untouched.

## Incident 2026-08-16 — Ticket-terms sheet still asked Add and said “damage” (Jeff)

After G28, 1 of 4 still showed “TICKET TERMS — NOT A BOOKING”, headline **damage**, and Add / Already / Not mine. Draft had a legal location line so Add stayed on. End users must never see that quiz — auto-dismiss. Confirmations untouched.

## Incident 2026-08-16 — Review sheet asked to add GetYourGuide legal terms (Jeff)

2 of 6 was “Fwd: Booking GYGVN24XVY58 confirmed | Ticket instructions”, 19/100, confirmation **ERENCE**, Add buried under Legal Notice. Already on Plan listed unrelated flights. Parser split `booking reference` into `ERENCE` and typed the leftover as a flight. G28 / I59. Do not ask him to re-forward the PDF.

## Incident 2026-08-16 — Trenitalia leftover scored 0/100 (Jeff)

Jeff confirmed the forwarded train email has dates, times, and platforms. The parser treated `13/09/2026` as US month 13, dropped date/place/code, and the review sheet ghosted an empty 0/100 card. I58 reads DD/MM + stations + Codice prenotazione. Do not ask him to re-forward the PDF.

## Operating rule 2026-08-16 — Never guess, never ghost, find the truth (Jeff)

Agents must not guess or ghost. Check the real booked facts end-to-end before shipping. Do it correctly the first time — retries cost Jeff more money. Motto for how Kepi thinks (not UI copy): **We search and find, so you don't have to miss — and we put your mind at ease.** Catch real misses; do not invent gaps. Also in `NEURO_BRAIN.md` § 10 and `.cursor/rules/35-find-the-truth.mdc`.

## Incident 2026-08-16 — Review sheet showed empty Train tickets (Jeff)

Sheet opened (G27) but 1 of 6 was “Train tickets / date not parsed / 0/100” with no original email. Jeff could not see what to approve. Empty leftovers must show the original forward and must not offer Add to trip. Confirmations untouched.

## Incident 2026-08-16 — Review bookings did nothing (Jeff)

Home Trip showed “6 bookings waiting for your OK.” The blue button set `consumerReviewQueueSession.open` and rendered no sheet. N1 would not have blocked that ship — it scores taps after the fact, and a dead button logs nothing. Never-ghost / G27 now requires a visible review surface. Inbox leftovers are not “missing from the trip.” Confirmations untouched.

## Decision 2026-08-16 — Neuro Brain is a feedback loop, not a model (Jeff)

Neuro Brain is **not** neuroscience and **not** a custom net. It is: measure honest actions → identify winners per traveler type → amplify winners → debug failures → ship weekly. Year-1 “smarter” = measured decisions, not a model that “realized it was wrong.” User taps are labels **only if the UI was honest**. Ghost prompts (Search flights for a hop that is already booked) must never be scored as winners. `search-flights` stays last and is never amplified above See routes / ground. Digest: `GET /api/ml-readiness/suggestion-outcomes`. Copyable Demand Generator prompt: `bot-deck/memory/demand-generator-pro-neuro-prompt.md`. Law **N1**. Do not A/B invented CLEAR / walking-delta / fake buffers.

## Decision 2026-08-16 — Apple hop truth on Plan (Jeff)

Hotel cities are context. Sept 13 should show the train and/or Venice-arriving flight already on the trip. A yellow “How are you getting there?” + Search flights is allowed only when that date window has **no** flight, train, or ride. Messy Trenitalia PDFs (Venezia S. Lucia) still count. Do not ask Jeff to re-import those confirmations.

## Decision 2026-08-16 — Lecce→Venice is already booked (Jeff)

Plan Calendar still showed MISSING TRANSPORT / “How are you getting there?” for Sun Sep 13 Lecce → Venice (BDS→VCE) and Search flights opened a new Google Flights search. Jeff already forwarded the train PDF and the flight that lands in Venice. Do not ask him to re-import those confirmations. Do not treat that hop as an empty search.

## Incident 2026-08-16 — Plan still red-screens after I55 (`Cannot access 'M'`)

Jeff: every Plan tap shows the same I54 chunk. I55 was live, but `?tab=itinerary` crashed before the page SW updater ran, and Try again remounted the same JS. I56: error page + Plan boundary clear PWA cache and reload once; layout DeployRefresh; SW `kepi-pwa-v38`. Confirmations untouched.

## Incident 2026-08-16 — Plan tab red-screen after I54 (`Cannot access 'M'`)

Jeff on `/travel-assistant?tab=itinerary`: `Something went wrong` / `Cannot access 'M' before initialization`. Cause: `savedBulletsByDay` used in `useMemo` deps before `useState`. Same TDZ class as I50 `s1`/`setToast`. Confirmations untouched. Hard-refresh after deploy.

## Incident 2026-08-16 — Save still blanked Sept 2 (Jeff)

Not locked. Paste worked; Save returned to Sept 2 with only “type or paste a line.” Cause: stay-only `plan.notes` (“Stay in Bari”) hid the saved `dayNotes`, and updateDayNote nested setState so itineraryPlans never got the line. Confirmations untouched.

## Incident 2026-08-16 — Save still dropped the day and scrolled to the bottom (Jeff)

Paste/reorder worked; Done/Okay did not keep Sept 2 and jumped to the end of the letter. Cause: letter preferred a stale Bari-wrapped `dayNotes` over the saved `plan.notes`; hydrate re-wrapped every day; closing the sheet scrolled iOS to the portal at the bottom. Confirmations untouched.

## Incident 2026-08-16 — Paste and Done did not keep the day (Jeff)

Talk inserted a line; paste did not. Done toasted “Updated plan: stay in Bari” and the letter looked unchanged. Accidental ✕ had no Undo. Cause: Paste needed a second tap; activity save wrote `dayNotes` only while the letter read stale `plan.notes`; stay-reconcile treated Bari mention as a hotel rewrite. Confirmations untouched.

## Decision 2026-08-15 — Tap a Plan day to edit it (Jeff approved)

Timeline letter stays. Tap Sept 2 / Edit / empty Add opens a full-screen day sheet: type, paste, talk, delete that day only. Confirmations untouched.

## Incident 2026-08-15 — Plan tab red-screen TDZ after I50 deploy

`Something went wrong` / `Cannot access 's1' before initialization` on `/travel-assistant?tab=itinerary`. Cause: day-plan backfill called `setToast` in a `useCallback` declared above `const setToast`. Confirmations untouched. Hard-refresh after the follow-up deploy.

## Incident 2026-08-15 — Plan Sept 3–4 only showed “Staying at A Casa di Elena”

Jeff on Plan (`tab=itinerary`): hotel stay facts correct; Word-doc activities (boat tour, GetYourGuide, viewpoints, gelato) missing. Cause: empty local `itineraryPlans` stamped `updatedAt: now` and beat server notes; persist could wipe Redis. Fix I50: merge empty days from server, refuse empty-shell wipe, backfill from stored email / Gmail / Paste itinerary. Do not tell him to re-import hotel/flight confirmations.

## Decision 2026-08-15 — Excursions print on the activity day (Jeff)

PDF / mail / Gmail tour confirmations (GetYourGuide, boat, dinner) belong under that date on Plan Timeline — name, time, confirmation. Same rule as hotel check-in. Confirmations untouched.

## Decision 2026-08-15 — Stay facts go on the check-in day (Jeff)

Do not dump every hotel at the top of Plan. A Casa di Elena / Polignano check-in, times, and confirmation belong under Sept 2. Checkout belongs on the checkout date. Confirmations untouched.

## Decision 2026-08-15 — Plan Timeline is her Word letter (Jeff)

Plan Timeline / day view must look like `Puglia_itinerary.docx`: title + SEPT 2–12, stay facts always visible, `Sept 2` headings, every bullet editable. Forwards and Gmail itinerary mail parse onto those days. Confirmations untouched.

## Decision 2026-08-15 — TripWalk Home execution card (Jeff: build / merge / push)

Home composes one TripWalk card: okay / next / leave-by / can-break. Gate change is one event (was X, now Y) with no invented walking-delta. Leave-by still uses `getLeaveByHint` (drive time not included). Took Claude’s sacred interrupt + confidence-or-silence; took Perplexity’s four Home questions. Rejected airport-only, on-device LLM as brain, Wallet-inferred CLEAR, CBP autofill, Mappedin/AR, invented TSA waits. Confirmations untouched.

## Shipped 2026-08-14 — Always + Precise family GPS (M20)

Native TestFlight app: `KepiAlwaysLocation` + token POST `/api/family/native-location`. She taps Always Allow + Precise once. Home Screen still cannot do this. Jeff: pull, ios:fix, Archive for TestFlight (Any iOS Device — not simulator). Confirmations untouched.

## Requirement 2026-08-14 — Family map must work like Life360 (Jeff)

Once she taps yes, Jeff must see her 24/7 with the phone silenced or in a pocket. Home Screen / website GPS cannot do that (Apple stops JS location when the screen locks). Today’s Capacitor shell is the same website in a WebView — installing Xcode as-is would not add Always tracking. Real Always needs native `CLLocationManager` + `UIBackgroundModes: location` + TestFlight, then she chooses Always Allow once. Confirmations untouched. Do not tell Jeff Home Screen can replace Life360 for this.

## Decision 2026-08-14 — This trip uses Safari Add to Home Screen (Jeff)

Jeff added kepitravel.com to the iPad Home Screen and will do the same on his wife’s iPhone. Pause Xcode / cable / TestFlight for this trip. Same signed-in site; confirmations untouched. Native App Store shell is later, not required to travel.

## Incident 2026-08-14 — iPad still blue after second rebuild (~10 min)

Two causes: (1) Capacitor `loadWebView()` `exit(1)` if `public/` missing — skip `super.viewDidLoad` and load https://kepitravel.com directly; AppDelegate retries if the WKWebView is not on kepitravel.com. (2) `SplashTransition` navy overlay + `opacity: 0` on children when Capacitor marks the page native — if hydration lags the trip is hidden under blue. Overlay removed (pass-through). Vercel deploy fixes (2) without a native rebuild if the WebView already loads the site. Confirmations untouched.

## Incident 2026-08-14 — iPad still navy/blue after G24 rebuild

G24 bundled `server.url` but Capacitor still `exit(1)` when `ios/App/App/public` is missing (it was gitignored). A 10-minute blue screen is the launch splash, not a slow site load. Fix: commit `public/index.html` + `config.xml`, hardcode `CAPACITOR_DEBUG=false`, `KepiBridgeViewController` forces https://kepitravel.com (ignore stale live-reload path), light launch screen. Jeff: pull, ios:fix, Clean, Run on iPad. Confirmations untouched.

## Incident 2026-08-14 — iPad blank blue after unplug / home-screen open

Debug builds had `CAPACITOR_DEBUG=true` and a gitignored `capacitor.config.json`, so the app waited for the Mac debugger. Force-quit + icon tap stayed on the navy splash. Fix G24: bundle `server.url` https://kepitravel.com, `CAPACITOR_DEBUG=false`. Jeff: pull, ios:fix, Run on iPad again, Stop, then open from the icon. Confirmations untouched.

## Incident 2026-08-12 — Simulator iPhone blank on kepitravel.com

## Incident 2026-08-12 — Simulator iPhone blank on kepitravel.com

Native WKWebView was app-bound to **only kepitravel.com**, which blocks Clerk (`*.clerk.accounts.dev`) and paints a blank light screen. Fix G23: remove `WKAppBoundDomains`, `limitsNavigationsToAppBoundDomains: false`. Jeff: pull main, `npm run ios:fix`, Run again. Confirmations untouched.

## Incident 2026-08-12 — Mac `ios:fix` NUCLEAR / empty iPhone destinations

Jeff’s Mac still had a **local CocoaPods `ios/`** (old nuclear script). That makes `Pods-App` errors and `Supported platforms for the buildables in the current scheme is empty`. Fix: quit Xcode, `git checkout origin/main -- ios/`, then `npm run ios:fix`. Do not use CocoaPods. Confirmations untouched.

## Decision 2026-08-12 — Native iOS SPM-safe shell (Picasso slice 7)

CapApp-SPM is Swift tools **5.9** + remote Capacitor core only (G22) so Xcode 26 can resolve packages. WKWebView after splash is light `#F5F5F7` (matches G21). `npm run ios:fix` after pull — do not use CocoaPods. Confirmations on the trip are untouched. Jeff still runs this on the MacBook Air (`unset SDKROOT`, then `ios:fix`, then `App.xcodeproj`). If hellospm still fails, Safari → Add to Home Screen.

## Decision 2026-08-12 — Visual chrome Lucide + light cards (Picasso slice 6)

Consumer More, empty Home, and Plan empty states use Lucide + light Apple cards (G21). No emoji section headers, no navy empty-trip cockpit. Gold Talk CTA kept. Confirmations on the trip are untouched.

## Decision 2026-08-12 — Disruption help is calm (Picasso slice 5)

Home/Flights delay and layover copy is factual (G20): “Short layover”, “Delayed”, “Cancelled” — not “connection issue”. Cancel still says Kepi will not invent seats (I32). Simulate-disruption buttons hidden in production. Confirmations on the trip are untouched.

## Decision 2026-08-12 — Map tab trip-first (Picasso slice 4)

Map opens on **stay pins + route** (G19). Family location is a secondary “Share location with family” link, not a co-equal pill. Desktop Map tab stays in the app shell (no dump into the family cockpit). Live map hides Dark/Sat style lab; Airport / Family labels are text-only. Confirmations already on the trip are untouched.

## Decision 2026-08-12 — Flights tab itinerary-first (Picasso slice 3)

Book → Flights opens on **upcoming tickets** with live status on the next flight (G18). Search launcher only when none are booked. Airport map is one tap on the next departure (not only the 48h terminal promo). Jeff: merge Picasso to main after this slice.

## Decision 2026-08-12 — Hotels tab stays-first (Picasso slice 2)

Book → Hotels opens on **booked stays** (G17). Search launcher only when nights are uncovered. City picker/stay planner no longer sit above existing hotels. Partner share still later when she’s home.

## Decision 2026-08-12 — Picasso trip shell + iOS for Jeff and wife (Jeff approved)

20-day trip: hide lab UI, Lucide tab chrome (G16), Share copy for partner, iOS `Info.plist` privacy + `com.kepitravel.app` + display name **Kepi Travel**. Native still needs working `swift package resolve` on the MacBook Air; fallback is Home Screen web app. Jeff: import confirmations, enable alerts, share trip link, TestFlight her Apple ID when SPM works.

## Decision 2026-08-03 — Live baggage claim on arrival coach (Jeff approved build)
FlightAware `baggage_claim` + AeroDataBox `arrival.baggageBelt` parsed into `FlightStatusSnapshot.baggageClaim`; merge fills from secondary when primary empty. Arrival Day Coach fetches flight-lookup and shows “Carousel X — from live flight status” only when a real value exists — never invent. Map expansion still frozen.

## Decision 2026-08-03 — Airport Day Coach Task B: arrive mode from journeyPhase (Jeff approved)
`deriveAirportDayCoachMode`: `journeyPhase.kind === "just-landed"` → arrive; else depart. Arrival IATA for navigator; hide immigration/customs when dep/arr countries match (`resolveAirport`). Orphan `ArrivalMode.tsx` removed (absorbed into fallback). Live status `"landed"` is enrichment only, not the trigger.

## Decision 2026-08-03 — Airport Day Coach Task A shipped
Departure fallback: time-budget reassurance (“until departure”); parent-owned Full day / Coach view toggle.

## Decision 2026-08-03 — Book flights = advisor hybrid (Jeff approved)
Book search uses fused ranking + genome origins (ONT/PSP/SoCal) for Top picks (overall / cash / miles / Alaska). CTAs are Google Flights / Seats verify only — no dollar on handoff buttons, no Duffel Airways. Full Command Deck stays off Book. Law F14.

## Decision 2026-08-03 — Calendar return day: no Munich after home (Jeff approved)
`fillCoverageGaps` must not extend the last stay past the final return travel day when `tripEndDate` is later. Return walkthrough/label names the ultimate home city (Ontario), not the connection (Rome); same-day multi-leg shows full chain. Law I46.

## Decision 2026-08-02 — Plan B Home engagement (Jeff approved)
Home is a coach, not a filing cabinet: one **Next up** action via `pickHomeNextAction` in MissionControl (desktop + mobile). Silent drain auto-imports celebrate with `PostBookingConfirmation` + toast. Lifetime invite unlock UX shipped earlier same day.

## Decision 2026-07-31 — Email-forward ingest F6/F7/F9–F12 (audit close-out)
Gate runs before planned-replace / flight-merge; per-draft `assessForwardedDraft` scores; drain default-deny unless `parsingStatus === "auto-parsed"`; duplicate drain keeps queue item with reason; unknown types forced to review; production fail-closed if `RESEND_WEBHOOK_SECRET` unset. F1–F5 already PASS from I30.

## Decision 2026-07-30 — RevenueCat IAP scope shipped in code (Jeff approved)
Native iOS upgrades use `@revenuecat/purchases-capacitor` (entitlements `kepi_pro` / `kepi_concierge`, products default `kepi_pro_monthly` / `kepi_concierge_monthly`). Webhooks: `POST /api/billing/revenuecat/webhook` (public; auth via `REVENUECAT_WEBHOOK_AUTHORIZATION`). Client sync: `POST /api/billing/revenuecat/sync`. Stripe still blocked on Capacitor iOS; web/PWA Stripe unchanged. **Jeff still must:** create App Store Connect subscriptions, attach in RevenueCat, set Vercel `NEXT_PUBLIC_REVENUECAT_IOS_API_KEY` + webhook auth, point webhook to `https://kepitravel.com/api/billing/revenuecat/webhook`, run `npx cap sync ios`.

## Decision 2026-07-30 — App Store: account deletion + no Stripe IAP substitute (Jeff)
Claude audit verified: no StoreKit/RevenueCat; Pro/Concierge is Stripe-only; no in-app delete. Shipped: `POST /api/account/delete` + Delete account in More/Billing (type DELETE). Native Capacitor **iOS** blocks Stripe Checkout (client + API `clientPlatform: ios_native`) until Apple IAP/RevenueCat. Web + PWA keep Stripe. **Next before App Store submit:** RevenueCat + StoreKit products mirroring Pro/Concierge; do not submit iOS binary that sells digital subs via Stripe.

## Decision 2026-07-30 — Onboarding must register push, not just permission (Jeff approved)
Step 3 “Turn on alerts” must call `subscribeToWebPushNotifications()` (same path as Home). Claiming “enabled” from `Notification.requestPermission()` alone left users without a server push subscription. iOS copy: Share → Add to Home Screen first. Only show “alerts on” when subscription is active.

## Decision 2026-07-30 — Batch 1 status/push trust (Jeff approved build)
Ship gate/delay alerts that key by reservation `flightDate` (F13), Home “Enable flight alerts” + honest next-flight status line, PostHog `push_subscribed` / `flight_status_push_sent`. Env already has FlightAware + AeroDataBox + VAPID. Next: Batch 2 travel-day surface; airports still frozen until travel-day opens show in PostHog.

## Decision 2026-07-30 — Path to must-have (Jeff approved build order)
Goal: travel-day family opens Kepi first — not “beat Flighty on every feature.” Ordered ship: (1) Flight status authority — FlightAware OR AeroDataBox enables live; FA wins merge; push bridge on background path (F12). (2) Hide sci-fi Dreamcaster/Sovereign/Guardian URLs+APIs. (3) PostHog optional via `NEXT_PUBLIC_POSTHOG_KEY` + travel-day events. (4) Free viral wedge — Share defaults view-only for Free (“Invite family to this trip”). (5) I45 archive hotel forwards (2018 payment-only) never invent March 2027 / auto-add. Next: PostHog project key in Vercel; FlightAware key if not already; measure travel-day opens before more SEA airports.

## Decision 2026-07-30 — Calendar: check-in day split, not day-after (Jeff approved)
False “Switch day” on Sep 3 (first full Polignano day) came from painting any leg-id change as a transition. Fix I44: Travel|City split only when travel+stay overlap (landing/check-in) or stay→stay; mid-stay days solid. Booked hotel city beats leftover day notes (“Leave Ortisei, go to Munich” on wrong day).

## Decision 2026-07-30 — Prep Home + smarter pricing (Jeff approved)
When trip is >14 days out, Home is prep mode (countdown, documents/entry guidance with official link, stays/pricing) — hide connection/next-flight chrome. Email cash parse: Airbnb “charged a total” beats “per night”; fall back to full email if near-booking slice misses payment. Spend badge opens **Trip Ledger** (this trip itemized + all-trips lifetime total + CSV export for taxes).

## Decision 2026-07-29 — Stay Gaps wording + Free/Pro clarity (Jeff approved)
Gaps say “After Venice checkout” not “near Venice.” Soft Free banner on Home: 1 trip; Pro = unlimited + email import + alerts ($9). Forwarding stays free.

## Incident 2026-07-29 — Stay Gaps nagged Sep 1 Polignano + Sep 25–27 Munich (Jeff)
Not an “AI misunderstanding” — deterministic night math. Blank AS180 `flightArrivalTime` made first sleep = Sep 1 and skipped airborne. Trip end +14 days past MUC→SEA invented Munich nights after flying home. Venice Sep 15–17 after Airbnb checkout Sep 15 is real (covers 12–14 only). Fix I40 in `tripNightCoverage`.

## Incident 2026-07-29 — Airbnb Venice forward never covered Sep 12–14 (Jeff)
Airbnb cards are yearless (`Sat, Sep 12`); regex required a year, so check-in/out stayed empty and “Payment scheduled Aug 29, 2026” became fake check-in. Draft sat in review / covered zero nights. Fix I39: labeled yearless Check-in/Checkout + year from payment line + Address→Venice + ignore payment-scheduled as stay date. Re-forward Venice Airbnb after deploy (or confirm from review if a draft is waiting).

## Incident 2026-07-29 — Home showed “292 nights open” (Jeff screenshot)
Root cause: I37 expand-to-min/max across all reservation dates mixed 2025 leftovers with 2026 flights → ~Sep 2025–mid-2026 span. Labels hide year so it looked like “Sep 1; Sep 8–11”. Fix I38: dominant-year cluster + 90-day cap; sleep window end from last return/hotel, not franken tripEnd. Real open nights for Europe stay in the tens (e.g. Sep 2–4 before NEREA, Sep 8–11, mid-gap after Venice) — not hundreds.

## Decision 2026-07-28 — Landing redesign Apple calm (Jeff approved)
Hero: Kepi + “Your trip, calmly handled.” + Start free (no invite). One phone demo carousel (stays / flights / Airport Mode) starts on tap. Two testimonials. Soft Free/Pro pricing. Invite/lifetime demoted to footer. No stats strip, dense feature grids, or competing CTAs.

## Incident 2026-07-28 — Stay Gaps still showing 2025 check-ins (Jeff screenshot)
Root cause: trip.startDate/endDate stayed 2025, so hotel remap pulled corrected 2026 hotels *back* into 2025. Fix I37: reconcile trip bounds before remap; coverage also repairs window in-memory. Real open nights after NEREA (checkout morning Sep 8) and Venice remain Sep 8–11 and 15–17 unless other hotels exist — do not ask Jeff to resend NEREA/Ortisei for those nights.

## Decision 2026-07-28 — I36 Apple chrome diet (Jeff approved)
Travel-day Home = one headline + Airport Mode CTA. Quiet green completeness. Remove Plan Trip Health strip (keep Trip status). Strip Flights guide cards. Light Plan/Book headers; Share sheet for exports; spend badge only when action needed. Split calendar colors stay (I35).

## Decision 2026-07-28 — I35 hotel year remap + calendar shared gaps (Jeff)
Stay Gaps showed “No hotel” for nights that had Booking.com hotels (NEREA, Ortisei) because check-in/out were stored as 2025 and drain dropped `checkOutDate`. Fix: remap hotels into trip window on load; preserve checkout on drain; sleep window starts at first destination arrival; Calendar uses same night coverage + amber “Needs stay”; **keep** split two-tone colors on hotel/city switch days. Real gaps remain Sep 9–11 and Sep 16–17 after NEREA/Venice checkouts.

## Decision 2026-07-28 — I34 stay holes + trip completeness (Jeff)
Night-by-night hotel coverage (Venice must not hide Cortina/Ortisei). Home-base: no hotel nag before first outbound from ONT; “Staying at home” sets `home-base-{IATA}`. Trip Completeness bar on Home (Flights/Hotels green when set). Support chat uses same stay-hole list.

## Decision 2026-07-28 — I33 Apple chrome diet (Jeff approved A→B→C)
A: Flights = tickets only (no TripFirst, one search surface, demote miles/cash badge, terminal promo ≤48h, gaps off Flights). B: Home single voice (check-in handoff, calm connection line, spend badge only when needed, no quick-link/tiles). C: Travel-day takeover (airborne / just-landed / at-airport → Airport Mode primary).

## Incident 2026-07-28 — False CONNECTION ISSUE on ONT→SEA→FCO (Jeff)

AS654 ONT→SEA had blank `flightArrivalTime` (UI showed "—"). Connection engine invented `depart+3h`, then flagged AS180 SEA→FCO as a conflict under mixed timezones. Real connection (~noon → ~2:30 SEA → 5:30 SEA) is fine. Fix: never invent arrival for conflict math; skip check when inbound arrival missing (F3). Test locks ONT–SEA–FCO case.

## Decision 2026-07-28 — Mission Control Home (Jeff)
Home is Mission Control with Today / This week / Trip zooms. Plan/Book/Airport Mode stay; Home composes trip truth and deep-links. No fabricated rebooking options.

## Decision 2026-07-23 — I30 ingest gate before enrich (Jeff approved build)
Gate runs on raw parser fields before enrich; hold `needs-review`; honor `missingFields`. Day-plan forwards still import booking-shaped drafts; out-of-window drafts queue for review. Unified `reservationDuplicates` empty-composite guard. Bug-report API surfaces `filingWarnings` when GH/Twilio not configured.

## Decision 2026-07-22 — Freeze airport-map expansion (Jeff)

Pause new airport-map work. SEA stays the showcase (`routeGrade: surveyed`). LAX/ONT stay schematic/partial. Do not add airports, new M-laws under maps, or touch `osmImport` / `controlPointTransform` / `layouts/` / `kepi-airport-bot` unless Jeff explicitly reopens. Redirect effort to whole-trip pipeline. Audit: `KEPI_CORE_PIPELINE_AUDIT_2026-07-22.md`.

## Decision 2026-07-22 — Email parse: no legal-footnote dates / CAREFULLY PNRs (I29)

ITA/Alaska-style forwards: ignore eTA/visa “Effective March 15, 2016” dates; prefer `Reservation code Z84T4Z`; never treat “confirmation carefully” as a PNR; airline from body/subject not Gmail. PDF may still hold the real legs — empty times beat invented 2016.

## Decision 2026-07-20 — Plan Excel export (I26)

Plan header **Excel** downloads SpreadsheetML `.xls` (Itinerary logistics + Day plan sheets) that opens in Microsoft Excel. No new npm dependency.

## Decision 2026-07-20 — Plan Timeline = day-plan letter (I28)

Plan **Timeline** uses the narrative Day-plan PDF layout (editable/draggable bullets), not photo-card timeline. No random Unsplash/picsum city thumbs. Strip “Applied AI fallback…” from traveler notes.

## Decision 2026-07-20 — Word day-plan itineraries (I27)

Forwarded `.docx` itineraries (Puglia-style day bullets) extract via mammoth, parse onto Plan days, push opens Plan. **Day plan PDF** = friend-share letter layout. Logistics table PDF stays separate. Old `.doc` not supported — save as `.docx`.

**Incident 2026-07-20:** First day-plan forward could create/activate an empty shell trip so Plan looked wiped. Fix: day-plan forwards never create trips; never rewrite `reservations` on day-plan-only updates; GET `/api/trips` recovers active trip to the richest booking trip if active is empty.

**Incident 2026-07-22:** Wife’s Puglia Word forward applied 11 days to empty “Trip to Polignano a Mare” (2025 dates) instead of Europe 2026. Merged notes into Europe 2026 (2026-09-02…12) and deleted orphan. Rule: day-plan dates inside a trip window (month/day, remap year) always attach to that booked trip.

## Decision 2026-07-20 — Print/PDF itinerary (I26)

Print/PDF/CSV: **Day** (not Owner), no Timezone, chronological local-time sort, type color rows, dense landscape print matching Adaptive Travel Assistant chrome. Out-of-window junk dates (e.g. 2018) dropped when trip dates exist.

## Decision 2026-07-20 — OTA hotel forwards show property name (I25)

Booking.com / Expedia / Airbnb forwards must headline the **property** (e.g. Casa de Elena), not the OTA. Parser reads “You’re confirmed at …”; UI uses `reservationPropertyName`; day chips + walkthrough say check-in / staying / check-out (including same-day moves). Existing bad titles salvaged from notes when possible — otherwise re-forward or edit the reservation title.

## Decision 2026-07-17 — Europe trip indoor airports (Jeff)

Trip path ONT→SEA→**BRI**→**FCO**→**VCE** (Marco Polo)→**MUC**. All four now have bundled schematic Kepi layouts (OSM gate clusters + terminal curbs surveyed; security estimate; no surveyed walking line yet). Venice = VCE not TSF. FCO OSM currently only cleanly clusters A+E — B/C/D omitted until tagged. Next upgrades: amenities + footway overlays per airport; trip-driven auto-queue still not built.

## Decision 2026-07-17 — Map helpers (admin-opt-in, Apple-simple taps)

Jeff enables specific free/lifetime invite users as map helpers in Admin → Users. While they walk an airport map they get large one-tap chips for nearby doors and amenities (no typing). Confirms go to `/admin/airport-editor` inbox; Jeff reviews — never auto-publish pin moves. Security is never a one-tap target.

## Decision 2026-07-16 — iOS CapApp-SPM / Xcode build (Jeff MacBook Air)

**Error:** Xcode *"Missing or empty JSON output from manifest compilation for capapp-spm"*.

**Cause:** `ios/App/CapApp-SPM/Package.swift` was committed with **Windows backslashes** in plugin paths (`..\..\..\node_modules\...`). Swift PM on macOS requires forward slashes.

**Fix shipped:** Regenerated `Package.swift` with `../../../node_modules/...` paths + `@capacitor/status-bar`; aligned `@capacitor/core`/`@capacitor/cli` to **8.4.1** (match `@capacitor/ios`).

**Jeff on Mac after `git pull`:**
```bash
cd ~/Documents/Kepi-Travel
npm install
npm run ios:sync
npm run ios:open
```
Then Xcode: **File → Packages → Reset Package Caches** → **Resolve Package Versions** → **Product → Clean Build Folder** → ▶ Run.

**CocoaPods not required** — this project uses SPM only (`App.xcodeproj`, not `.xcworkspace`). Ignore `pod` / Ruby errors.

**Pods-App.debug.xcconfig / `[CP] Embed Pods Frameworks` error:** Local `ios/` is an old CocoaPods template. Fix: `git checkout origin/main -- ios/` → `npm run ios:sync` → open `App.xcodeproj` (not `.xcworkspace`).

## Decision 2026-07-15 — Phase 2 SEA footways (surveyed walking routes)

SEA earns `routeGrade:"surveyed"` via OSM pedestrian-way overlay (`seaPedestrianWays.json`, Overpass 2026-07-15) + same-side snaps + curated pier/hall bridges (honest warning — OSM is not a continuous sterile-area graph). Security/train stay curated (M15/M31). LAX/ONT remain schematic until their overlays clear the same M37 gate. Pure footway-only surveyed (no bridges) is **not** earned yet.

## Decision 2026-07-15 — Verification pass closed (commit follow-up after 79db246)

After auditing `79db246`, Jeff said "go ahead with all":
1. **Icelandair → Door 7** (Port of Seattle Web-Ticketing_4.16.25.pdf United/Emirates cluster). Southwest Door 17 remains ESTIMATE (not on that PDF). AA/F9/SY at Door 21 (schematic between OSM 20–22); Alaska at surveyed OSM Door 22.
2. **Traveler pins show precision honesty** (`poiLocationHonestyTag` — schematic/extrapolated check-ins no longer look identical to surveyed).
3. **SEA_DOOR_ANCHORS rematched** to live OSM entrance nodes 4/12/14/20/22 (2026-07-15); skipped mis-ordered OSM refs 6/16/18/24.
4. **M35:** `LAYOUT_STALENESS_DAYS=180`, curation queue "Needs re-verification", import returns `vsPublished` diff, admin **Reference image → draft** wires `controlPointTransform`.

---

## Decision 2026-07-15 — Airport map MASTER PROMPT (Jeff — mandatory on every map build)

**Standing order:** Before building or changing any airport map (layout, OSM import, gates,
security, lounges, admin editor, route honesty), agents **must read** the full file:

`CURSOR_PROMPT_MASTER_airport_maps_all_airports.md`

Then use the kepi-airport-bot skill (`.cursor/skills/kepi-airport-bot/SKILL.md`) and
`KEPI_DESIGN_LAW.md` M15/M22/M26–M35.

**Enforced by:**
- `.cursor/rules/60-airport-map-master-prompt.mdc` (globs on airportNav / AirportNavigatorMap /
  airport-editor / airport-layout)
- `.cursor/skills/kepi-airport-bot/SKILL.md` — "REQUIRED FIRST READ" section

**One rule underneath:** never claim precision Kepi hasn't earned. Ground-truth where OSM tags
exist; security is permanently approximate; rules never change per airport — only how much of
each airport's data currently passes them. Do not special-case SEA. Do not auto-publish re-imports
over verified airports. M29 ≠ M33 — both must pass before "verified."

---

## Decision 2026-07-14 — VERIFY FIRST, NEVER GUESS (Jeff — mandatory, standing order)

**Why Jeff asked:** repeated guessing (map coordinates especially) shipped wrong
values, broke, and had to be re-fixed — "every time you guess it costs me time…
then you realize you'd been guessing." That loop is now banned.

**Standing order:** Before placing a coordinate, choosing an ID, assuming an API
shape/field, citing a version, or claiming a provider/config state, **get the
real answer from an authoritative source first** — Overpass/OSM for geography
(`curl` the API and read the real lat/lng), the Read tool for code facts, docs or
a live call for API behavior, the actual file for config. State the source (reply
+ code comment). If it truly can't be verified, **label it an ESTIMATE with the
reason** — never a silent guess. Lock load-bearing values with a test.

**Enforced by:** `.cursor/rules/50-verify-first-no-guessing.mdc` (always-apply).
Related: `KEPI_DESIGN_LAW.md` M26 (surveyed vs estimate), M27 (precision tiers),
M28 (airside routes follow the real OSM pier). Guard: `seaNodeContainment.test.ts`.

---


## Decision 2026-07-15 — Airport map scope: narrow to 1-2 verified pilots, not hundreds

**Why Jeff asked:** after repeated rounds of SEA map bugs (parking-lot placement, self-
intersecting terminal ring, flipped Alaska north/south, unverifiable security-checkpoint
coordinates), Jeff asked directly whether Kepi should drop indoor maps entirely, since "hundreds
of airports" can't all be reliably correct if even one pilot airport keeps breaking.

**Decision: narrow scope, don't drop it.** Precise indoor mapping (exact counter/checkpoint/gate
position) is genuinely hard, physical-world data — it's why companies like Atrius are entire
survey-based businesses. Free public data (OSM) is only solid where OSM actually surveys it (doors,
building shapes). Everything else needs real human verification, not just AI/curve estimation
presented as final.

**Going forward:**
- **Full precision effort goes to SEA only, until it is genuinely, humanly verified end to end** —
  every check-in counter, security checkpoint, gate, lounge, restroom checked by a person against
  real reference material (the door coordinates already OSM-verified, cross-checked against the
  airport's own public wayfinding map/photos), not just "passes the M29 structural audit" (that
  audit checks graph logic — reachability, no backtracking, sane coordinate ranges — it does **not**
  confirm real-world accuracy; don't conflate the two again).
- **Curve-calibrated interpolation** (fitting a curve through the 5 known real door anchors to
  estimate the rest) is allowed as a **fast draft generator only** — every interpolated/estimated
  position must go through a human review pass (the click-to-place admin tool) before being marked
  verified/published. Nothing ships as final on estimation alone.
- **Do not build toward "hundreds of airports" right now.** Every airport other than the verified
  pilot(s) shows the existing honest fallback (schematic view + prominent official-airport-map
  link-out), never unverified precise-looking pins that create false confidence.
- **Only after SEA is fully verified and stable**, consider a second pilot (likely LAX) using the
  same proven, human-verified process — expand one airport at a time, never in bulk, until the
  process itself has held up more than once.
- This supersedes any earlier framing that treated multi-airport rollout as close/automatic. See
  `CURSOR_PROMPT_curve_calibrated_full_door_import.md` and `CURSOR_PROMPT_admin_click_to_place_poi.md`
  for the mechanics — both now scoped under this narrower, human-verified-first rule.

---

## Decision 2026-07-13 — OpenStreetMap real airport maps (Phase 0 verified → Phase 1 shipped)

**Why Jeff asked:** replace square-box airport schematics with the airport's *real* shape for free; keep Kepi's routing brain as the actual differentiator. Must be lightweight, flawless on mobile.

**Phase 0 — VERIFIED (Overpass, 2026-07-13).** Real, measured indoor richness:

| Airport | Features | Gates | Leveled | Indoor rooms | Shops | Food | Toilets | Security |
|---|---|---|---|---|---|---|---|---|
| SEA | 1290 | 103 | 1120 | 197 | 53 | 74 | 53 | **0** |
| LAX | 815 | 148 | 540 | 11 | 72 | 78 | 41 | **0** |
| PSP | 68 | 16 | 8 | 0 | 6 | 5 | 1 | **0** |

Conclusion: rich at hubs, workable at small airports. **Load-bearing gap confirmed as the plan predicted: security checkpoints are untagged everywhere (0/0/0); lounges named inconsistently.** So imports are draft-only; curation hand-adds security + confirms lounges before publish.

**Phase 1 — SHIPPED.** `src/lib/airportNav/osmImport.ts` (pure, tested) converts Overpass output → existing `AirportLayout` (real zones + gate/lounge/restroom nodes + POIs + flagged straight-line walkway skeleton). Admin route `POST /api/admin/airport-layout/import` returns a draft; admin editor has an "Import from OpenStreetMap" button that feeds the existing validate → preview → confirm → publish flow. ODbL: `Map data © OpenStreetMap contributors` + derivative-database license note stored per package. Never fabricates security. Law **M15**. Spot-check any new airport on openstreetmap.org before first import (5 min).

**Phase 3 — DECISION (no uniform rollout).** Data richness varies too much for one recipe. Per-airport, decided at import via the 5-min openstreetmap.org spot-check: (a) **rich hub** (SEA, LAX) → full OSM import → curated draft (hand-add security + real walkways) → publish; (b) **small/thin** (PSP-like) → OSM base shape + handful of POIs, curator finishes fast (often one checkpoint); (c) **no usable OSM geometry** → stay hand-curated schematic or `OfficialAirportMapLink` fallback. Never promise site-wide OSM coverage; the fallback ladder (OSM real shape → Kepi schematic → official link → honest "not available") always holds.

**Phase 2 — SHIPPED (arrow + honest position UX).** `src/lib/airportNav/directionArrow.ts` (pure, tested): compass-heading direction arrow (`rotationDeg = bearingToNext − deviceHeading`), north-up + "compass off" fallback when no heading, relative turn cues, `confirmedSnappedPosition`. Wired into `AirportNavigatorMap`: `useDeviceHeading` hook (iOS permission tap), rotating arrow puck, "I'm here" tap-to-confirm that overrides GPS snapping. Landmark instructions already worked via `RouteInstruction.landmark` (no new model). **Bug fixed:** destination label vanished on tap because selection was derived only from `pendingPoiId ?? activeRoute.toPoiId` — a null route dropped it instantly. Now a persistent `selectedPoiId` is set on every tap. Law **M16**. Real-map (OSM) live callout extension is Phase 3 (OSM layouts aren't rendered on the live MapLibre map yet — only schematic/preview).

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
6. **Suggestion outcomes** — Redis list via `/api/ml-readiness/suggestion-outcomes` (`impression`/`dismiss`/`accept`/`click`). Inter-city transport + input-style card + Trip health missing-pricing are wired. **N1:** score only `metadata.honest !== false`; min 5 impressions before amplify; `search-flights` locked last.

Later (optional): embedding retrieval, ranker, bandit — only after correction volume justifies it. The neuro loop is the weekly digest of those outcomes, not a trained net.

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

- **Spend badge tappable** — header `TripSpendBadge` opens Trip Ledger (this trip + all trips lifetime total + CSV export). Ledger sheet lazy-loads on open.
- **Trip tab TDZ (2026-08-17):** `MissionControlView` read `zoomTouched` in a `useEffect` dep array before `useState` — caused `Cannot access 'Q' before initialization` on Home/Trip. Fixed by moving zoom state above that effect. Hard-refresh after deploy if stale PWA chunk (I56).
- **Trip tab trackEvent (2026-08-18):** `home_opened` analytics in `travel-assistant/page.tsx` called `trackEvent` without import — `ReferenceError: trackEvent is not defined` on Trip tab. Fixed I60.
- **Award pricing (2026-08-18):** United MileagePlus emails (`Total 24,000 miles + 195.80 USD`) parse miles + tax cash for trip spend badge/ledger (G33). ITA e-ticket PDFs (`Total Amount EUR 149.78`) parse from attachment text — re-scan fetches PDF when boilerplate-only email stored (G34). Email source is source of truth — stale stored `quoted*` refreshed on trip load and rescan. **2026-08-19:** Multi-leg PNR siblings inherit PDF text from same `sourceEmailId`/confirmation before parse; re-scan button enabled when Resend id exists even if stored text is short.
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

### TSA/security checkpoint wait times — real option, deferred until paying clients

- **Status (2026-07-14):** Researched live options for showing estimated security wait times
  somewhere in Kepi (not on the map itself — that's Atrius's proprietary live number, not ours to
  take). Found a real, working, paid option: **TSAWaitTimes.com** (TayTech LLC, not TSA-affiliated)
  — $49.95/mo self-serve (discounts at 3/6/12mo), 7-day free trial, server-side only, one estimate
  per airport (not per checkpoint), blends TSA/FAA + historical + user reports.
- **Checked for a free alternative — none held up.** FlightQueue has a free tier, but live security
  wait times are Premium-only ($4.17–6.99/mo), and third-party API access is Enterprise-only
  ($499/mo). TSA's own old public web service (`apps.tsa.dhs.gov/MyTSAWebService`) is marked
  "archived" by DHS (docs last updated 2023) and returned nothing when tested live — looks dead.
- **Decision: not now.** Owner's call — this is a real, buildable feature, but not worth $50/mo
  until Kepi has paying clients. **Revisit once there's paid-client revenue to justify the cost,
  not before.** Cursor prompt already written and ready to hand off when the time comes:
  `CURSOR_PROMPT_tsa_wait_times_integration.md`.

### Visual Positioning (VPS / camera-based indoor nav) — real option, not now

- **Status (2026-07-06):** Researched indoor-positioning alternatives to beacons: magnetic
  fingerprinting (IndoorAtlas-style), WiFi RTT, UWB, and camera-based Visual Positioning System
  (VPS). VPS is the one worth remembering — industry guidance now recommends it as the default
  for new indoor-nav builds over BLE beacons, and Google has shipped it at real airports/malls.
  It works like Google's outdoor Live View: camera compares the live scene against a pre-scanned
  image database of the venue, arrow overlays on the camera feed.
- **Real cost, not free:** requires a one-time photogrammetry scan of the airport's public areas
  (a genuine content project, same category of effort as the map-curation work) and continuous
  AR camera use drains phone battery at roughly 10-20% per hour — a real tradeoff for a traveler
  who needs battery all day.
- **Do not build now.** This is a bigger, resourced project for later, not a near-term task.
  **Do not keep re-raising it** unless Kepi has the resources/scale to justify a dedicated
  per-airport scanning project.
- **What we're building instead, now:** map-aided dead reckoning — constrain the existing
  step-counting position estimate to the walkway graph Kepi already curates, using data and code
  already in place. See `CURSOR_PROMPT_map_aided_dead_reckoning.md`. No new infrastructure, no new
  vendor, no new hardware.

### Atrius (indoor airport map/positioning vendor) — deprioritized

- **Status (2026-07-06):** Investigated embedding Atrius Wayfinder/Navigator (the vendor behind
  flysea.org's official SEA map) instead of building photorealistic per-airport maps in-house.
  No public pricing; enterprise-sales-only; case studies are all major hubs and airline-scale
  deals (Heathrow, JFK, Dublin, Austin-Bergstrom) — likely not accessible/affordable at Kepi's
  current scale.
- **Owner action:** Jeff sent one no-commitment outreach email to Atrius asking about small-company
  access and whether individual airports already license Atrius (so Kepi could be added as an
  approved partner app instead of a fresh Atrius contract). **Do not keep re-raising this or
  suggesting a bigger BD push** unless Jeff reports Atrius responded or Kepi's scale changes.
- **Do not build:** No embed integration work until real terms come back — see
  `CURSOR_PROMPT_map_vendor_embed.md` Part 2, which stays gated on this.
- **Primary path remains:** Kepi's own curated `AirportPackage` schematic + credential-aware
  routing + linking to the airport's free public map page. This does not depend on Atrius.

### Airport map POI detail — shipped + two deferred items (2026-07-14)

- **Shipped (M22):** zoom-tiered POI visibility (counter-level detail reveals only when zoomed
  in), `doorLabel` on counters/checkpoints, and airline branding on check-in counters via a
  Kepi-generated **IATA code chip** with a real-logo swap-in path. SEA curated with per-airline
  counters (AS/DL/UA/AC/EK), doors, and named checkpoints. Fields: `minZoomToShow`,
  `airlineIataCode`, `logoUrl`, `doorLabel` on `PoiDefinition` (+ Zod). Curated per airport
  through the existing admin JSON editor — no bulk auto-generator.
- **Real airline logos — SOLVED via Duffel (2026-07-14):** Kepi already has Duffel
  (`DUFFEL_ACCESS_TOKEN`, flights + stays). Duffel serves 600+ brand-compliant airline logos from
  its public CDN keyed by IATA code (`https://assets.duffel.com/img/airlines/for-light-background/full-color-logo/{IATA}.svg`,
  lockup variant under `full-color-lockup/`) — provided for building travel apps, no token needed
  for the image, `img-src https:` already permits it. `airlineLogoAsset` (`poiDetail.ts`) now
  resolves `logoUrl` → local override → Duffel CDN; the marker `<img>` has `onerror` → IATA code
  chip so a missing logo never breaks. **Do not re-defer this or re-suggest sourcing logo files —
  Duffel covers it.** Local `AVAILABLE_AIRLINE_LOGOS` override path remains for special cases.
- **Revisit later — live security/checkpoint wait times:** explicitly NOT built (same posture as
  VPS). This is a harder, honesty-sensitive feature that needs real Kepi traveler traffic through
  an airport to estimate credibly. **Do not fabricate a number.** Do not build until there is
  honest data to back it.

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

- When consecutive stay cities appear and that date window has **no** flight/train/ride, prompt “How are you getting from [A] to [B]?” Search flights is last resort.
- A booked flight that **lands in the destination city** (FCO→VCE for Venice) or a train/ride on that day covers the hop — even if the invented pair was BDS→VCE or the PDF says Venezia S. Lucia.
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

**Decision 2026-07-13:** Build Kepi-owned airport maps as reusable database packages, starting with SEA. Packages contain original vector geometry, a walking graph, POIs, licensing/source metadata, revision/status, and a verified date. Published database layouts feed live navigation and offline trip caches; bundled layouts are safe first-use seeds. Never copy official airport map artwork or claim phone GPS is survey-accurate indoors.

**Decision 2026-07-13:** Unsupported airport package requests automatically enter a shared, IATA-only curation queue with deduplicated demand and official-source metadata. No traveler identity is stored. Geometry may be prepared as a draft, but only validated, explicitly published packages replace the official-map fallback.

---

## Lifetime invite flow (2026-07-12; unlock UX 2026-08-02)

**User expectation:** Admin sends lifetime invite email → recipient clicks link → **Lifetime/Pro is on automatically** — no manual redeem in More tab, no onboarding step 1 "Next" required.

**Canonical path:**
1. Email CTA → `/redeem?code=XXX`
2. Unsigned → `/sign-up?code=XXX` → Clerk → `/travel-assistant?redeem=XXX`
3. `useAutoRedeemInviteFromUrl` POSTs `/api/invite/redeem`, refreshes billing, strips URL params
4. Onboarding also redeems on load / skip / complete (belt-and-suspenders)
5. **2026-08-02:** Code preserved across Sign in/Sign up + `localStorage` pending code; success/error **InviteRedeemBanner** with Retry; failures are not sticky (only successes remembered). Email copy requires same recipient email — no certificate framing.

**Gotchas:**
- Invite codes with `intendedEmail` require sign-up with that exact email (403 otherwise) — banner now surfaces this.
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
| 2026-08-16 | **G27 Review bookings sheet:** dead Home CTA was a session flag with no UI. Apple inbox: Add / Already on trip / Not mine. |
| 2026-08-16 | **N1 neuro feedback loop:** honest-only scoring, Search flights locked last, weekly digest GET, Demand Generator prompt. Confirmations untouched. |
| 2026-07-14 | **"Nothing changed after deploy" = PWA service worker, not a code/deploy failure.** This app is `next-pwa` (`public/sw.js`, `register:true`, `skipWaiting`). The SW is network-first for `/_next/static/` + navigations, so online users DO get fresh code — but the *already-open page* keeps running the old JS bundle until reloaded. Before blaming the fix, verify: commits on `origin/main` (`git log origin/main`) + the **Deploy** workflow ran `--prod` and succeeded (`gh run list --branch main`). Fixed durably: `src/app/travel-assistant/page.tsx` now auto-reloads once on SW `controllerchange` (guarded vs. loops + first-install) and polls `registration.update()` on load/tab-refocus, so future deploys appear without a manual clear. Immediate see-it-now: Settings → 🔄 Clear cache, or hard-reload. |
| 2026-07-06 | **Atrius embed deprioritized:** enterprise-only pricing, likely inaccessible at current scale; sent one no-cost outreach email, no BD push planned until real terms/scale change. Kepi's own schematic + routing pipeline remains primary. |
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
