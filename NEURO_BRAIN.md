# Kepi Neuro Brain — product reasoning layer

**Last updated:** 2026-07-30  
**Owner:** Jeff Russell  
**Purpose:** Capture *why* Jeff asks for changes so agents, bots, and future ML can apply the same thinking across the whole site — not just the file that was edited last.

This is **not** a trained neural network. It is the **reasoning graph** Kepi should follow until we have enough labeled outcomes to learn weights. Agents must **read and append** here when Jeff corrects trip truth (calendar, stays, forwards) so the next session does not re-learn the same lesson from scratch.

---

## Read order for agents

1. This file — intent and principles  
2. `KEPI_PROJECT_MEMORY.md` — durable facts, provider status, what's shipped  
3. `KEPI_DESIGN_LAW.md` — enforceable laws (I22–I25 for whole-trip execution)  
4. `bot-deck/memory/*.md` — domain bot playbooks  

---

## Why Jeff asked (2026-07-08)

Jeff's Italy trip exposed a **category error**: Kepi treated **where the plane lands** as **where the traveler sleeps**.

| What Jeff saw | What was wrong | What Jeff wanted |
|---------------|----------------|------------------|
| "8 nights in Bari" after landing at BRI | Stay city inferred from arrival airport | Stay city from **booked hotels** (Monopoli, Polignano) |
| "How are you getting to Monopoli?" with no context | Vague gap, no decision support | Distance, mode options, map link — **user picks, Kepi tracks** |
| Plan note "Leave" / "not staying in Bari" ignored | Notes were decorative | Notes **reconcile** with hotels and rewrite timeline |
| Edit drawer said "Booking.com" | OTA provider shown as identity | **Hotel name** is the title; OTA is a badge |
| Kepi Help failed on easy questions | Support API message shape / model errors | Reliable concierge help with trip context |
| Spanish tab did nothing visible | Locale saved but UI mostly hardcoded English | Nav + settings + incremental string coverage |

**Underlying intent:** Kepi is a **trip execution brain** — plan the whole journey, book externally, forward confirmations, then **walk the traveler through every leg** including ground connectors. Not a flight+hotel search widget.

---

## Core principles (apply everywhere)

### 1. Hotels = where you sleep (source of truth)

- Timeline chapters, night counts, and spend attribution use **hotel city + check-in/out**.
- Flight arrival IATA is a **transport event**, not a stay declaration.
- If hotels say Monopoli and flight lands at BRI, the stay is **not** Bari unless a hotel says Bari.

### 2. Airports = first ground problem

- After landing, the question is **airport → first hotel** (or airport → planned stay pin).
- Never ask "where are you staying?" at the airport city when hotels already exist elsewhere.

### 3. Plan notes are intent, not decoration

- "Leave", "not staying in X", "staying elsewhere" → parse → match reservations → update `dayPlans` + calendar.
- Reconciliation must be **idempotent** and **explainable** (toast or inline note when Kepi adjusts).

### 4. We'll help you plan it (decision support)

- Missing inter-city transport shows: distance band, mode estimates (clearly labeled), map deep link, soft recommendation.
- **Never** prescribe "take the train" without options — liability and trust.
- **Never** invent exact fares; ranges until live APIs.

### 5. Book anywhere; Kepi runs the trip

- Compare and decide in Kepi; purchase on airline / Google / Booking.com / Seats.aero.
- Do not add unbooked inventory to the live itinerary as if purchased.
- After external book → forward confirmation → timeline activates.

### 6. Display truth in UI

- Hotel **name** in lists, drawers, timeline — not OTA brand.
- Legend and calendar must reflect **every** stay leg (see I21).
- Connection-only cities (e.g. Seattle) should **collapse** — not full mission tabs.

### 7. Calendar paints the traveler’s day, not leg-id churn

- **Check-in / landing day** may split Travel | City.
- **First full day in a city** is solid city color — never a fake “switch day.”
- Split + “checking out / into next” only for real stay→stay moves.
- Booked hotel city beats stale day-plan notes on that date.
- Old archive forwards (e.g. 2018 payment emails with no stay dates) must not invent future check-ins or join the live trip (pending I45).

### 8. Prep vs travel day chrome

- Weeks out → prep Watch (documents, stays, pricing, official entry links). Do not overwhelm with connection/gate chrome until the travel window.

### 9. Path to must-have (2026-07-30)

Score as **family trip execution**, not Flighty clone. Order of work: **status trust → cut dead sci-fi → measure travel-day opens → free invite wedge → then airports.** Do not expand SEA-quality maps until analytics show travel-day habit. Archive forwards without stay dates never invent future check-ins. Push snapshots must key by reservation flightDate (F13), not "today."

---

## Decision checklist (before shipping a feature)

Ask every time:

1. **Sleep truth** — Does this use hotel cities/dates, not airport inference?  
2. **Connector truth** — Does this help execute the leg between stays (with user choice)?  
3. **Note truth** — If the user types intent, does the system reconcile or ignore?  
4. **Purchase truth** — Is this booked fact vs plan/suggestion clearly separated?  
5. **Label truth** — Are we showing the traveler's asset name, not the aggregator?  
6. **Locale truth** — Are new strings in `messages/en.json` + `messages/es.json`?

If any answer is wrong, fix the reasoning — not just the symptom.

---

## Recommended next updates (priority)

| Priority | Area | Apply principle |
|----------|------|-----------------|
| P0 | **Home / Trip Health** | Airport→first-hotel gap card with route sheet (same as Plan transport UI) |
| P0 | **gapDetectionService** | Classify `airport_transfer` vs `inter_city`; don't flag hotel city from arrival IATA |
| P1 | **Book tab** | After hotel pick, prompt ground leg to property; external book + forward hint |
| P1 | **Map tab** | Connector polylines between stay pins; tap → route sheet |
| P1 | **deriveTripStaySegments** | Single source for stay segments consumed by Home, Plan, Book |
| P2 | **TripStayPlanner** | Hotel-first city list; collapse connection-only stops |
| P2 | **Support chat** | Pass active trip summary in every turn (`buildSupportContext`) |
| P2 | **Spanish i18n** | Home headers, gap banners, Book CTAs, More settings — see `messages/es.json` |
| P2 | **Award / multi-city** | Same hotel-first + connector rules for award strategies |
| P3 | **ML readiness** | Log when user overrides timeline reconciliation → `suggestion-outcomes` |

---

## What Neuro Brain is NOT

- Not permission to train a custom model before we have correction triplets and outcome labels (`KEPI_PROJECT_MEMORY.md` § ML readiness).
- Not a replacement for design laws — laws are enforced in CI; this file explains **why** they exist.
- Not user PII storage — end-user prefs stay in Redis (`hotelStayProfile`, `traveler-genome`).

---

## Changelog

| Date | Note |
|------|------|
| 2026-07-30 | Onboarding alerts: real web-push subscribe + iOS home-screen hint |
| 2026-07-30 | Batch 1: F13 push keyed by flightDate; Home alerts prompt + trust line |
| 2026-07-30 | 10/10 path: status authority (F12), hide sci-fi, PostHog, free view invite, I45 archive; calendar I44 |
| 2026-07-30 | Calendar switch-day honesty (I44); prep vs travel chrome; archive-forward caution; clarify agents append lessons here |
| 2026-07-08 | Initial Neuro Brain — whole-trip execution philosophy, Jeff intent, apply checklist, next-update map |
