# Europe 2026 trip — live fix log (Sep 2026)

**Purpose:** Single source of truth for everything Jeff hit on the **Europe 2026** trip (ONT→SEA→BRI→FCO→VCE→MUC, Puglia stays, Sep 2026) and what must roll out to **every bundled airport map** — not just FCO.

**Use this when:** curating the next airport, auditing BRI/FCO/VCE/MUC layouts, or asking "did we already fix X for all airports?"

**Related:** `KEPI_PROJECT_MEMORY.md` (durable decisions), `KEPI_DESIGN_LAW.md` (enforceable laws), `CURSOR_PROMPT_MASTER_airport_maps_all_airports.md` (build spec).

---

## Trip airports with bundled Kepi layouts

| IATA | Role on trip | Layout file | Notes |
|------|----------------|-------------|--------|
| **SEA** | Hub depart | `layouts/sea.ts` | Only `routeGrade: "surveyed"` footways pilot |
| **ONT** | Origin | `layouts/ont.ts` | Small two-terminal |
| **BRI** | Puglia arrival | `layouts/bri.ts` | Serves Monopoli/Polignano metro |
| **FCO** | Rome hub + connection | `layouts/fco.ts` | OSM A+E only; M70 numbered T3 desks |
| **VCE** | Venice | `layouts/vce.ts` | Marco Polo — not TSF |
| **MUC** | Munich outbound | `layouts/muc.ts` | Satellite train from T2 |

**Europe path law (existing):** `KEPI_PROJECT_MEMORY.md` — never prompt absurd ground legs (FCO→Polignano when FCO→BRI booked); hotel city beats flight arrival for stay display (I22).

---

## Session 2026-09-02 — fixes shipped / in PR (record for map rollout)

### A. Cross-airport — **code already applies to ALL maps** (no per-IATA edit)

| ID | Problem Jeff saw | Fix | Files | Law |
|----|------------------|-----|-------|-----|
| **M71** | At FCO in a **club/lounge**: no blue dot, can't tap **I'm here**, Kepi questions had no keyboard | Raw GPS drives puck (`resolveTravelerDisplayPosition`); preview mode no longer hides position; **I'm here** + map helper + journey prompts when coords exist; typed reply + **Skip for now** on journey/security cards; `isNearAirportIata` (1.35× radius slack) for Live Map live mode | `AirportNavigatorMap.tsx`, `travelerPosition.ts`, `airportGeo.ts`, `LiveMapPage.tsx` | M71 |
| **M16** (prior) | Indoor GPS snaps to wrong gate | User **I'm here** tap wins; confirm banner; moves above question sheets | `confirmTravelerSpot.ts`, `AirportNavigatorMap.tsx` | M16 |
| **M30** (prior) | Fake walking line through tarmac | `routeGrade: "schematic"` — pins only until footways surveyed | All bundled layouts | M30 |
| **G27/G65** | Yellow forwarded-flight banner dead tap; app showed **Bari** while at **FCO** | Low-confidence forwards open review editor; GPS physical campus wins over stale URL/flight preview; `selectNextRemainingFlight({ physicalAirportIata })` | `forwardedReviewOpen.ts`, `page.tsx`, `flightSort.ts`, `mapTabLead.ts` | G27 |
| **G69–G71** | Support chat input hidden / can't type after long reply | Tab-bar inset, keyboard-safe sheet, multi-turn | `SupportChat.tsx`, `ConsumerReviewSheet.tsx` | G69–G71 |
| **F9** (Sep 1) | App froze at airport (1–2s gate poll) | 4 min poll at airport; bucket-based interval reset | flight status poll hooks | F9 |
| **I61** (Sep 1) | Blank screen after deploy | SW only caches OK responses; single reload owner | `public/sw.js`, `DeployRefresh` | I61 |

**Rollout action for agents:** M71 is **done in code for every IATA** — verify at SEA/LAX/ONT/BRI/FCO/VCE/MUC in admin gallery + one real device GPS test per hub.

---

### B. Per-airport **data** work (apply pattern to each layout)

| ID | Pattern | FCO status | Roll out to |
|----|---------|------------|-------------|
| **M70** | Numbered **check-in desks** per airline/terminal on map + distance-to-desk copy | Shipped on `cursor/runway-gps-honest-position-6c89` — ADR T3 desks | **BRI, VCE, MUC, LAX, SEA** — query official airline desk charts; add `resolveAirlineCheckinCounter` POIs; never guess desk numbers |
| **M34** | Named lounges/clubs as surveyed POIs from OSM | Partial — club Jeff was in may need OSM re-import or click-to-place | Re-run `osmImport` draft for each Europe hub; admin publish after human verify |
| **M37** | Real footways → `routeGrade: "surveyed"` | **SEA only** | FCO/VCE/MUC: Phase 2 footway overlay when Jeff prioritizes |
| **M29** | Layout quality audit (no orphan POIs, no backtrack) | All bundled pass build gate | Re-run after any FCO lounge pin adds |

**Jeff at FCO club:** After M71 ships, flow is: see GPS dot → **I'm here** → tap near lounge on map → optional map-helper chip if enabled → typed "I'm in the club" on journey card.

---

### C. Plan / trip truth (not map geometry — but affects Map tab airport pick)

| ID | Problem | Fix | Files |
|----|---------|-----|-------|
| **I22** | Calendar showed **Monopoli** Sep 8–12 but hotel is **Lecce** | Booked hotels overlay talk-to-plan stop ranges | `dayNoteStopRanges.ts`, `page.tsx` |
| **F3** (prior) | False CONNECTION ISSUE ONT→SEA→FCO | Don't invent arrival time for connection math | connection engine |
| **F16/F17** | Home "in the air" wrong copy / missing arrival time | Honest airborne card; parser `arrivalTime` on import | `homeDayTruth`, flight parser |

---

## Map update checklist (run for **each** bundled airport)

Use after any trip-session fix that touches `AirportNavigatorMap` or layout data.

1. **GPS honesty (M71)** — Open Live Map → Airport with location on; confirm puck shows indoors; **I'm here** pins; orange dot = off-graph OK.
2. **Geofence** — `isNearAirportIata` slack: spot-check centroid + ~1 km offset still counts as "at airport" for live mode.
3. **Check-in desks (M70 pattern)** — Official airline desk chart → numbered POIs → `*NodeContainment` test → distance guidance string.
4. **Lounges/clubs** — OSM `lounge` + named clubs; if missing, admin click-to-place with `precision: "surveyed"` + OSM note in `notes`.
5. **Gates** — Booked gate highlights; live gate poll (F9) doesn't freeze UI.
6. **Honesty** — `routeGrade` still `schematic` unless footways rebuilt; security disclaimer visible (M32).
7. **Admin verify** — `/admin/airport-editor` → bundled gallery → Plan/At-airport toggle; audit health badge green.
8. **Regression tests** — `npm run test:laws` includes `airportTravelerGpsPuck.test.ts`, `airportGeo.test.ts`, `allAirportsQuality.test.ts`, `*NodeContainment.test.ts`.

---

## PR / branch index (Sep 2026 session)

| Branch | PR | Contains |
|--------|-----|----------|
| `cursor/fco-map-position-6c89` | #120 | **M71** GPS puck + typed journey prompts |
| `cursor/forward-flight-tap-fco-6c89` | #119 | **I22** Lecce calendar + **G27/G65** forwarded flight / FCO location |
| `cursor/runway-gps-honest-position-6c89` | #117 | **M70** FCO numbered desks + runway GPS honesty |
| `main` (Sep 1) | — | F9, I61, I62, gate walk, I'm-here UX, F10 check-in URLs |

**Merge order for Jeff:** #119 + #117 + #120 → `main` → Vercel prod → hard-refresh once (I61).

---

## Do not repeat

- Do not hide the GPS puck in `previewMode` when `userLat`/`userLon` exist.
- Do not require graph snap to draw the user marker — raw GPS is honest (M71).
- Do not use talk-to-plan city when a **booked hotel** in another city exists (I22).
- Do not show stale **BRI** preview when GPS says **FCO** (G65).
- Do not make journey/security questions **buttons-only** — always offer type + skip.

---

*Last updated: 2026-09-02 — append one line per new trip fix; link new laws in `KEPI_DESIGN_LAW.md`.*
