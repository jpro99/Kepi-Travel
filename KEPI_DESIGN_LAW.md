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

**G15 — App Store account deletion + RevenueCat IAP on iOS native**  
Signed-in users must be able to permanently delete their account in-app (More / Billing → Delete account → type `DELETE`). Capacitor **iOS** must not open Stripe Checkout for Pro/Concierge — use RevenueCat/StoreKit entitlements `kepi_pro` / `kepi_concierge` instead. Web and PWA may keep Stripe.

**Test:** `src/lib/billing/nativeBillingGate.test.ts`, `src/lib/billing/revenueCatCatalog.test.ts`

**G16 — Consumer chrome is Apple-simple (no emoji tabs, no demo import in production)**  
Tab bars use Lucide line icons + short labels — never emoji as navigation chrome. Production builds must not show “Choose sample import” or other lab/demo ingest UI. iOS `Info.plist` display name is **Kepi Travel**, bundle id `com.kepitravel.app`, with location/notification privacy strings. Native WKWebView must load Clerk sign-in (do not app-bind only kepitravel.com).

**Test:** `src/lib/travelAssistant/consumerTabs.test.ts`

**G17 — Book → Hotels leads with stays you already have**  
If the trip has upcoming hotel reservations, Hotels must open on those stays (dates, nights, map) — not a search launcher or “which city next” cockpit. Search and stay-gap planner appear only when nights are still uncovered, or when the traveler taps Find.

**Test:** `src/lib/travelAssistant/hotelBookLead.test.ts`

**G18 — Book → Flights leads with the next ticket and live status**  
If the trip has upcoming flights, Flights must open on those tickets with live status (and gate when known) on the next flight — not a search launcher. Airport map is one tap on the next departure, not only the 48h terminal promo. Search appears when there are no upcoming flights, or when the traveler taps Search.

**Test:** `src/lib/travelAssistant/flightBookLead.test.ts`

**G19 — Map tab leads with trip truth (stay pins + next airport)**  
Consumer Map opens on the trip overview map (booked stays + route + next departure). Family live location is a single secondary link — not a co-equal pill or the default full-screen family cockpit. No Dark/Sat style lab or emoji view chrome on the consumer Map path. Airport indoor map stays one tap (Plan {IATA} / Airport mode), same as G18 and M11.

**Test:** `src/lib/travelAssistant/mapTabLead.test.ts`

**G20 — Disruption help is one calm next action**  
Delay and connection help on the consumer path is a single factual next step (check the flight, review layover time, airline handles rebooking). No “connection issue” / “flight problem” headlines, no simulate-disruption controls in production, no “rebook immediately” / “illegal” / “impossible” copy (**F1**, **I32**). Lab recovery autopilot stays advanced-workspace-only.

**Test:** `src/lib/travelAssistant/disruptionCalm.test.ts`

**G21 — Consumer More, empty Home, and Plan use Lucide + light cards**  
Consumer More section headers, empty Home, and Plan empty states use Lucide line icons and light Apple cards (`#F5F5F7` / `#1D1D1F`). No emoji section headers, no navy empty-trip cockpit. Gold `#f4c95d` CTAs stay (G4).

**Test:** `src/lib/travelAssistant/consumerVisualChrome.test.ts`

**G22 — Native iOS shell is SPM-safe and light after splash**  
CapApp-SPM uses Swift tools **5.9** and remote `capacitor-swift-pm` only — no `node_modules` path deps, no Swift 6.0 (Xcode 26 empty-JSON). WKWebView chrome after splash is light (`#F5F5F7`, dark status-bar icons) to match **G21**. Open `App.xcodeproj`, never CocoaPods. `npm run ios:fix` restores the manifest after `cap sync`.

**Test:** `src/lib/native/iosNativeShell.test.ts`

**G23 — Native WKWebView must show the live site, including Clerk**  
The iOS shell loads https://kepitravel.com. Do not set `WKAppBoundDomains` to only kepitravel.com, and do not set `limitsNavigationsToAppBoundDomains: true` — that blocks Clerk (`*.clerk.accounts.dev`) and paints a blank Simulator/phone. Sign-in and trip UI must appear after splash.

**Test:** `src/lib/native/iosNativeShell.test.ts`

**G24 — Native app must open kepitravel.com without the Mac attached**  
A device install (home-screen tap, cable unplugged) loads `https://kepitravel.com` from the bundled `capacitor.config.json`. `CAPACITOR_DEBUG` stays false so the WKWebView does not wait for Xcode. No blank launch-screen hang after force-quit.  
The repo must ship `ios/App/App/public/index.html` (Capacitor `exit(1)` if that folder is missing) and `KepiBridgeViewController` must set `serverURL` without using a persisted live-reload path. Launch screen is light `#F5F5F7` with “Kepi Travel” — never a navy image that can hang for minutes.  
`KepiBridgeViewController.viewDidLoad` must not call `super.viewDidLoad` (that is the `exit(1)` path). `SplashTransition` must never paint a full-screen navy overlay or set children to `opacity: 0` — that hid a loaded kepitravel.com for minutes in WKWebView.

**Test:** `src/lib/native/iosNativeShell.test.ts`

**G26 — Home is a trip execution card**  
Home answers four questions: Are you okay? What’s next? When do you leave? What can break? Leave-by never invents drive time (I32). A gate change is one event (“Was C12, now B4”); do not invent walking-delta (“6 gates / 4 minutes”) unless both gates are surveyed. Empty stored gate + live gate is an assignment, not a change.

**Test:** `src/lib/travelAssistant/tripWalk.test.ts`

**G27 — Review bookings must open a visible surface**  
A Home or Plan CTA that says bookings need your OK must mount a review sheet or drawer. Setting a session flag with no UI is a ghost and must not ship. Copy must not claim leftovers are missing from the trip — high-confidence forwards are already trip fact; the inbox is the unsure remainder. The sheet must show the original email/PDF text when the parse is empty — never only “date not parsed yet.” Do not offer Add to trip when there is no date, place, or confirmation. Suggest Already on the trip / Not mine. Never silent auto-approve the leftover queue.

**Test:** `src/lib/travelAssistant/reviewCtaHonesty.test.ts`

**G28 — Review inbox is for real conflicts, not legal PDFs**  
Forwarding a booking is consent to keep it. Match `Booking GYGVN24XVY58` (or the same code already on the trip) and dismiss — do not ask the traveler to add GetYourGuide Privacy Policy / Legal Notice. Do not bury actions under terms. Do not show unrelated flights as “Already on Plan” for a tour leftover. Auto-dismiss legal-only and already-on-trip leftovers (that is not auto-approving a new booking). A leftover titled “damage” with Add / Already / Not mine is a ghost — the traveler must never see it. Interrupt only when dates/times are wrong or two activities collide. Confirmations untouched.

**G29 — Review inbox is calm Apple, not parser chrome**  
Never show tracking URLs, “Parser confidence,” or garbage titles like “pickup for your tour.” Viator `Booking 1435134507` ticket-link forwards auto-dismiss. Real bookings show date, place, and one clear action — not three buttons and a URL wall. Confirmations untouched.

**Test:** `src/lib/travelAssistant/reviewCtaHonesty.test.ts`, `src/lib/travelAssistant/activityTicketExtract.test.ts`

**G30 — Calendar sync is quiet background copy, not an approve-time error**  
Kepi trip is truth; Google Calendar is an optional mirror. Never toast “sync failed” on approve or import. Sync only the booking that changed; skip rows missing date/place; retry transient failures in the background. Manual sync from settings may still report errors.

**Test:** `src/lib/travelAssistant/calendarSyncPayload.test.ts`

**G31 — Trip orchestration: gentle docs, honest readiness, schedule overlap, stage hints**  
Home shows a trusted readiness summary in prep mode. Passport/entry nudges are gentle with official links — never immigration advice. Schedule overlaps (dinner vs flight) surface on Home/Plan. Consumer trip stage advances forward only when dates and readiness allow — no quiz, no regression.

**Test:** `src/lib/travelAssistant/tripOrchestration.test.ts`, `src/lib/travelAssistant/missionControlView.tdz.test.ts`

**G32 — Trip ledger: itemized spend, lifetime total, CSV for family accounting**  
Spend badge opens a Trip Ledger sheet (consumer + advanced). **This trip** groups flights/stays with labels like `AS654 · ONT → SEA` and cash/miles per booking. **All trips** shows a running lifetime cash total, past-trip rows with per-trip spend, drill-down line items, and **Export CSV** for taxes/family records. My Trips list shows each trip’s logged spend when available.

**Test:** `src/lib/travelAssistant/tripAccounting.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts`

**G33 — Award emails with miles + cash taxes parse as both**  
United / MileagePlus confirmations show `Total 24,000 miles + 195.80 USD` — parse the grand total for trip spend (cash taxes + miles redeemed). Never read `12,000` as $12. Email source text is the pricing source of truth (stored `quoted*` refreshed on load/rescan). Multi-leg bookings on one confirmation dedupe miles/cash once. Ignore spurious six-figure `USD` / eTicket numbers without a strong total line; never resurrect stale stored `quotedPriceUsd` when email re-parse rejects junk. Never treat `24,000` miles as $24,000 cash (six legs of that is the $144k badge). Confirmations untouched.

**Test:** `src/lib/travelAssistant/parseReservationPricing.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts`, `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts`

**G34 — Airline e-ticket PDF totals (ITA EUR) parse for trip spend**  
ITA / European receipts often put `Total Amount EUR 149.78` only in the attached e-ticket PDF — email boilerplate alone has no fare. Parse PDF attachment text first; re-scan fetches PDF from Resend when flights still show “Add price”. Multi-leg PNR shares one total via confirmation dedupe. **Sibling legs must inherit PDF email text from the same `sourceEmailId` / confirmation before parse** — boilerplate-only legs must not block pricing. Confirmations untouched.

**Test:** `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts`, `src/lib/travelAssistant/rescanTripImports.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts`

**G35 — API fetch errors never show raw JSON parse text**  
When a route returns HTML/plain (“An error occurred…”) instead of JSON, client fetch helpers must surface calm copy — never `Unexpected token 'A'… is not valid JSON` in toasts. More tab card wallet, loyalty wallet, travel fit, trip load, and re-scan use `readJsonResponse` / `userFacingFetchError`.

**Test:** `src/lib/api/readJsonResponse.test.ts`

**G36 — Trip ledger groups multi-leg tickets by confirmation**  
One PNR (e.g. DPNNWG, Z84T4Z) is one ledger row with one cash/miles total — not one “Add price” per segment. Missing-price count uses PNR groups, not leg count.

**Test:** `src/lib/travelAssistant/tripSpendSummary.test.ts`

**G37 — Auto-log ticket total across every leg in a PNR**  
When a forwarded confirmation contains one fare (Alaska New Ticket Value, ITA PDF, United Purchase Summary), parse it once and write `quotedPriceUsd` / miles to **every leg** on that confirmation — on import, re-forward, re-scan, and trip load. No manual “Add price” per segment.

**Test:** `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts`

**G38 — Never overwrite a priced receipt with a later itinerary forward**  
A longer re-forward without `New Ticket Value` / PDF / Purchase Summary must not replace stored fare text. One parsed ticket total writes to every leg on that confirmation on import and trip load.

**Test:** `src/lib/travelAssistant/emailSourceText.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts`

**G39 — A re-forward may add pricing, never destroy it**  
`mergeFlightReservationUpdate` must not spread blank incoming pricing over a stored fare, and dedupe must carry cash/miles/source forward when collapsing legs. When a fare is still missing, Kepi sweeps the inbox for that confirmation's receipt — the traveler never types a price by hand.

**Test:** `src/lib/travelAssistant/tripEmailAttach.test.ts`, `src/lib/travelAssistant/flightItinerarySync.test.ts`

**G40 — Kepi finds the fare; the traveler never types it**  
Gmail import reads HTML bodies and PDF attachments, and re-scan searches the traveler's Gmail by confirmation code for the receipt behind an unpriced PNR. When a fare still cannot be found, say exactly why per confirmation (no email saved / itinerary without fare / total present but unparsed) — never a silent "no new prices."

**Test:** `src/lib/travelAssistant/gmailPricingSweep.test.ts`, `src/lib/travelAssistant/pricingDiagnostics.test.ts`

**G41 — Never gate the fare hunt behind stored email text**  
A confirmation code alone makes a booking re-scannable: the inbox and Gmail sweeps search by code. `countRescannableReservations` must include unpriced bookings with a real code, the Re-scan button must stay enabled while a trip has bookings, and the auto-hunt must run on any missing fare. Verified end to end — reservations with no stored email must still reach a priced ledger row.

**Test:** `src/lib/travelAssistant/pricingEndToEnd.test.ts`

**G42 — Dropping a receipt prices the bookings already on the trip**  
The ticket-scan API returns the document's plain text, and a dropped PDF/screenshot matches by confirmation code to price every leg of that PNR. It must never create duplicate legs just to carry a fare. The dropzone lives in Trip Accounting wherever an "Add price" row exists.

**Test:** `src/lib/travelAssistant/scannedDocumentPricing.test.ts`

**G43 — Ticket value beats amount due**  
Exchanges show `Total charges for air travel: USD $0.00` because nothing more is owed; that is not the fare. Parse `New Ticket Value` / bare `Total` labels / collapsed PDF spacing, and only suppress a ticket value when miles were **actually redeemed** — loyalty branding alone is not payment.

**Test:** `src/lib/travelAssistant/parseReservationCashUsd.test.ts`

**G44 — Undefined identifiers fail the build**  
`next.config` sets `ignoreBuildErrors`, so a missing import compiles and then throws `X is not defined` in the browser (the Book tab `canonicalFlightDepartureLocalTime` crash). `prebuild` runs `scripts/check-undefined-names.cjs` and fails on any TS2304/TS2552. Remember: `export { x } from "..."` does **not** bind `x` locally — import it too.

**Test:** `scripts/check-undefined-names.cjs` (prebuild gate)

**G45 — A typed fare must clear Add price**  
When the confirmation has no parseable cash (itinerary notes / fare-less forward), a plausible stored `quotedPriceUsd` from the reservation drawer counts. Do not keep saying “Add price” because notes or email exist. Email still wins when it has a real total. Award + $0 due still must not resurrect a ticket value stored as cash (G33/G43). Saving cash on one PNR leg stamps every flight on that confirmation.

**Test:** `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts`

**G46 — Airport Day Coach advances from facts, not checkboxes**  
The coach spotlight moves forward from booked/observed signals only: `just-landed` elapsed time, coarse GPS (`at-airport` / `in-terminal`), live baggage when the feed returns a real belt, and depart `LocationPhase` (time + geofence). Home TripWalk mirrors the same specific line — never generic “Open Airport Mode” when the next step is known. Optional manual “I’m through” is future; do not ship a frozen checklist.

**Test:** `src/lib/travelAssistant/airportDayCoach.test.ts`, `src/lib/travelAssistant/homeNextAction.test.ts`, `src/lib/travelAssistant/tripWalk.test.ts`

**G47 — Connection playbook from booked facts only**  
Same-airport connections get a step list built from itinerary + passport rules (immigration, bags, re-security, terminal change) — never invented MCT or gate predictions. Tight/impossible connections surface on Home; normal connections get steps when at the hub.

**Test:** `src/lib/travelAssistant/connectionPlaybook.test.ts`

**G48 — Strong official maps stay primary at FCO/SEA**  
When `wayfindingHonestyTier === strong` (SEA Atrius, FCO Digiport), the verified live indoor map is the primary gold CTA even if Kepi has a bundled schematic layout. Kepi checklist + flight context stay in-app; turn-by-turn walks hand off to the airport map.

**G49 — Never claim landed before departure; depart coach tells leave-by + real drive ETA**  
A mangled arrival timestamp must never produce "Landed Xm ago" while the departure clock is still in the future (AS654 ONT→SEA false landed). `computeJourneyPhase` skips airborne/just-landed when `now < dep`. Impossible arrival ≤ departure falls back to dep+4h. Depart Map/Airport coach shows leave-by (airport buffer only — I32) plus optional OSRM drive minutes labeled as route estimate, not live traffic — so "leave now → at terminal around X" is honest. Hotel Uber labels stay arrive-only (never the first Italy hotel while departing ONT).

**Test:** `src/lib/travelAssistant/journeyPhase.test.ts`, `src/lib/travelAssistant/departLeaveTiming.test.ts`


**Test:** `src/lib/airportNav/officialWayfinding.test.ts`, `src/lib/travelAssistant/airportDayCoach.test.ts`

**M39 — Travel-day flight order + today focus + terminal coach**  
All flight lists sort by canonical departure time (Ontario before Seattle on the same day). Travel day picks today’s earliest leg for Home, Map preview, and airport navigator. Schematic airports show “Terminal guide · pins approximate · follow airport signs.” Depart coach leads with airline + terminal when known (e.g. Alaska · Terminal 2 at ONT).

**Test:** `src/lib/travelAssistant/flightSort.test.ts`, `src/lib/travelAssistant/airportDayCoach.test.ts`

**M42 — Departure first-mile needs real check-in node kinds, not curb-only POIs**  
Departures coach + journey machine only fire when the layout has distinct `checkin` graph nodes (not just a `checkin` POI hung on the curb junction). `buildDepartDayCoachPath` walks the bundled graph curb → check-in → security → gate with honest minutes; numeric gate refs (ONT 205) must resolve to the correct terminal zone in `getRouteToGate`.

**Test:** `src/lib/airportNav/ontFirstMile.test.ts`, `src/lib/airportNav/tripJourney.test.ts`

---

## FLIGHTS LAWS

**F15 — Next flight is earliest remaining departure, not storage order**  
Home, Airport Mode, Book → Flights, and check-in handoff must pick the chronologically next booked segment (timezone-aware departure clock), including domestic connectors. Storage array order and long-haul role never override clock time — ONT→SEA before SEA→FCO on the same travel day. When `localTime` and `flightDepartureTime` disagree on the same day, use the later booked clock for sorting (live status may pull `localTime` earlier; delay updates push it later). Departure UTC conversion must use the **departure-airport IATA timezone**, not stored `flight.timezone` when it bleeds (e.g. `Europe/Rome` on a SEA departure would sort as 8:30 AM Pacific). Home TODAY uses `selectNextRemainingFlight` + `getLeaveByHint` on that pick — not a separate travel-day picker; leave-by labels render in departure-airport local time.

**Test:** `src/lib/travelAssistant/flightSort.test.ts`

**F1 — No alarmist connection language**  
Never headline "illegal", "impossible", or "rebook immediately" for through-tickets. Present factual options (make connection vs protect with insurance/time buffer).

**F2 — AI never does timezone math**  
Pre-compute `utcTime` and `seq` in context blocks. Use `Date.UTC` + `Intl` offset algorithm — never `new Date(localTimeString)` (browser TZ pollutes UTC).

**F3 — Missing arrival times stay missing**  
When arrival is not stored, show `[not stored — do not estimate]`. AI and UI must not invent arrival clocks. **Connection conflict detection must not invent `depart+Nh` arrivals** — blank inbound arrival means “skip connection check,” never a red CONNECTION ISSUE (false positives destroy trust).

**Test:** `src/lib/travelAssistant/tripTransportRoute.test.ts`

**F4 — Through-ticket connection thresholds**  
Short connections on through-tickets (e.g. HNL 2–3.5h) are **warnings**, not critical panic, unless separate tickets.

**F5 — Flight changes update stays**  
When flights change, hotel stay segments recompute via shared trip modules (`deriveTripStaySegments`) — do not duplicate date logic in flight-only code.

**F6 — Status polling scope**  
Auto flight-status polling only for flights within 24h; must not spam or crash when provider is down.

**F9 — Flight status freshness is phase-aware**  
Within **6 hours** of departure, client and server polls must run at least every **90 seconds** when the app is open or a background sweep is active. Between 6–24 hours, **5 minutes** is acceptable. When GPS geofence says **at-airport** or **in-terminal**, poll every **4 minutes** — enough for gate changes without freezing the app (never sub-minute client loops on airport Wi‑Fi). Away from the airport, never poll faster than the phase tiers above. **FlightAware AeroAPI** is preferred when configured (`authorityRank` higher); **AeroDataBox** co-sources. Either key enables live mode. Discrepancies are logged, never silently discarded.

**Test:** `src/lib/travelAssistant/flightStatusCadence.test.ts`, `src/lib/travelAssistant/flightStatusMerge.test.ts`

**F12 — Live status + push must not depend on AeroDataBox alone**  
`hasLiveFlightStatusCredentials()` is true when FlightAware **or** AeroDataBox is set. Client lookup and Inngest auto mode must not 503/mock solely because AeroDataBox is missing. Gate/delay pushes use the shared push bridge on lookup and background update paths.

**Test:** `src/lib/travelAssistant/flightStatusCredentials.test.ts`

**F14 — Book flight search is advisor + honest handoff**
Book → Flights search ranks personalized top picks (overall / cash / miles, multi-origin incl. nearby SoCal like PSP) via fused search + traveler genome — not a raw Duffel dump with locked-looking prices. External CTAs are Google Flights / Seats.aero verify only: never put a dollar amount on a handoff button; never show Duffel Airways / test carriers as airlines; quote lines say confirm on Google.

**Test:** `src/lib/flights/bookFlightAdvisorPicks.test.ts`

**F13 — Push snapshots key by reservation flightDate**  
Background and interactive gate/delay pushes must key status snapshots by the flight's **reservation date** (`YYYY-MM-DD` from `localTime` / `flightDate`), never silently by "today." Using today caused alerts to miss or collide across days. Providers must attach `flightDate` on `TravelUpdateEvent`.

**Test:** `src/lib/travelAssistant/resolvePushFlightDate.test.ts`, `src/lib/travelAssistant/flightStatusPushBridge.test.ts`, `src/lib/travelAssistant/flightStatusTrustLine.test.ts`

**F10 — Check-in handoff is honest**  
Check-in prompts open at **24h before departure**. Kepi may deep-link to airline check-in or a stored Wallet/pass URL — never render a scannable barcode it does not hold. UI must state where the boarding pass actually lives.  
Handoff `href`s must be **absolute `https://` only** (relative paths open on kepitravel.com and hit Clerk’s “got lost” page). Airline check-in URLs must be live entry points — never ship soft-404s (Alaska is `/checkin`, not `/check-in`; JetBlue `/checkin`; Hawaiian `/manage/check-in`).

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

**M20 — Native Always + Precise family location**  
TestFlight / Xcode Kepi uses iOS `CLLocation` **Always** + **Precise** and keeps publishing while the phone is locked, silenced, or in a pocket. Home Screen / Safari cannot. The web app mints a location token; native POSTs to `/api/family/native-location`. Same publish rules as in-app `update-location` (no coarse first pin).

**Test:** `src/lib/family/nativeLocationToken.test.ts`, `src/lib/family/decideFamilyLocationWrite.test.ts`, `src/lib/native/iosNativeShell.test.ts`

**M9 — Ground transport uses honest deep links first**  
Uber/Lyft actions must prefill pickup/dropoff from known trip locations via universal deep links. Native in-app ride booking is deferred until a partner API is approved — never fake a booked ride.

**Test:** `src/lib/travelAssistant/groundTransportDeepLinks.test.ts`

**M10 — Airport preview never depends on WebGL or network tiles**
Curated airport planning maps must render terminal zones, walkways, POIs, and routes from local layout data without MapTiler or WebGL. A failed or lost MapLibre context may reduce 3D polish in live mode, but must never leave a blank airport screen.
POI names and leader lines must share the terminal SVG coordinate system; labels may stagger to avoid collisions but must remain close to their actual anchor. Default to essential wayfinding and reveal lounges/all services on demand.

**Test:** `src/lib/airportNav/schematic.test.ts`, `app-sitter/airport-day-of-travel.spec.ts`

**M11 — Mobile airport planning stays visible and touch-first**
A future flight at a curated airport must expose **Plan {IATA} airport** on the mobile Map tab even when the traveler is outside the geofence. Airport schematics use 48px+ destination controls, show only the selected POI label with a clear leader line, and put route steps in a readable bottom sheet; selecting a preview route must explicitly say live guidance begins on arrival.

**Test:** `app-sitter/airport-day-of-travel.spec.ts`

**M12 — Airport wayfinding uses the best honest source**
There is no universal downloadable live indoor airport map. Kepi must use a verified airport-owned live map when available (`supportsStepByStep: true` in `VERIFIED_AIRPORT_WAYFINDING`, e.g. SEA Atrius, FCO Digiport), a clearly labeled **orientation-only** official map when the airport has a map but not step-by-step, and a clearly labeled **weak Google venue-search fallback** otherwise — never dress the weak fallback up as confident indoor directions. When `wayfindingHonestyTier === strong`, the airport's live map is always the primary gold CTA (G48) — even if Kepi has a bundled schematic. For other tiers where Kepi has a layout, **Kepi's map is the primary tool**; the external link is secondary ("Extra reference · not step-by-step"), not a gold CTA that implies turn-by-step. Honesty tiers live in `wayfindingHonestyTier` (`strong` | `official_static` | `weak`) and drive `OfficialAirportMapLink` + `AirportNavigatorFallback` presentation.

**Test:** `src/lib/airportNav/officialWayfinding.test.ts`, `src/lib/airportNav/pathfinder.test.ts`, `app-sitter/airport-day-of-travel.spec.ts`

**M13 — Kepi airport maps are versioned, original route packages**
Each Kepi-owned airport map is stored as a versioned database package containing original vector zones, a validated walking graph, POIs, source/licensing metadata, and a last-verified date. Public navigation reads the published database package first, seeds from a bundled safe fallback when necessary, and refreshes the traveler’s offline cache from the published API. Every edge, POI, and gate resolver must reference a real graph node; official map artwork is reference material, never copied into Kepi.
Package lifecycle tests must use pure in-memory inputs and must never write draft or synthetic layouts into shared Redis.

**Test:** `src/lib/airportNav/airportLayoutPackage.test.ts`, `app-sitter/airport-day-of-travel.spec.ts`

**M14 — Missing airports enter a demand-driven curation queue**
When a traveler requests an airport without a published Kepi package, record a shared IATA-level curation request with deduplicated demand and verified official-source metadata. Never store traveler identity in this queue, and never auto-publish generated or imported geometry. A validated draft must be explicitly published before it can replace the official-map fallback.

**Test:** `src/lib/airportNav/airportCurationQueue.test.ts`, `app-sitter/airport-day-of-travel.spec.ts`

**M15 — OpenStreetMap import is a draft source, never a published shortcut**
Kepi may import an airport's real building/concourse shapes, gates, lounges, and restrooms from OpenStreetMap to replace square-box schematics. Verified 2026-07-13: OSM indoor data is rich at hubs (SEA 1290 features/103 gates, LAX 815/148) and workable at small airports (PSP), but **security checkpoints are untagged everywhere (0/0/0)** and lounges are named inconsistently. Therefore an OSM import must: (1) produce a **draft only** and route through the same admin validate → rendered-preview → human confirmation gate as hand-curated packages (M13); (2) **never fabricate security** — synthesized walkways are a clearly-flagged straight-line skeleton a curator must replace, and security nodes/lanes are added by hand before publish; (3) store `Map data © OpenStreetMap contributors` attribution and an ODbL license note, treating the extracted routing graph as a derivative database (share-alike on the extracted data); (4) fall back to hand-curation, not a broken import, when OSM lacks usable geometry. Kepi's credential-aware routing stays authoritative regardless of visual source.

**Test:** `src/lib/airportNav/osmImport.test.ts`

**M16 — Direction arrow is compass-honest; position can be user-confirmed**
The airport wayfinding arrow points the way the traveler is *actually facing* by rotating to `bearingToNextNode − deviceCompassHeading`. When the compass is unavailable or permission is denied, the arrow falls back to a north-up bearing and says so ("compass off" / "Head toward …") — it never pretends to know facing. Turn cues are relative to travel direction (Straight ahead / Bear / Turn / Sharp / Turn around). Travelers may tap "I'm here" and then **tap the map (or a gate/checkpoint/POI pin)** to lock position to the nearest graph node; this user-confirmed fix outranks noisy indoor GPS (positionFusion already grants `user_confirmed` the top confidence grade). Confirm mode shows a **top banner** ("Tap the map where you are — not this button"); the control moves **bottom-left** and becomes **Cancel** so the support-chat FAB never covers the instruction (`kepi:airport-confirm-spot` hides the FAB). When PreCheck / journey **after-questions** are open at the bottom, **I'm here** moves to the **top-left** (never under those sheets) and **Guide me to Gate** hides until the questions are answered. An always-on **Gate HUD** shows the booked gate large enough to read; gate changes surface a temporary banner; arriving within ~35 m of the gate pulses **You're here · on time** (or delayed). The "I'm here" control must stay tappable above PreCheck / journey question sheets — never hide it under those prompts. Booked gates pulse on the map when assigned; **Guide me to Gate X** starts the walk from the confirmed/GPS origin. **Departures keep walk-to-gate guidance on** (auto-start once Wi‑Fi/GPS snaps you on the graph + resume after security / manual dismiss) until the traveler is at the booked gate — including on the Live Map / airport Wi‑Fi shell; the route card stays visible through security and **Close** is hidden while that gate walk is active. Arrival first-mile (Leonardo rail, etc.) stays map-first without auto gate walk. Landmark instructions reuse the existing `RouteInstruction.landmark` field — do not add a parallel landmark system. **On the apron / runway, the map puck always follows raw GPS** (not the nearest gate/building snap); walk routing and auto gate-walk only start when graph snap is trustworthy (`travelerPosition.ts`, >45 m off-graph = orient-only) or the traveler taps **I'm here** inside the terminal.

**Test:** `src/lib/airportNav/directionArrow.test.ts`, `src/lib/airportNav/confirmTravelerSpot.test.ts`, `src/lib/airportNav/gatePresence.test.ts`, `src/lib/airportNav/travelerPosition.test.ts`, `src/lib/airportNav/airportNavigatorMap.tdz.test.ts`

**M17 — The airport map is the real OpenStreetMap basemap, zoomable, with the SVG floor plan as an always-on fallback**
The airport view renders the **real OpenStreetMap basemap** so travelers see the true terminal shape, parking, roads and taxiways drawn to scale — "the map from that site." When a MapTiler key is available (passed as the `maptilerKey` prop from `/api/config`) it uses the **vector OpenStreetMap style** (`maptilerStyleUrl("openstreetmap", key)`): road/place labels are real MapLibre text that stays crisp at any zoom and whose size we control, not baked-in raster pixels. When no key is present it uses the free **OSM raster tiles** (`buildOsmRasterFallbackStyle()` → `tile.openstreetmap.org`, in CSP `connect-src`, no key). Because the key arrives async, map init waits a short grace (~1.2s) before committing to raster so keyed sessions get the vector look; `attachMapStyleErrorFallback` drops a failing vector style back to raster (and reinstalls the route layer) so it never blanks. It is flat/top-down (`pitch 0, bearing 0`), pinch-zoomable, with an explicit `NavigationControl` (+/−) and the required OSM/MapTiler `AttributionControl`; `minZoom 12 / maxZoom 19`. Our overlays sit **on top** of the basemap: the traveler's terminal footprint outline, the walking route, POI markers (a colored dot on the exact coordinate + haloed name, `anchor:"left"`) and the user puck. The camera `fitBounds` to the layout's real geometry (`computeLayoutBounds`), not a fixed center/zoom. **The light SVG floor plan (`AirportSchematicLayer`) always renders underneath the map as the base layer** (z-1 below the map's z-2): it paints instantly, works offline, and if tiles or the WebGL context ever fail the screen **never blanks** — it falls back to the floor plan. The map is used in **both** planning (`previewMode`) and at-airport, and both look identical (owner intent — travelers must feel comfortable in both). Never remove the SVG fallback layer; never hardcode a fixed center/zoom over the real geometry.

**Test:** `src/lib/airportNav/layoutBounds.test.ts`

**M18 — SEA ships the real OSM footprint with a hand-curated routing graph**
The SEA pilot (`src/lib/airportNav/layouts/sea.ts`) renders the airport's **real shape**: one main terminal (concourses A–D radiate inside it) plus the North and South satellites, from OpenStreetMap (`./seaFootprints.ts`, `Map data © OpenStreetMap contributors`, ODbL — regenerate, never hand-edit). Node anchors use real OSM gate-cluster centroids so pins sit on the real building. Per M15, the **routing graph stays Kepi-curated** — security checkpoints/lanes, walkways, train links and their calibrated traverse times are hand-authored (OSM has no security tagging). Never replace the curated graph with the raw OSM star-skeleton, and never fabricate security to make the map look complete. Gate anchors must fall inside their matching footprint (no pins in water/parking).

**Test:** `src/lib/airportNav/layouts/seaLayout.test.ts`

**M19 — The airport floor-plan fallback is a light plan, not dark blocks**
The always-on SVG fallback layer (`AirportSchematicLayer`, under the OSM basemap per M17) uses a light "floor-plan" aesthetic modeled on official airport maps (e.g. flysea): a cream/light canvas (`LIGHT_MAP` in `AirportNavigatorMap.tsx`), light-gray building fills with clean outlines, concourse names in dark text with a white halo, category-colored **icon markers** (check-in blue, gate amber, security rose, lounge emerald, restroom slate, train violet) that are tappable, a blue route line, and a blue user puck. Never render the terminal as dark navy blocks. When the real OSM basemap loads it fades in on top; the light floor plan shows through only while tiles load or if WebGL fails, so the two stay tonally consistent (light on light). Kepi-owned/OSM-derived — we do not embed or copy any airport's proprietary map artwork.

**Test:** `src/lib/airportNav/schematic.test.ts`

**M20 — Dead reckoning is map-aided, never wall-crossing, and never over-confident**
Inside a terminal, indoor GPS drops out and position falls back to dead reckoning (step count + heading). A raw DR estimate is free-space and drifts — projected naively it walks straight through walls and then snaps to the geometrically-nearest node even when that node is unreachable. `projectDeadReckoningOnGraph` (`pathfinder3d.ts`) constrains the previous→incoming displacement to the walkway graph: from the last known node it walks the displacement along connected edges, following the edge whose bearing best matches the traveler's heading and transitioning at junctions. It **refuses to fabricate a turn the graph does not offer** and **refuses to pick between two equally-plausible branches** — both mark the fix `ambiguous`. `fuseFix` (`positionFusion.ts`) applies this to the `dead_reckoning` case: it only constrains geometry, it **keeps the existing DR confidence decay and 0.55 ceiling**, and an ambiguous projection lowers confidence further (never raises it). A trusted fix (`user_confirmed` / `os_indoor`) always re-anchors the walk. Never let graph-constraining be used to inflate confidence, and never move the puck to a node the graph cannot reach from the last known position.

**Test:** `src/lib/airportNav/deadReckoning.test.ts`

**M21 — The airport map highlights THIS trip's journey, not every POI**
The airport map is trip-focused, not a directory. `buildTripJourney` (`tripJourney.ts`) turns the layout + the traveler's flight context into the short ordered path that matters — **drop-off → check-in (their airline) → security (nearest checkpoint) → lounge (only if eligible) → their gate** — and the map draws that as one connected route line (`journeyRoute`, chained leg-by-leg along the real walkway graph) plus emphasised markers. Every other gate/lounge/POI is **kept as a faint grey reference dot** (owner: "I don't know why we need all the gates… you can have others as reference points"), never removed. The gate is a firm, strongly-highlighted stop **only once assigned**; before that it is a `known:false` "assigned soon" placeholder and the concourses stay reference-only. This logic is airport-agnostic (works off any `AirportLayout`, hand-curated or OSM-imported) so it replicates to every airport. Tapping a specific POI still routes turn-by-turn to it (overrides the journey line); the journey line is the default so nobody has to guess. Node anchors must stay on the real building (SEA gate centroids are the live OSM per-concourse centroids — M18); never scatter emphasis across irrelevant POIs.

**Test:** `src/lib/airportNav/tripJourney.test.ts`

**M22 — Airport POIs reveal progressively by zoom; airline logos are labels, never scraped**
The airport map shows detail in tiers like a real commercial airport map, never all at once. Terminal/zone shapes are always visible; major anchors (gates, security checkpoints, lounges, trains) appear at a middle zoom; **counter-level detail — individual airline check-in counters, doors, restrooms — only appears once zoomed in close.** Each POI has a tier via `poiMinZoom` (`poiDetail.ts`): a per-POI `minZoomToShow` overrides a per-category default. The live map reads `map.getZoom()` on a `zoom` listener and toggles marker visibility; the traveler's journey stops, assigned gate, selected POI and their own airline's counter are **always visible regardless of zoom**. Airline branding on a counter uses `airlineLogoAsset`, resolving in this order: an explicit `logoUrl` → a locally-committed override (`/airline-logos/{code}.svg`, code in `AVAILABLE_AIRLINE_LOGOS`) → **Duffel's brand-compliant CDN logo** by IATA code (`duffelAirlineLogoUrl`, `assets.duffel.com`). Duffel is the blessed logo source: Kepi is a Duffel customer and Duffel serves 600+ licensed airline logos keyed by IATA code precisely for building travel apps (no token needed for the image; `img-src https:` already allows it). The `<img>` has an `onerror` that swaps to a Kepi-generated IATA code chip / plain text — **never a broken image, never blocking on a missing logo**. Logos label an airline's own real counter (TripIt/Flighty/Google style), never implying partnership. **Hard boundary:** we never copy or hotlink a *map vendor's* (e.g. Atrius) rendered tiles, logo images, or live wait-time numbers (Duffel's logo CDN is explicitly *not* a map vendor and is licensed to us); physical layout facts (where a counter/door/checkpoint is) are hand-curated into Kepi's own `AirportLayoutPackage`, same as every other POI. New POI detail fields (`minZoomToShow`, `airlineIataCode`, `logoUrl`, `doorLabel`) are optional and must stay mirrored between `types.ts` and the Zod schema in `airportLayoutPackage.ts`.

**Test:** `src/lib/airportNav/poiDetail.test.ts`

**M23 — Every curated in-building node coordinate is verified inside its real polygon before merge**
A node's real `[lng, lat]` IS its marker position on the live map — `AirportNavigatorMap` renders POI markers with `.setLngLat(pos)` and no separate projection, so a wrong coordinate puts the counter in the wrong real-world place (SEA's Delta/United/Air Canada/Emirates check-in once rendered in the parking structure east of the terminal because the coords were eyeballed, never checked). **No hand-placed check-in/security/in-building node coordinate ships unverified.** The *intent* of this law stands, but its **verification mechanism is SUPERSEDED by M26**: proving a node is inside `SEA_OSM_FOOTPRINTS.mainTerminal` via `booleanPointInPolygon` is NOT reliable, because that ring is an auto-derived, simplified backdrop and a genuinely-correct real coordinate can fall just outside it (SEA Door 4 does). Verify against **ground-truth OSM feature coordinates** (M26), not the derived polygon. Never re-fix placement by eyeballing a screenshot, and never let the terminal ring gate a verified real-world coordinate.

**Test:** superseded by M26 — see `src/lib/airportNav/layouts/seaNodeContainment.test.ts` (now a ground-truth door test).

**M24 — Planning-mode preview shows the get-through-the-door path and frames the main terminal**
Before the traveler is at the airport (planning/`previewMode`, gate usually pending), the journey line draws **only drop-off → check-in → security** (`preSecurityJourney`), not the full airside line to a lounge/gate — snaking a long line across the terminal to a lounge before arrival reads as a confusing spike toward the parking side, not a helpful path. The full journey line (through lounge → gate) is drawn at the airport / once the gate is assigned. The preview camera frames the **landside main terminal** (`computeLandsideBounds` — airside=false zones) where check-in and security are, not the whole airfield incl. satellites (which shrinks the terminal and pushes it off toward parking). Both helpers are pure/airport-agnostic so this holds for any layout. Do not draw the airside spur in preview; do not frame the whole airfield in preview.

**Test:** `src/lib/airportNav/tripJourney.test.ts`, `src/lib/airportNav/layoutBounds.test.ts`

**M25 — Published layout packages are cached in Redis and win over source; a seed fix only ships when the bundle version bumps AND republishes; zone rings must be simple**
The live airport map does **not** read the bundled layout source (`sea.ts`) at runtime — `GET /api/airport-nav/[iata]/layout` calls `resolvePublishedAirportLayout`, and a **published `AirportLayoutPackage` in Redis/Blob always wins**; the bundled seed only fills in when no package exists. So editing coordinates in a bundled layout does **nothing** to production on its own — the stored package keeps serving the old geometry (this is exactly why the SEA check-in/security fix "changed nothing": Redis served seed revision 6 / `0.1.0-beta-schematic` while the corrected source was `0.4.x`). The rule: **bump the bundle's `layoutVersion` whenever you change geometry.** `resolvePublishedAirportLayout` auto-republishes a **seed-originated** stored package (identified by matching `bundledSource(iata).attribution`) when the bundle's `layoutVersion` differs, so the fix reaches live traffic without a manual admin republish — while **admin- and OSM-curated** publishes (different attribution) are never clobbered. Never "fix" a bundled layout by nudging coordinates without also bumping `layoutVersion`; never assume a source edit alone updated production; never delete/overwrite a curated (non-seed) published package from code. Separately, a node's `booleanPointInPolygon` result is only trustworthy if the ring is **simple**: every bundled zone ring (and the raw OSM footprints they derive from) must have **zero `@turf/kinks` self-intersections** and be closed — a self-intersecting ring makes containment lie near the crossing. Validate ring simplicity as a permanent test for every airport, not a one-off diagnostic.
**Test:** `src/lib/airportNav/airportLayoutStore.test.ts`, `src/lib/airportNav/layouts/zoneRingValidity.test.ts`, `src/lib/airportNav/layouts/seaNodeContainment.test.ts`

**M26 — In-building node coordinates are ground-truthed from satellite-aligned OSM features, never eyeballed and never validated against our own derived ring**
The correct source of truth for "is this check-in/door/checkpoint dot in the right real-world place" is a **real coordinate read from satellite-aligned mapping data we're allowed to read** — OpenStreetMap's surveyed `entrance`/`gate`/building nodes via Overpass — **not** an estimate and **not** the app's own auto-derived terminal ring (`SEA_OSM_FOOTPRINTS`, which is a simplified decorative backdrop; a verified door can legitimately fall just outside it — SEA Door 4 does). Repeatable per-airport method (hand-verify once, through the curation pipeline — we do NOT build an auto-detection engine; OSM has no security tagging and inconsistent check-in tagging): (1) for each node, find the real physical spot (cross-referencing a reference map like flysea/Atrius **only to know which door/airline/checkpoint you're placing**, never as a coordinate source), (2) read the real coordinate from OSM (e.g. SEA departures doors are `entrance` nodes with real `ref` numbers — low = south, high = north; Alaska is at the NORTH end, international carriers south), (3) hand-enter it and **comment how it was verified + the date**. **Do not let door confidence bleed into checkpoint confidence.** A node is one of two honesty tiers and must be labeled as such: **(a) VERIFIED ground truth** — a coordinate read from OSM (doors, gates, buildings); comment it with the source + date. **(b) ESTIMATE** — anything with no open data source, chiefly **security checkpoints** (OSM has no checkpoint tagging, M15). Estimates are placed *sensibly relative to* the verified doors/hall, but their lat/lng is inferred, not read — so they must be labeled honestly in the code comment **and** surfaced to the traveler (e.g. the security POI `notes` say "Approximate location — best estimate"). Never write "verified"/a verification date on an estimate, never claim a checkpoint pin as ground truth, and replace it the moment a real source appears. Fixing the terminal ring's shape is separate, lower-priority, cosmetic work — it must never block or override a verified coordinate. After curating, do a full visual pass on the live map at a zoom where all nodes are visible and confirm each dot sits on the correct real building/door. Bump `layoutVersion` and republish per M25 so the fix ships.
**Test:** `src/lib/airportNav/layouts/seaNodeContainment.test.ts` (asserts each landside node matches its real OSM door coordinate + the real north→south airline order)

**M27 — Fill the gaps between OSM-verified anchors with curve-calibrated interpolation, tagged surveyed vs schematic vs extrapolated**
When a facade has a handful of real, survey-grade anchor coordinates (SEA's ticketing hall has 5 real OSM `entrance` `ref` doors), the approved way to place every *other* door/counter is **georeferencing-by-control-points**: fit a curve (piecewise-linear is fine) through the real anchors, ordered by door number, and interpolate the real-world `[lng,lat]` of the in-between doors (`interpolateDoorPosition`, `doorCurve.ts`). This is a *calibrated estimate anchored to survey points*, not a screenshot guess — the same way real cartography extends control points into a full map. **Honesty is mandatory and machine-checked:** every generated POI carries `precision` — `surveyed` (exactly an anchor door), `schematic` (interpolated between two anchors), or `extrapolated` (outside the anchor span — lower confidence, e.g. SEA doors <4 or >24). Never present an interpolated door as equally certain as an anchor; never widen the anchor span silently. **Airline→door assignments are a separate axis** and are owner-/reference-sourced physical facts (which carrier sits at which door on the public ticketing map — never a map vendor's proprietary data), NOT independently re-verified door-by-door in code; the click-to-place admin tool is the human correction path (see `seaTicketingHall.ts`). Named amenities (Children's Play Area, restaurants) use **real OSM indoor coordinates**, tagged `surveyed` — never guessed. The `precision` field must stay mirrored between `types.ts` and the Zod POI schema so it survives republish. This method is airport-agnostic — reuse `doorCurve.ts` for the next airport's hall.
**Test:** `src/lib/airportNav/doorCurve.test.ts`, `src/lib/airportNav/layouts/seaTicketingHall.test.ts`

**M28 — Airside routes follow the real pier; concourse geometry is OSM-anchored, not a straight chord to a guessed centroid**
A drawn walking route must never leave the building. The failure mode: a sparse graph connected the airside hub straight to a single hand-guessed gate centroid (and a lounge coordinate ~220 m into the apron), so the line cut across taxiways and "walked the user outside." Fix and rule: each concourse **enters at its real neck gate** (OSM `aeroway=gate` "Gate 1") and runs to a **real mid-pier gate cluster**, with an extra mid-spine bend on long piers, so the polyline bends *along* the pier and stays inside. Every airside node coordinate — necks, gate clusters, lounges — is a real OSM `aeroway=gate` / named indoor-room coordinate (Overpass), never eyeballed. Satellite (N/S) gates are reached only via the `train` edge (M-train), shown as the dashed leg (see AirportNavigatorMap train overlay). New airport concourses must be built the same way: pull `aeroway=gate` refs, anchor neck + mid-pier + far nodes, then wire the spine. **Machine-checked:** re-anchored coordinates are guarded against drift.
**Test:** `src/lib/airportNav/layouts/seaNodeContainment.test.ts`

**M29 — Every airport layout passes the generic routing-quality gate before publish; the SEA mistakes are enforced as code, not remembered per-airport**
The SEA bugs (routes across the tarmac, M/W zigzags, lounges 200 m outside, destinations wired to a hub no route reaches) all came from one root cause: the OSM importer (`osmImport.ts`) synthesizes a **star-graph-to-a-central-hub** skeleton, and each airport was fixed by hand afterward, guarded only by SEA-specific tests. That does not scale — every new airport would reintroduce the same class of defect. So the lessons are now **generic invariants** in `auditLayoutRouting` (`layoutQuality.ts`), enforced in two places:
- **Publish gate:** `createAirportLayoutPackage` runs `assertLayoutRoutingQuality` for any `status: "published"` (so no bundled seed OR OSM-imported/admin-curated draft can go live with these defects). Drafts stay rough on purpose; **reads are never gated** (legacy packages still load).
- **Build gate:** `allAirportsQuality.test.ts` runs the audit over *every* bundled layout (add each new airport to its `ALL_LAYOUTS` list, mirroring `getLayout.ts`).

The audit checks, orientation-independent, for any airport: (1) **reachability** — every journey-critical destination (gate/lounge/checkin/security/train) must be routable from the landside origin; contextual pins (amenity/restroom) that are unreachable are a *warning*, not a blocker; (2) **no-backtrack** — a route to a gate/lounge/train may spend at most `MAX_BACKTRACK_RATIO` (50%) of its direct distance moving away from the destination (catches the far-hub zigzag; SEA routes sit at 0–12%); (3) **coordinate sanity** — no node more than `MAX_NODE_DISTANCE_FROM_CENTER_M` (15 km) from the airport center (catches wrong-city/ocean/typo coords).

What the audit deliberately does **NOT** do: validate coordinate *accuracy*. Only real per-airport OSM ground-truth can (verify-first, rule 50) — accuracy stays enforced per airport by a `*NodeContainment`-style test. **New-airport playbook (emulate SEA, do not re-derive):** (a) OSM Overpass → building outline + `aeroway=gate` + named indoor rooms; (b) anchor concourse neck + mid-pier + far nodes on real gate coords (M28); (c) wire each concourse to its *nearer* checkpoint, checkpoints joined so either reaches either (monotonic — no artificial hub); (d) place doors via `doorCurve.ts` with `precision` tags (M27); (e) add a `*NodeContainment` test with OSM ground truth; (f) register in `getLayout.ts` **and** `allAirportsQuality.test.ts`; (g) publish only after the gate passes + human preview confirmation.
**Test:** `src/lib/airportNav/layoutQuality.test.ts`, `src/lib/airportNav/allAirportsQuality.test.ts`

**M30 — Never draw a walking route we can't stand behind; schematic layouts show pins + a time estimate, not a confident line**
The routing audit (M29) proves a destination is *reachable*, but a straight-line skeleton between curb/security/gate anchors paints a confident blue line that cuts through terminals, roads, and parking — a lie the traveler can see. So `AirportLayout.routeGrade` gates the drawn route: `"surveyed"` draws the full turn-by-turn line; **absent/`"schematic"` (the honest default) draws NO route line** — the real OSM basemap + accurate pins + an *approximate* time estimate carry the guidance, with an "Approximate layout — pins from OpenStreetMap" banner. Flip an airport to `"surveyed"` only via the Phase 2 footway overlay (M37) after journey-reachability clears. Applies everywhere the map renders (traveler Live Map + admin verify).

**Test:** `src/lib/airportNav/routeGradeHonesty.test.ts`

**M31 — Landside↔airside may only be crossed through a `security_transition` edge (structural, every airport)**
It is not enough to *look* correct — a traveler must never be routable from a landside node to an airside node without passing security, so "security past the gates" / a sterile-area bypass is impossible in the data itself. Enforced in shared code (`validateAirportLayoutGraph`): any edge whose endpoints differ in `airside` must have `kind: "security_transition"`, or the layout fails to parse/publish. Never special-cased per IATA — the rule is identical for airport #1 and #100; only each airport's data differs.

**Test:** `src/lib/airportNav/groundTruthConformance.test.ts`

**M32 — Security checkpoints are permanently approximate: never `precision: "surveyed"`, always disclaimed (every airport, forever)**
Security-screening areas have zero ground-truth tagging in any public indoor-mapping source — OSM tags none at any airport checked, and Apple's IMDF standard *deliberately excludes* the screening area as security policy, not a data gap. This is a settled, permanent decision, not an open research task: never claim an exact checkpoint coordinate for any airport, ever, and never chase "one more data source." A `security` POI may never carry `precision: "surveyed"` (enforced in `validateAirportLayoutGraph`); it is rendered as an approximate zone (not a sharp pin) with a mandatory, un-buried disclaimer ("Approximate security screening area — exact checkpoint location and lane setup can change without notice. Follow posted airport signage."). Security nodes still get the checks that don't need exact ground truth (M31 landside/airside topology, entrance proximity, tight entry/exit pairing). The only path to better-than-approximate is a human physically confirming via the click-to-place tool — and even then it stays labeled approximate. **Render (shipped):** in `AirportNavigatorMap` a security POI draws as a soft dashed radial "approximate area" (never a sharp dot), its label always carries a `· approx. area` tag, and routing to it shows the verbatim disclaimer from `securityDisclosure.ts` (`SECURITY_APPROX_DISCLAIMER`) — one shared source of truth so the copy can never be softened or dropped in one place.

**Test:** `src/lib/airportNav/groundTruthConformance.test.ts`, `src/lib/airportNav/securityDisclosure.test.ts`

**M33 — Ground-truth conformance is a separate gate from routing logic; both must pass before "verified" (every airport)**
M29 proves the graph is *routable*; M33 proves each curated coordinate matches the real OSM ground truth. Passing one is never proof of the other. Implemented once in shared code (`osmGroundTruth.ts::checkOsmGroundTruth(layout, osmElements)`), airport-agnostic, run at import/re-import against the OSM in hand (pure, fixture-testable): (1) a gate POI claiming `precision:"surveyed"` must sit within `GATE_EXACT_MATCH_M` of the real `aeroway=gate` node with that `ref` — no clean ref ⇒ it stays schematic; (2) a landside curb/drop-off node must be within `CURB_ROAD_MAX_M` of a real `highway=*` way; (3) a POI must not sit on a different-category OSM feature (a gate on a restaurant/toilet node); (4) an indoor POI (gate/check-in/lounge) must fall inside a terminal/concourse footprint, but only after that ring passes `@turf/kinks` (never gate on a self-intersecting ring — skip with a warning and rely on the other checks). Where an airport's data can't satisfy a check it surfaces as an error/warning; the rule is never loosened to make an airport look finished. Findings flow into the import `warnings` (drafts stay rough; nothing auto-publishes).

**Test:** `src/lib/airportNav/osmGroundTruth.test.ts`

**M34 — Promote every real, named, coordinate-tagged OSM feature; pool control points across categories; click-to-place is the human gate**
Anything OSM already tags with a real coordinate and a useful name (shops, food, toilets, lounges, banks/ATMs, elevators, escalators, charging stations, baggage claim, …) is fair game for a traveler POI — import it at the exact OSM coordinate as `precision:"surveyed"`, never invent missing ones, never re-derive from a screenshot. `osmImport.ts` conversion (not just the Overpass query) must promote these; unnamed shops/food stay out. For georeferencing drafts from a public reference image, **pool control-point anchors across categories** (`poolControlPointAnchors` — doors, gates, lounges, elevators, escalators, named amenities), not just a door row; a door-only pool is insufficient for 2D depth (`controlPointPoolSupports2dTransform`). 2D affine projection (`controlPointTransform.ts`) produces `schematic`/`extrapolated` drafts only — never final without human confirmation via admin **click-to-place** (`applyClickToPlace` + `AirportNavigatorMap` `placeMode`), which feeds the existing draft → preview-confirm → publish path. Security click-to-place stays approximate (M32). Full airline check-in coverage (every carrier on the public ticketing directory, not a handful of majors) is required where curated — guarded by `seaTicketingHall.test.ts` for SEA; other airports use click-to-place + control-point drafts.

**Test:** `src/lib/airportNav/osmImport.test.ts`, `src/lib/airportNav/controlPointAnchors.test.ts`, `src/lib/airportNav/controlPointTransform.test.ts`, `src/lib/airportNav/clickToPlace.test.ts`, `src/lib/airportNav/layouts/seaTicketingHall.test.ts`, `src/lib/airportNav/layouts/seaOsmAmenities.test.ts`

**M35 — Staleness, import diffs, and traveler-facing precision honesty (every airport)**
Layouts go stale when airlines move counters and OSM updates. Every package carries `source.lastVerifiedAt`; past `LAYOUT_STALENESS_DAYS` (180) the admin curation queue surfaces **Needs re-verification** (`layoutStaleness.ts`). Re-importing OSM against a published/bundled baseline returns a POI-level **diff** (`layoutDiff.ts` — added/removed/moved ≥25 m) and never auto-publishes. Traveler map labels must hedge schematic/extrapolated pins (`poiLocationHonestyTag` → "approx. location" / "estimated location"; security still uses M32's "approx. area") so a curve-interpolated check-in never looks as confident as a surveyed OSM door. Reference-image georeferencing is wired in admin (`ReferenceImageGeorefPanel` + `referenceImageDraft.ts`) — affine drafts stay schematic/extrapolated until click-to-place confirm.

**Test:** `src/lib/airportNav/layoutStaleness.test.ts`, `src/lib/airportNav/layoutDiff.test.ts`, `src/lib/airportNav/poiPrecisionHonesty.test.ts`, `src/lib/airportNav/referenceImageDraft.test.ts`, `src/lib/airportNav/allAirportsPrecisionHonesty.test.ts`

**M36 — Door-ref anchors must be monotonically ordered along the facade before they drive a curve**
`doorCurve.ts` interpolates by door number, assuming that ordinal tracks physical order along the ticketing facade. A mis-tagged OSM entrance (real coordinate, wrong `ref` — SEA's old Door 24) silently poisons every interpolated counter near it. `findMonotonicityOutliers(anchors)` projects anchors onto the best-fit line through the set and flags any door that reverses relative to its neighbors; `osmImport` surfaces each outlier as a draft warning ("exclude before using as a curve anchor"). Airport-agnostic — no hardcoded axis. Curated SEA anchors (4/12/14/20/22) must pass; a synthetic mid-facade high-number ref must fail.

**Test:** `src/lib/airportNav/doorMonotonicity.test.ts`

**M37 — Phase 2 surveyed routes = OSM footways + same-side snaps + honest curated bridges**
To earn `routeGrade:"surveyed"`, overlay real OSM pedestrian ways (`highway=footway|corridor|path|steps`) via `buildFootwayGraph` + `applyFootwayOverlay`: (1) snap curated nodes only to **same-side** footways (security entry→landside, exit→airside) so M31 cannot be bypassed; (2) drop landside↔airside footway edges; (3) keep curated `security_transition` + `train`; (4) retain curated walkway **bridges** only where OSM is not a continuous sterile-area graph — and surface that count as a warning (do not claim pure-OSM corridors); (5) flip to surveyed only when journey POIs are reachable, critical nodes snapped, and footway edge count clears the gate. SEA ships this path with `seaPedestrianWays.json` (Overpass 2026-07-15); LAX/ONT stay schematic until their overlays clear the same gate.

**Test:** `src/lib/airportNav/footwayGraph.test.ts`, `src/lib/airportNav/routeGradeHonesty.test.ts`

**M38 — Map helpers are admin-opt-in; one-tap confirms never auto-publish**
Jeff can enable specific users (lifetime/free invites) as **map helpers**. Those users see Apple-simple one-tap chips while walking (`Door 22`, `Starbucks`) — no typing required. Confirms store the helper’s position + chosen label in an admin inbox. **Never** auto-move layout pins or flip precision from a helper tap; admin reviews, then uses click-to-place / curated edit. Security POIs are never offered as one-tap survey targets (M32). Helpers are off by default for everyone.

**Test:** `src/lib/airportNav/mapHelperNearby.test.ts`

**M40 — Arrivals phases are position-driven, never itinerary-inferred; customs is a real border crossing, not a bypass**
Arrivals (`customs` / `baggage_claim` / `ground_transport` — added 2026-08-21, LAX pilot) detect purely from which real node kind the traveler is standing at, same honesty posture as departure phases — a domestic arrival simply never has a `customs` node nearby, so no "are you international?" guess is ever needed. Clearing CBP is a real government checkpoint, not a landside/airside bypass — the `customs → baggage_claim` edge must be `kind: "security_transition"` with `laneType: "customs"` so M31 still holds; `allowedLanes()` always includes `"customs"` (unlike TSA lanes, there's no credential-gated choice — every international arrival passes through it). LAX's ground-transport data (LAX-it rideshare pickup vs. the separate Terminal Connector/parking shuttle) is curated from LAX's own official public PDFs (`LAX_ARRIVALS_RESEARCH_MEMO.md`), not travel-blog aggregation — reading the airport's own current wayfinding documents directly is the standard first step for future airport passes, departures or arrivals. All new nodes ship `precision: "extrapolated"` (no OSM ground truth exists for customs/baggage/ground-transport anywhere) pending human verification against the real terminal, same bar as every other airport. **Currently dormant:** the shipped Arrival Day Coach (`coachMode`) always renders `AirportNavigatorFallback` for arrivals, never the live indoor map — this graph has no live UI path yet; wiring it in is a separate, later decision.

**Test:** `src/lib/airportNav/journeyMachine.test.ts`, `src/lib/airportNav/layouts/laxNodeContainment.test.ts`, `src/lib/airportNav/pathfinder.test.ts`

**M41 — Arrivals coverage is a demand-driven curation dimension, independent of departures**
`AirportCurationRequest.arrivalsStatus`/`arrivalsDemandCount` track whether an airport has customs/
baggage/ground-transport coverage (`hasArrivalsCoverage`) separately from its departure `status` —
an airport (LAX) can be fully curated for departures and still show zero arrivals coverage; folding
the two into one status would hide that gap. `GET /api/airport-nav/[iata]/layout` records arrivals
demand whenever a real request resolves a layout missing those nodes, same 5-minute dedup as
departure demand, never altering the response. This is a queue-entry signal only — it never
fabricates coverage or auto-publishes; admin still moves `arrivalsStatus` through
requested → draft → published by hand, same verify-first bar as everything else in this section.

**Test:** `src/lib/airportNav/airportCurationQueue.test.ts`

**M43 — Walk map serves the trip, not a mall directory (ONT basemap model)**
Live airport maps keep the **real OSM basemap** (runways, terminal hull) with **tiny walk pins** on top. Shop/food directory POIs never render. Walk references only: curb, this trip's counters, security, bags, official clubs, assigned gate — not 100+ grey gate reference dots. Human names render **outside the terminal hull** on leader-line callouts with collision nudging; nothing stacked unreadable inside the footprint. OSM shop data stays in `seaOsmAmenities.ts` for import drafts only.

**Test:** `src/lib/airportNav/poiMapWalkPolicy.test.ts`, `src/lib/airportNav/layouts/seaTicketingHall.test.ts`, `src/lib/airportNav/paintWalkMapLeaderOverlay.ts`

**M62 — Live on campus: Kepi map is primary; flysea is reference only**
When the traveler is physically at an airport (`proximityStatus` is `at-airport` or `in-terminal`) and Kepi has a bundled layout for that IATA, **stay in-app** — `OfficialAirportMapLink` and `AirportNavigatorFallback` must not present the airport's strong official map (SEA Atrius / flysea) as the gold primary CTA that replaces Kepi. G48 still applies in plan/preview before arrival. The bundled layout must hydrate synchronously from `getAirportLayout` on mount (never blank waiting on API). While MapLibre boots, the SVG schematic stays **tappable** (`interactive` until `mapReady`) and shows a dashed approximate journey line when `routeGrade` is schematic.

**Test:** `src/lib/travelAssistant/airportDayCoach.test.ts`

**G63 — Arrival campus beats outbound check-in coach**
When GPS places the traveler on an airport campus and an inbound leg has already departed for that hub (including airborne final approach and short connections), Kepi must use **arrival** coach — deplane, bags, connection — not depart check-in copy for the outbound leg. Outbound depart coach only takes over inside ~60 minutes of that departure. `resolveCampusCoachMode` implements this; `AirportMode` and `useActiveFlight` must use it instead of `deriveAirportDayCoachMode` alone.

**Test:** `src/lib/travelAssistant/airportDayCoach.test.ts`

**G64 — Hub connections skip baggage claim when bags check through**
When the traveler has a same-airport connection on one ticket (e.g. ONT→SEA→FCO), arrival coach at the hub must use **connection** steps (deplane → international TSA → gate) — never send them to baggage claim. `resolveHubConnection` + `buildHubConnectionCoachPath` / `buildSeaConnectionSteps` at SEA; `buildArrivalTripJourney` honors `includeBaggage: false`.

**Test:** `src/lib/travelAssistant/airportDayCoach.test.ts`, `src/lib/airportNav/connectionClock.test.ts`

**G65 — Physical campus vetoes wrong-airport landed / airborne**
When GPS resolves a known airport campus (`physicalAirportIata`), `computeJourneyPhase` must never claim **just-landed** or **airborne** on a leg whose arrival airport differs (e.g. "Landed at BRI 88m ago" while physically at SEA on ONT→SEA→FCO→BRI). Standing on campus at the departure airport also vetoes **airborne** on that outbound leg. Pass `physicalAirportIata` from Airport Mode, Live Map, and travel-assistant shell.

**Test:** `src/lib/travelAssistant/journeyPhase.test.ts`

**G66 — Self-transfer at hub: bags + outbound airline counter**
When inbound and outbound at the same hub are **not** the same through-ticket (`inferBagsCheckedThrough` — different confirmation or airline switch), arrival coach must show **baggage claim** then **outbound airline check-in** (e.g. United · Terminal 3 at FCO per ADR), not connection-only "bags checked through." `resolveArrivalHubConnection` picks self-transfer outbounds; `buildFcoSelfTransferConnectionSteps` at FCO.

**Test:** `src/lib/airportNav/hubConnectionUtils.test.ts`, `src/lib/airportNav/connectionClock.test.ts`, `src/lib/travelAssistant/connectionPlaybook.test.ts`

**G67 — Kepi Support answers live airport questions**
Support chat must stay visible during Airport Mode (never hide the FAB behind walk sheets). Client sends live traveler context (`setSupportLiveContext` from travel shell + `AirportNavigatorMap` coach steps); server merges trip reservations + airport baggage/train hints. System prompt prioritizes baggage, train, connection, and counter answers from context — never "I can't help with navigation."

**Test:** `src/lib/support/clientSupportContext.test.ts`

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
Reservation drawers, timeline cards, and edit surfaces show the **hotel property name** as the headline. Booking.com / Expedia / etc. are source badges — never the primary title. Email forwards that say “You’re confirmed at Casa de Elena” must set `title` to the property (not the OTA). Day walkthroughs name check-in / staying / check-out (including same-day hotel moves).

**Test:** `src/lib/travelAssistant/reservationDisplayLabel.test.ts`, `src/lib/travelAssistant/emailForwardParser.test.ts`, `src/lib/travelAssistant/dayWalkthrough.test.ts`, `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`, `src/lib/travelAssistant/buildTripLegs.test.ts`

**I29 — Email parse ignores legal footnotes and English “confirmation” words**
Forwarded airline receipts must not treat visa/eTA boilerplate dates (e.g. “Effective March 15, 2016”) as flight times, or English words after “confirmation” (e.g. carefully) as PNRs. Prefer `Reservation code Z84T4Z` / `Confirmation ABC123`. Airline name comes from subject/body (ITA Airways), not Gmail. PDF-only itineraries may still need the PDF text — never invent a 2016 departure.

**Test:** `src/lib/travelAssistant/emailForwardParser.test.ts`

**I30 — Gate on raw parse before enrich; never invent missing fields to pass review**
`evaluateForwardedReservationGate` must run on **raw** parser fields before `enrichReservationForAutoImport`. Hold `needs-review` (40–69), honor `missingFields`, and never auto-import when location/time were empty but enrich would invent `"Hotel stay"` / today's noon. Day-plan forwards still queue/import booking-shaped drafts; out-of-window drafts go to review — never silent drop. Duplicate detection uses one shared `isDuplicateReservation` with empty-composite guard.

**Test:** `src/lib/travelAssistant/forwardedReservationGate.test.ts`, `src/lib/travelAssistant/forwardedDraftImport.test.ts`, `src/lib/travelAssistant/reservationDuplicates.test.ts`

**I26 — Print/PDF/Excel itinerary is chronological and scannable**
Static itinerary Print/PDF/CSV/Excel uses a **Day** column (trip day number + date), not Owner. No timezone column. Rows sort by local departure/check-in time (Ontario before Seattle on the same day). Flights/hotels/trains/rides are **color-coded**. Print CSS stays dense (landscape, tight padding, `print-color-adjust: exact`) so the PDF matches the on-screen Adaptive Travel Assistant look. Dates far outside the trip window (e.g. 2018 voucher bleed) are omitted from the export. Plan **Excel** downloads a SpreadsheetML `.xls` (Itinerary + Day plan sheets) that opens in Microsoft Excel.

**Test:** `src/lib/travelAssistant/premiumItineraryExport.test.ts`

**I27 — Word day-plan itineraries land on Plan days + friend-share letter**
Forwarded **.docx** day plans (e.g. “Puglia Itinerary: SEPT 2–12”) are extracted, parsed into dated bullets, and written to `itineraryPlans` / Plan day notes — not treated as empty booking confirmations. Push/open Plan tab. **Day plan PDF** prints a portrait letter (title, stay block, Day N · date · city + bullets) for sharing with friends. Legacy `.doc` is unsupported (re-save as `.docx`). If day-plan dates fall inside an existing trip window (month/day match even when the Word year is wrong), attach to that trip — never a new empty shell. Confirm in the toast/feed by trip name. Empty local Plan shells must not hide those notes (I50).

**Test:** `src/lib/travelAssistant/parseDayPlanItinerary.test.ts`, `src/lib/travelAssistant/narrativeItineraryExport.test.ts`, `src/lib/travelAssistant/tripEmailAttach.test.ts`

**I28 — Plan Timeline is the day-plan letter (not photo cards)**
Timeline shows the same narrative day-plan layout as Day plan PDF: trip title, stay block, Day N · date · city, editable/draggable bullet lines. No random city thumbnails (source.unsplash / picsum). Internal parser jargon (e.g. “Applied AI fallback…”) never appears in traveler notes.

**Test:** `src/lib/travelAssistant/narrativeItineraryExport.test.ts`, `src/lib/travelAssistant/sanitizeTravelerNotes.test.ts`

**I31 — Day-plan Timeline collapses details; never shows duplicated activity blocks**
Timeline shows **headline** stays/activities by default. Hotel fine print (address, check-in/out, breakfast, tourist tax) and activity logistics nest under the headline and expand/collapse on tap — so a stay day does not look packed. Exact duplicate lines and repeated consecutive bullet blocks from Word/import merges are deduped for display and persisted once so Day 3 does not list the same boat tour twice.

**Test:** `src/lib/travelAssistant/dayPlanBulletGroups.test.ts`

**I32 — Home is Mission Control (Today / Week / Trip)**
Travel Assistant Home leads with one primary status card for the active zoom (**Today** · **This week** · **Trip**). Max three attention items on Home; overflow via See all into Plan/gaps. Problem/disruption overrides other phases. Never fabricate rebooking inventory. Mission Control composes existing trip/gap/status truth — it is not a second itinerary store. Airport Mode remains the walk-through; Home deep-links into it on travel day. 3-second rule: a stressed traveler knows the next action without hunting tabs.

**Test:** `src/lib/travelAssistant/tripPhase.test.ts`

**I33 — Apple Home voice + Flights diet + travel-day takeover**
Flights is a ticket list — no TripFirst marketing, no duplicate search launchers, no inter-city gap stack (Home/Plan own gaps), no terminal explore promo outside 48h of departure, no yellow “Add miles/cash” primary badge (soft footer only). Home is the single voice: leave-by + calm connection line (`buildConnectionCalmStatus`) + check-in handoff + one attention CTA; no Book/Plan/Airport quick-link grid or redundant Bookings/Itinerary tiles; trip spend badge only when pricing/problems need action. Travel day / airborne / just-landed / at-airport surfaces Airport Mode as the primary offer.

**Test:** `src/lib/travelAssistant/homeDayTruth.test.ts`

**I34 — Night-by-night stay truth + trip completeness bar**
Hotel gaps are computed **per sleep night** (check-in ≤ night < check-out). A Venice hotel must not clear Cortina/Ortisei nights. Never nag the night before the trip’s first outbound from home (home-base); overnight flights cover airborne nights. Home shows a **Trip status** bar (Flights | Hotels → gray/orange/green). Support chat must use the same stay-hole list — never say “everything is covered” when holes exist. Connection calm lines only for layovers ≤ 8h. Sleep window skips same-day connection hubs (SEA on ONT→SEA→FCO). Hotels tap opens a **Stay gaps** sheet listing exact nights before any search/purchase. Labels use readable dates (“Sep 15 – 17”), never opaque `09-01 - 09-01`.

**Test:** `src/lib/travelAssistant/tripNightCoverage.test.ts`

**I35 — Hotel dates remap into trip window + shared calendar sleep truth**
Forwarded hotels often land as the wrong year (2025 in a 2026 Europe trip). On trip load and after forward drain, remap hotel check-in/out into `tripStart…tripEnd` by month/day (`hotelTripDateRepair`). Preserve `checkOutDate` through drain/import. Sleep window never seeds from hotel check-in when flights exist (no Sep 1 Polignano gap before a Sep 2 landing). Calendar Plan uses the same night-coverage gaps as Home Stay Gaps; amber “Needs stay” for real holes; **keep** split two-tone colors on city/hotel switch days (checkout → check-in). Booking.com checkout lines like `Check-out\nTuesday, September 8, 2026` must parse.

**Test:** `src/lib/travelAssistant/hotelTripDateRepair.test.ts`, `confirmationHotelExtract.test.ts`, `drainForwardReviewQueue.test.ts`, `tripNightCoverage.test.ts`

**I36 — Apple chrome diet: travel-day single screen + quiet green**
On travel day (airborne / just-landed / at-airport / leave-soon), Home is **one** headline + **one** Airport Mode CTA — hide Mission Control label chrome, completeness bars, zoom picker, trip map, and transport prompts. When trip status is green, Trip Completeness is a single muted line (“Flights and stays set”). Plan keeps one gap surface (completeness / Stay Gaps) — no duplicate Trip Health strip. Flights is tickets only (no arrival/departure guide cards). Plan/Book use light Apple headers; exports live in a Share sheet; spend badge only when pricing/problems need action.

**Test:** `src/lib/travelAssistant/homeDayTruth.test.ts`

**I37 — Never remap hotels into a past trip year**
If `trip.startDate`/`endDate` are still 2025 while the traveler is in 2026, bump the trip window first, then remap hotels. Stay Gaps must never show `Check-in 2025-09-01` for a Europe 2026 trip. Sleep window still starts at first destination arrival (not Sep 1 airborne). NEREA Sep 5–8 covers nights 5–7 only; Sep 8–11 and 15–17 remain real open nights unless other stays exist.

**Test:** `src/lib/travelAssistant/tripWindowRepair.test.ts`

**I38 — Never expand trip window across mixed years (no “292 nights open”)**
Do not set trip bounds to min/max of every raw reservation date. Stray 2025 leftovers + 2026 flights made a year-long franken-window and Home showed “292 nights open · Sep 1…”. Use the dominant reservation year cluster, expand only inside that cluster, cap at 90 days, and anchor sleep-window end to last return / last hotel checkout (trip end may extend ≤14 days, never months).

**Test:** `src/lib/travelAssistant/tripWindowRepair.test.ts`, `tripNightCoverage.test.ts`

**I39 — Airbnb yearless Check-in/Checkout cards must become stay nights**
Airbnb confirmation emails show `Sat, Sep 12` / `Tue, Sep 15` without a year on the date cards; the year often appears only on “Payment scheduled … 2026”. Parser must read labeled Check-in/Checkout (yearless OK), assign year from an explicit year in the email (not invent silently), never treat payment-scheduled dates as check-in, extract city from the Address line, and not require a confirmation code for Airbnb summary emails. Sep 12–15 covers sleep nights 12–14 only (checkout exclusive).

**Test:** `src/lib/travelAssistant/hotelStayDateExtract.test.ts`, `emailForwardParser.test.ts`, `confirmationHotelExtract.test.ts`

**I40 — Stay Gaps must know airborne nights and homebound return**
Blank `flightArrivalTime` on a long-haul (SEA→FCO) must not fall back to departure day — that opened “Sep 1 · near Polignano” while the traveler is overnight airborne. When arrival is missing, first sleep is dep+1 (ESTIMATE) after skipping same-day hubs; dep night is airborne. Never extend the sleep window past the day before the last return departure (no “Sep 25–27 · near Munich” after MUC→SEA). Venice Sep 15–17 after a Sep 12–15 Airbnb remains a real gap (checkout exclusive) unless another stay exists.

**Test:** `src/lib/travelAssistant/tripNightCoverage.test.ts`

**I41 — Stay Gaps copy: after checkout, not “near city”; Free vs Pro is obvious**
Label gaps as **After {city} checkout** / **Before {city} check-in** — never imply the prior Airbnb is missing when nights are checkout-exclusive. Soft Free plan banner on Home: 1 trip free; email import + unlimited trips are Pro ($9). Upgrade modal states the same split; Free can still forward to the Kepi address.

**Test:** `src/lib/travelAssistant/tripNightCoverage.test.ts`

**I42 — Email cash parse must prefer charged totals; pricing tap is itemized ledger**
Airbnb/Booking “charged a total of $X” wins over nearby “$Y per night”. Near-booking text windows must fall back to the full email when the slice has no cash. Spend badge opens the Trip Ledger (this trip + all trips lifetime total + CSV export): which bookings still need price, and cash/miles logged per reservation.

**Test:** `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `tripSpendSummary.test.ts`

**I43 — Prep-mode Home when departure is still weeks out**
When `daysUntilDeparture > 14`, Home is prep mode: countdown Watch (documents, stays, pricing, official entry guidance with travel.state.gov — not immigration advice). Hide connection-calm and next-flight travel chrome so “Today looks light” / FCO connection noise does not overwhelm.

**Test:** `src/lib/travelAssistant/homeDayTruth.test.ts`

**I44 — Calendar split only on arrival or real hotel switches**
Do not paint the first full stay day after travel as a “switch day.” Arrival/check-in day (travel + stay both cover) gets Travel | City split; mid-stay days are solid city color. Stay→stay land transfers keep the split. Booked hotel city beats leftover day-plan notes for the cell label.

**Test:** `src/lib/travelAssistant/buildTripLegs.test.ts`

**I45 — Historical hotel forwards must not invent future stays**
If the original email `Date:`/`Sent:` is ~13+ months old **and** the body has no Check-in/Checkout stay cards, do not auto-import and do not keep invented future check-in dates (e.g. 2018 Summer In Italy → March 2027). Queue for review with an archive reason.

**Test:** `src/lib/travelAssistant/historicalEmailForward.test.ts`

**I46 — Return travel ends the stay paint; homebound copy uses final city**
Do not extend the last European stay through `tripEndDate` after the final return travel day (`fillCoverageGaps` caps at return). Return-day labels and walkthroughs name the ultimate home city (e.g. Ontario), not the connection (Rome), and surface the full same-day chain (MUC→FCO→ONT).

**Test:** `src/lib/travelAssistant/buildTripLegs.test.ts`, `src/lib/travelAssistant/dayWalkthrough.test.ts`

**I47 — Plan letter matches the forwarded Word itinerary**  
Timeline and day view look like the Word letter: title + month range (`SEPT 2–12`), stay facts always visible (address, check-in/out, tax), day headers like `Sept 2` / `Sept 4: BEST VIEWPOINTS`, every activity bullet visible and editable. Stay fine print is a stay block — not collapsed under Details (I31 still dedupes repeats). Forwards and Gmail itinerary mail parse onto the matching trip dates.

**Test:** `src/lib/travelAssistant/letterDayPlan.test.ts`

**I48 — Stay facts belong on the check-in and check-out day**  
Do not pile every hotel at the top of Plan. Polignano / A Casa di Elena check-in, check-out, confirmation, and time go under **Sept 2** (and checkout under the checkout date). Never show “Nothing on this day yet” when a flight or hotel already sits on that day.

**Test:** `src/lib/travelAssistant/letterDayPlan.test.ts`

**I49 — Excursion and activity mail print on the activity day**  
A forwarded PDF, Gmail import, or confirmation for a tour / boat / dinner / GetYourGuide booking prints under that calendar day (name, time, confirmation) — same letter rule as hotel check-in (I48). Do not leave Sept 3 empty when the boat tour is already on the trip.

**Test:** `src/lib/travelAssistant/letterDayPlan.test.ts`, `src/lib/travelAssistant/gmailImportProvider.test.ts`

**I50 — Mid-stay Plan days show Word activities, not only “Staying at”**  
Sept 3–4 (and any hotel mid-stay) must show forwarded / pasted day-plan bullets (boat tour, viewpoints, gelato). A newer empty local `itineraryPlans` shell must not beat server notes, and an empty persist must not wipe Redis. Opening Plan backfills from stored email text, Gmail itinerary mail, or **Paste itinerary**. Plan backfill/paste must be declared **after** `setToast` — never read it in a `const` initializer above that line (TDZ crash: `Cannot access 's1' before initialization`).

**Test:** `src/lib/travelAssistant/itineraryPlansHydrate.test.ts`

**I51 — Tap a Plan day to edit that day (type, paste, talk)**  
Tapping **Sept 2** (or Edit / empty Add) opens a full-screen Apple sheet for **that date only**: stay facts read-only, activity lines type/paste/delete, Talk uses on-device speech, Done saves. Empty Add must not flash Saved. Hotel/flight confirmations stay bookings — never overwritten by voice.

**Test:** `src/lib/travelAssistant/planDayEdit.test.ts`

**I52 — Paste, Done, undo, and reorder must actually keep the day**  
Pasting “test one two three” (or Notes / Word lines) must become bullets on that date. Done must write `itineraryPlans.dayPlans[date].notes` and persist — not only local `dayNotes` the letter ignores. Activity edits must not toast “Updated plan: stay in Bari”. Accidental ✕ has Undo. Lines reorder with drag / up-down. Talk and paste use the same save path.

**Test:** `src/lib/travelAssistant/planDayEdit.test.ts`

**I53 — Save writes the day and stays on that day**  
The day sheet button is **Save** (not Okay/Done). Save always persists that date’s lines. The letter shows `itineraryPlans.notes`, not a stale “Stay in Bari” dayNotes wrap. After Save, scroll stays on that day (Sept 2) — never jump to the bottom of the letter. Hydrate must not overwrite a just-saved day.

**Test:** `src/lib/travelAssistant/planDayEdit.test.ts`

**I54 — Save is not locked; stay-only notes cannot blank the day**  
A “Stay in Bari” / Hotel line on the trip plan is a booking fact, not a lock. Save must write both `dayNotes` and `itineraryPlans.notes` in one turn (no nested setState). The letter must keep the pasted lines on that day. Activity Save must not run stay-city reconcile.

**Test:** `src/lib/travelAssistant/planDayEdit.test.ts`

**I55 — Plan letter must not read state before it is declared (TDZ)**  
`savedBulletsByDay` (and any other `const`) used in a `useMemo` / `useCallback` dependency must be declared first. Reading it above `useState` crashes Plan: `Cannot access 'M' before initialization`. Same class as I50 `setToast` / `s1`.

**Test:** `src/lib/travelAssistant/itineraryPlansHydrate.test.ts`

**I56 — Stale-bundle crashes must unload the old JS (TDZ + ChunkLoadError)**  
`Cannot access 'M' before initialization` or `Loading chunk N failed` after a deploy must clear the PWA cache and reload once. Try again must not remount the same crashed JS. A Plan crash must not skip the service-worker update. Confirmations untouched.

**Test:** `src/lib/pwa/recoverStaleClientBundle.test.ts`


**I61 — PWA must not cache failed JS chunks; one reload owner**  
After a deploy, the service worker must never `cache.put` a non-OK `/_next/static` response — a stored 404 blanks the home-screen app until caches are cleared. Bump `CACHE_VERSION` when SW behavior changes. Only `<DeployRefresh />` in the root layout may reload on `controllerchange`; the travel-assistant page must not also reload (double-reload = blank hang). Throttle `registration.update()` so tab focus does not storm `skipWaiting`. Successful boots clear the stale-bundle recovery flag so a later poison can still self-heal. Confirmations untouched.

**Test:** `src/lib/pwa/recoverStaleClientBundle.test.ts`


**I57 — Booked transport is hop truth; Search flights is last resort**  
A hotel-city move (Lecce → Venice) is covered when a booked flight arrives at the destination (VCE / Venice) or a train/ride sits in that date window — including Trenitalia “Venezia S. Lucia” and messy PDF titles. Do not invent a BDS→VCE shopping search. A truly empty window must still nag. Confirmations untouched.

**Test:** `src/lib/travelAssistant/bookedHopCoverage.test.ts`

**I58 — European rail tickets use DD/MM dates and station names**  
Trenitalia / Italo PDFs print `13/09/2026`, Partenza/Arrivo, station names, binario, and Codice prenotazione. Do not read `13/09` as month 13. A leftover that still has the original ticket must show the date, route, and times — not “Train tickets / 0/100.” Confirmations untouched.

**Test:** `src/lib/travelAssistant/railTicketExtract.test.ts`

**I59 — GetYourGuide ticket-instructions PDFs are terms, not tours**  
`Booking GYGVN24XVY58 confirmed | Ticket instructions` is a booking ID plus legal PDF. Do not read `booking reference` as confirmation `ERENCE`. Do not classify that leftover as a flight because the terms mention airline. Type is `dinner`. Confirmations untouched.

**Test:** `src/lib/travelAssistant/activityTicketExtract.test.ts`

**I60 — Trip tab analytics must import trackEvent**  
`travel-assistant/page.tsx` calls `trackEvent` on Trip tab open (`home_opened`). Missing import crashes Trip: `trackEvent is not defined`. Confirmations untouched.

**Test:** `src/lib/travelAssistant/travelAssistantPageAnalytics.test.ts`

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
Airport indoor layouts prefetch **as soon as the IATA appears on a remaining trip leg** (flight booked or added). City map bundles still prefetch within **48h** of when the traveler needs them. Evict cached assets only when their IATA/city key no longer appears on any **remaining** leg of the same trip — never wipe the whole cache on a single leg completion.

**D14b — Airport preview before travel day**
Travelers may open the indoor terminal map **any time after a departure airport is on the trip** — not only inside the airport geofence. Preview mode shows lounges, check-in, gates, and routes to study the layout; live turn-by-turn, voice co-pilot, and family rally activate automatically at the departure geofence on travel day.

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

**D19 — SEA survives empty storage and missing env**  
Airport layout resolution must return the compiled SEA seed even with empty Redis, missing Redis env keys, or a missing `BLOB_READ_WRITE_TOKEN`. When Blob is unavailable, package saves fall back to inline Redis storage — Blob offload failure must never fail a save or blank a published airport.

**Test:** `src/lib/airportNav/airportLayoutStore.test.ts`

**D20 — Visual preview confirmation gates publish**  
An airport package may only be published when a human has confirmed the rendered visual preview (`previewConfirmedBy`). Structural/schema validation alone is insufficient — schema-valid geometry can still be physically wrong (see the 2026-06-15 offshore-pin failure). Compiled seed layouts self-confirm as `kepi-seed-bundle` because they are human-reviewed in code.

**Test:** `src/lib/airportNav/airportLayoutPackage.test.ts`, `src/lib/airportNav/airportLayoutStore.test.ts`

**D21 — Curation requests dedupe by IATA**  
There is exactly one shared curation request per airport IATA. Repeat demand within 5 minutes never inflates the demand count, detection sources (`detectedBy`) deduplicate, and admin notes / linked package revisions carry forward across demand updates.

**Test:** `src/lib/airportNav/airportCurationQueue.test.ts`

---

## NEURO LAWS

**N1 — Score only honest actions; never amplify ghosts**  
The neuro loop measures taps only when the UI was truthful (`metadata.honest !== false`). Ghost prompts (Search flights for a hop that is already booked) must not be scored as winners. `search-flights` is locked last and never amplified above See routes or ground. An action needs **≥5 honest impressions** before `amplify`. Same Redis store as `/api/ml-readiness/suggestion-outcomes` — do not invent a second outcomes list. Suggest only; never silent apply.

**Test:** `src/lib/neuro/neuroLoop.test.ts`

---


**I62 — Domestic leave-by is 2 hours at the airport; corner traffic countdown is honest**  
Domestic arrive-by buffer is **120 minutes** (not 90). International stays 180. Leave-by never invents drive time (I32). When a real OSRM/genome drive ETA exists, Map/Airport depart coach shows a **corner countdown** (leave-in + drive ~Xm labeled route/not live traffic). Map helpers (admin opt-in) can one-tap confirm **gates and airline counters** ("Gate C11?", "Alaska here?") — reports never auto-publish (M38).

## Test index

| Law | Test file |
|-----|-----------| Corner badge leads with **Traffic ~Xm to airport** when OSRM has a route, and counts down to **leave-home** (airport arrive-by − drive) — never invents traffic.
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
| M10 | `src/lib/airportNav/schematic.test.ts`, `app-sitter/airport-day-of-travel.spec.ts` |
| M11 | `app-sitter/airport-day-of-travel.spec.ts` |
| M12 | `src/lib/airportNav/officialWayfinding.test.ts`, `src/lib/airportNav/pathfinder.test.ts`, `app-sitter/airport-day-of-travel.spec.ts` |
| M13 | `src/lib/airportNav/airportLayoutPackage.test.ts`, `app-sitter/airport-day-of-travel.spec.ts` |
| M14 | `src/lib/airportNav/airportCurationQueue.test.ts`, `app-sitter/airport-day-of-travel.spec.ts` |
| M15 | `src/lib/airportNav/osmImport.test.ts` |
| M16 | `src/lib/airportNav/directionArrow.test.ts`, `src/lib/airportNav/confirmTravelerSpot.test.ts`, `src/lib/airportNav/gatePresence.test.ts`, `src/lib/airportNav/travelerPosition.test.ts`, `src/lib/airportNav/airportNavigatorMap.tdz.test.ts` |
| M17 | `src/lib/airportNav/layoutBounds.test.ts` |
| M18 | `src/lib/airportNav/layouts/seaLayout.test.ts` |
| M19 | `src/lib/airportNav/schematic.test.ts` |
| M20 | `src/lib/airportNav/deadReckoning.test.ts` |
| M21, M24 | `src/lib/airportNav/tripJourney.test.ts` |
| M22 | `src/lib/airportNav/poiDetail.test.ts` |
| M23 | superseded by M26 |
| M25 | `src/lib/airportNav/airportLayoutStore.test.ts`, `src/lib/airportNav/layouts/zoneRingValidity.test.ts` |
| M26 | `src/lib/airportNav/layouts/seaNodeContainment.test.ts` |
| M27 | `src/lib/airportNav/doorCurve.test.ts`, `src/lib/airportNav/layouts/seaTicketingHall.test.ts` |
| M28 | `src/lib/airportNav/layouts/seaNodeContainment.test.ts`, `src/lib/airportNav/layouts/seaRouteMonotonic.test.ts` |
| M29 | `src/lib/airportNav/layoutQuality.test.ts`, `src/lib/airportNav/allAirportsQuality.test.ts` |
| M30 | `src/lib/airportNav/routeGradeHonesty.test.ts` |
| M31, M32 | `src/lib/airportNav/groundTruthConformance.test.ts` |
| M32 | `src/lib/airportNav/securityDisclosure.test.ts` |
| M33 | `src/lib/airportNav/osmGroundTruth.test.ts` |
| M34 | `src/lib/airportNav/osmImport.test.ts`, `src/lib/airportNav/controlPointAnchors.test.ts`, `src/lib/airportNav/controlPointTransform.test.ts`, `src/lib/airportNav/clickToPlace.test.ts`, `src/lib/airportNav/layouts/seaOsmAmenities.test.ts` |
| M35 | `src/lib/airportNav/layoutStaleness.test.ts`, `src/lib/airportNav/layoutDiff.test.ts`, `src/lib/airportNav/poiPrecisionHonesty.test.ts`, `src/lib/airportNav/referenceImageDraft.test.ts`, `src/lib/airportNav/allAirportsPrecisionHonesty.test.ts` |
| M36 | `src/lib/airportNav/doorMonotonicity.test.ts` |
| M37 | `src/lib/airportNav/footwayGraph.test.ts`, `src/lib/airportNav/routeGradeHonesty.test.ts` |
| M38 | `src/lib/airportNav/mapHelperNearby.test.ts` |
| F15 | `src/lib/travelAssistant/flightSort.test.ts` |
| F3 | `src/lib/travelAssistant/tripTransportRoute.test.ts` |
| F7 | `src/lib/travelAssistant/itineraryPathCoverage.test.ts` |
| F7 | `src/lib/travelAssistant/itinerarySelfCheck.test.ts` |
| F8 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusCadence.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusMerge.test.ts` |
| F10 | `src/lib/travelAssistant/checkInHandoff.test.ts` |
| F11 | `src/lib/travelAssistant/reservationLinks.test.ts` |
| F11, G13 | `src/lib/travelAssistant/europe2026TripPass.test.ts` |
| F9 | `src/lib/travelAssistant/flightStatusLookup.test.ts` |
| F12 | `src/lib/travelAssistant/flightStatusCredentials.test.ts` |
| F13 | `src/lib/travelAssistant/resolvePushFlightDate.test.ts`, `flightStatusPushBridge.test.ts`, `flightStatusTrustLine.test.ts` |
| F14 | `src/lib/flights/bookFlightAdvisorPicks.test.ts` |
| G13 | `src/lib/travelAssistant/gapDetectionService.test.ts` |
| G8 | `src/lib/travelAssistant/dayPlanLines.test.ts` |
| G10 | `src/lib/travelAssistant/tripActionItems.test.ts` |
| G14 | `src/lib/travelAssistant/tripSpendSummary.test.ts` |
| G15 | `src/lib/billing/nativeBillingGate.test.ts`, `revenueCatCatalog.test.ts` |
| G16 | `src/lib/travelAssistant/consumerTabs.test.ts` |
| G17 | `src/lib/travelAssistant/hotelBookLead.test.ts` |
| G18 | `src/lib/travelAssistant/flightBookLead.test.ts` |
| G19 | `src/lib/travelAssistant/mapTabLead.test.ts` |
| G20 | `src/lib/travelAssistant/disruptionCalm.test.ts` |
| G21 | `src/lib/travelAssistant/consumerVisualChrome.test.ts` |
| G22 | `src/lib/native/iosNativeShell.test.ts` |
| G23 | `src/lib/native/iosNativeShell.test.ts` |
| G24 | `src/lib/native/iosNativeShell.test.ts` |
| G26 | `src/lib/travelAssistant/tripWalk.test.ts` |
| G27 | `src/lib/travelAssistant/reviewCtaHonesty.test.ts` |
| G28 | `src/lib/travelAssistant/reviewCtaHonesty.test.ts` |
| G29 | `src/lib/travelAssistant/reviewCtaHonesty.test.ts`, `src/lib/travelAssistant/activityTicketExtract.test.ts` |
| G30 | `src/lib/travelAssistant/calendarSyncPayload.test.ts` |
| G31 | `src/lib/travelAssistant/tripOrchestration.test.ts`, `src/lib/travelAssistant/missionControlView.tdz.test.ts` |
| G32 | `src/lib/travelAssistant/tripAccounting.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts` |
| G33 | `src/lib/travelAssistant/parseReservationPricing.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts`, `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts` |
| G34 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts`, `src/lib/travelAssistant/rescanTripImports.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts` |
| G35 | `src/lib/api/readJsonResponse.test.ts` |
| G36 | `src/lib/travelAssistant/tripSpendSummary.test.ts` |
| G37 | `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts`, `src/lib/travelAssistant/pricingSourceText.test.ts` |
| G38 | `src/lib/travelAssistant/emailSourceText.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts` |
| G39 | `src/lib/travelAssistant/tripEmailAttach.test.ts`, `src/lib/travelAssistant/flightItinerarySync.test.ts` |
| G40 | `src/lib/travelAssistant/gmailPricingSweep.test.ts`, `src/lib/travelAssistant/pricingDiagnostics.test.ts` |
| G41 | `src/lib/travelAssistant/pricingEndToEnd.test.ts` |
| G42 | `src/lib/travelAssistant/scannedDocumentPricing.test.ts` |
| G43 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts` |
| G44 | `scripts/check-undefined-names.cjs` (prebuild gate) |
| G45 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `src/lib/travelAssistant/tripSpendSummary.test.ts`, `src/lib/travelAssistant/hydrateReservationQuotedPrice.test.ts` |
| G46 | `src/lib/travelAssistant/airportDayCoach.test.ts`, `src/lib/travelAssistant/homeNextAction.test.ts` |
| G47 | `src/lib/travelAssistant/connectionPlaybook.test.ts` |
| G48 | `src/lib/airportNav/officialWayfinding.test.ts` |
| G49 | `src/lib/travelAssistant/journeyPhase.test.ts`, `src/lib/travelAssistant/departLeaveTiming.test.ts` |
| M39 | `src/lib/travelAssistant/flightSort.test.ts`, `src/lib/travelAssistant/airportDayCoach.test.ts` |
| M20 | `src/lib/family/nativeLocationToken.test.ts`, `src/lib/family/decideFamilyLocationWrite.test.ts`, `src/lib/native/iosNativeShell.test.ts` |
| I8 | `src/lib/travelAssistant/tripLegColors.test.ts` |
| I8, I10, I12, I15, I17, I20, I21 | `src/lib/travelAssistant/buildTripLegs.test.ts` |
| I22, I23, I24, I25 | `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`, `src/lib/travelAssistant/reservationDisplayLabel.test.ts`, `src/lib/travelAssistant/dayWalkthrough.test.ts` |
| I26 | `src/lib/travelAssistant/premiumItineraryExport.test.ts` |
| I27 | `src/lib/travelAssistant/parseDayPlanItinerary.test.ts`, `src/lib/travelAssistant/narrativeItineraryExport.test.ts`, `src/lib/travelAssistant/tripEmailAttach.test.ts` |
| I28 | `src/lib/travelAssistant/narrativeItineraryExport.test.ts`, `src/lib/travelAssistant/sanitizeTravelerNotes.test.ts` |
| I29 | `src/lib/travelAssistant/emailForwardParser.test.ts` |
| I30 | `src/lib/travelAssistant/forwardedReservationGate.test.ts`, `src/lib/travelAssistant/forwardedDraftImport.test.ts`, `src/lib/travelAssistant/reservationDuplicates.test.ts` |
| I31 | `src/lib/travelAssistant/dayPlanBulletGroups.test.ts` |
| I32 | `src/lib/travelAssistant/tripPhase.test.ts` |
| I33 | `src/lib/travelAssistant/homeDayTruth.test.ts` |
| I34 | `src/lib/travelAssistant/tripNightCoverage.test.ts` |
| I35 | `src/lib/travelAssistant/hotelTripDateRepair.test.ts`, `confirmationHotelExtract.test.ts`, `drainForwardReviewQueue.test.ts`, `tripNightCoverage.test.ts` |
| I36 | `src/lib/travelAssistant/homeDayTruth.test.ts` |
| I37 | `src/lib/travelAssistant/tripWindowRepair.test.ts` |
| I38 | `src/lib/travelAssistant/tripWindowRepair.test.ts`, `tripNightCoverage.test.ts` |
| I39 | `src/lib/travelAssistant/hotelStayDateExtract.test.ts`, `emailForwardParser.test.ts`, `confirmationHotelExtract.test.ts` |
| I40 | `src/lib/travelAssistant/tripNightCoverage.test.ts` |
| I41 | `src/lib/travelAssistant/tripNightCoverage.test.ts` |
| I42 | `src/lib/travelAssistant/parseReservationCashUsd.test.ts`, `tripSpendSummary.test.ts` |
| I43 | `src/lib/travelAssistant/homeDayTruth.test.ts` |
| I44 | `src/lib/travelAssistant/buildTripLegs.test.ts` |
| I45 | `src/lib/travelAssistant/historicalEmailForward.test.ts` |
| I46 | `src/lib/travelAssistant/buildTripLegs.test.ts`, `src/lib/travelAssistant/dayWalkthrough.test.ts` |
| I47 | `src/lib/travelAssistant/letterDayPlan.test.ts` |
| I48 | `src/lib/travelAssistant/letterDayPlan.test.ts` |
| I49 | `src/lib/travelAssistant/letterDayPlan.test.ts` |
| I50 | `src/lib/travelAssistant/itineraryPlansHydrate.test.ts` |
| I51 | `src/lib/travelAssistant/planDayEdit.test.ts` |
| I52 | `src/lib/travelAssistant/planDayEdit.test.ts`, `src/lib/travelAssistant/hotelAnchoredTimeline.test.ts`, `src/lib/travelAssistant/narrativeItineraryExport.test.ts` |
| I53 | `src/lib/travelAssistant/planDayEdit.test.ts`, `src/lib/travelAssistant/narrativeItineraryExport.test.ts` |
| I54 | `src/lib/travelAssistant/planDayEdit.test.ts`, `src/lib/travelAssistant/narrativeItineraryExport.test.ts` |
| I55 | `src/lib/travelAssistant/itineraryPlansHydrate.test.ts`, `src/lib/travelAssistant/planDayEdit.test.ts` |
| I56 | `src/lib/pwa/recoverStaleClientBundle.test.ts` |
| I57 | `src/lib/travelAssistant/bookedHopCoverage.test.ts` |
| I58 | `src/lib/travelAssistant/railTicketExtract.test.ts` |
| I59 | `src/lib/travelAssistant/activityTicketExtract.test.ts` |
| I60 | `src/lib/travelAssistant/travelAssistantPageAnalytics.test.ts` |
| I61 | `src/lib/pwa/recoverStaleClientBundle.test.ts` |
| I62 | `src/lib/travelAssistant/departLeaveTiming.test.ts`, `src/lib/travelAssistant/leaveCountdownBadge.test.ts`, `src/lib/airportNav/mapHelperNearby.test.ts` |
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
| D19, D20 | `src/lib/airportNav/airportLayoutStore.test.ts` |
| D20 | `src/lib/airportNav/airportLayoutPackage.test.ts` |
| D21, M14 | `src/lib/airportNav/airportCurationQueue.test.ts` |
| N1 | `src/lib/neuro/neuroLoop.test.ts` |
| M40 | `src/lib/airportNav/journeyMachine.test.ts` |
| M41 | `src/lib/airportNav/airportCurationQueue.test.ts` |
| M43 | `src/lib/airportNav/poiMapWalkPolicy.test.ts`, `src/lib/airportNav/layouts/seaTicketingHall.test.ts`, `src/lib/airportNav/paintWalkMapLeaderOverlay.ts` |
| M62 | `src/lib/airportNav/officialWayfinding.test.ts` |
| G63 | `src/lib/travelAssistant/airportDayCoach.test.ts` |
| G64 | `src/lib/travelAssistant/airportDayCoach.test.ts`, `src/lib/airportNav/connectionClock.test.ts` |
| G65 | `src/lib/travelAssistant/journeyPhase.test.ts` |
| G66 | `src/lib/airportNav/hubConnectionUtils.test.ts`, `src/lib/airportNav/connectionClock.test.ts`, `src/lib/travelAssistant/connectionPlaybook.test.ts` |
| G67 | `src/lib/support/clientSupportContext.test.ts` |
| M42 | `src/lib/airportNav/ontFirstMile.test.ts`, `src/lib/airportNav/tripJourney.test.ts` |

New laws must add a row here when a test exists.
