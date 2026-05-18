# Adaptive Travel App Prototype — Handoff

## Summary
We are building a premium adaptive travel app prototype for a U.S. traveler that changes its interface based on trip stage:

- Readiness
- Pre-departure
- Airport
- Arrival
- Recovery / Disruption mode

The product focus is logistics and trip execution, not travel insurance. Travel insurance is explicitly excluded from this app concept.

## Core Product Goals

1. Extremely easy input, especially:
   - Email forwarding/importing
   - One-button voice input
2. Adaptive screens and buttons that change as the traveler moves through the trip
3. A green/yellow/red trip-status model for:
   - On-time (green)
   - Behind (yellow)
   - Urgent (red)
4. A premium, easy-on-the-eyes interface with clear operational guidance
5. High accuracy and missed-event prevention so users do not miss flights, trains, rides, or time-critical plans due to app mistakes
6. Exportable static itineraries (PDF/Word/Excel) for offline/reference use
7. Family sharing with per-person schedule views and coordination safeguards
8. Optional family location map to prevent people getting separated, with clear on/off sharing controls

## Current Prototype Includes

- A readiness board/checklist for:
  - Flights
  - Hotels
  - Transportation
  - Passport
  - Check-in timing
  - Arrival transfer
  - Essentials
  - First-night planning
- Imported reservation cards representing structured objects created from forwarded emails
- An intake review queue for unclear imported items (duplicates, missing fields, uncertain timing) before those items affect the live trip
- Adaptive screens for readiness, pre-departure, airport, arrival, and recovery
- Live editor controls that change trip state, counts, and screen content in real time

## Coding Preferences (Important)

- Always provide full complete files, never partial snippets or diffs
- Always put the exact file path at the top of any code handoff
- Write comprehensively and anticipate next-needed features instead of tiny incremental edits
- Follow enterprise release gates documented in `docs/enterprise-quality-charter.md`

## File Location

Current working prototype file:

`~/output/travel-app/adaptive-travel-assistant.html`

Confirmed directory contents currently show:

- `adaptive-travel-assistant.html` inside `~/output/travel-app`

## Next Recommended Build Steps

1. Add a realistic email import workflow UI, including raw email preview to structured reservation object mapping
2. Add detail drawers or modal panels for reservation cards and review queue items
3. Add a stronger missed-flight/disruption recovery panel with:
   - Who to call
   - What to say
   - Decision-path guidance based on status or card benefits
4. Preserve premium adaptive design and keep the app centered on trip logistics, not insurance
5. Add anti-miss safeguards:
   - Timezone-aware timeline validation
   - Escalating reminder cadence
   - "Latest safe departure" recommendations
   - Audit log + undo for critical time edits
6. Add static itinerary export options (PDF/Word/Excel) with per-person and date-range filters
7. Add a user setting for "update only on Wi-Fi" with visible sync status and queued update behavior
8. Add family-sharing controls with in-app "who am I" selection and person-specific timelines
9. Add an optional family map with consent-based location sharing toggles, visibility controls, and stale-location indicators

## Copy-Ready Prompt

Build on this file: `~/output/travel-app/adaptive-travel-assistant.html`.

We are creating a premium adaptive travel app prototype. Keep the existing concepts: readiness checklist, imported reservation cards, intake review queue, adaptive trip-stage screens, green/yellow/red status system, email-forwarding intake, and one-button voice input. Add static itinerary export support (PDF/Word/Excel), optional Wi-Fi-only sync updates, shared family views with person-specific timelines, and an optional family location map with explicit on/off controls. Do not add travel insurance; that is explicitly excluded from this app.

Important delivery rules: give me the complete full file, not snippets, and put the exact file path at the top of the response. The next version should add a realistic inbox-import flow, reservation detail drawers, review-queue actions, and a stronger missed-flight recovery workflow with operational guidance while preserving premium visual quality and anti-miss reliability.
