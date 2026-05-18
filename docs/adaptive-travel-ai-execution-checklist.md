# Adaptive Travel Assistant Prototype — AI Execution Checklist

Use this checklist when implementing the next version of:

`~/output/travel-app/adaptive-travel-assistant.html`

## Operating Rules (Hard Requirements)

- [ ] Provide the complete full file in every delivery (no snippets or diffs)
- [ ] Put the exact file path at the top of the response
- [ ] Meet enterprise quality standards from `docs/enterprise-quality-charter.md`
- [ ] Preserve premium adaptive UX direction
- [ ] Deliver a visually stunning, premium-quality interface (without sacrificing clarity)
- [ ] Keep app focused on trip logistics/execution
- [ ] Do not add travel insurance content or workflows
- [ ] Prioritize accuracy and missed-event prevention over cosmetic scope
- [ ] Support static itinerary exports (PDF/Word/Excel)
- [ ] Support optional "update only on Wi-Fi" sync policy
- [ ] Support family sharing with per-person schedule views
- [ ] Support optional family location map with per-person on/off sharing control

## Phase 1: Preserve Existing Core Behaviors

- [ ] Keep readiness checklist areas:
  - [ ] Flights
  - [ ] Hotels
  - [ ] Transportation
  - [ ] Passport
  - [ ] Check-in timing
  - [ ] Arrival transfer
  - [ ] Essentials
  - [ ] First-night planning
- [ ] Keep reservation cards created from imports
- [ ] Keep intake review queue for uncertain imports
- [ ] Keep adaptive stage screens:
  - [ ] Readiness
  - [ ] Pre-departure
  - [ ] Airport
  - [ ] Arrival
  - [ ] Recovery
- [ ] Keep live state editor controls

## Phase 2: Build Realistic Inbox Import Flow

### UI Components

- [ ] Add import entry area with options:
  - [ ] Forwarded email intake
  - [ ] Paste email text
  - [ ] Simulated inbox connection CTA
- [ ] Add raw email preview panel:
  - [ ] Subject
  - [ ] Sender
  - [ ] Timestamp
  - [ ] Body excerpt/full block
- [ ] Add parsed reservation preview panel:
  - [ ] Reservation type
  - [ ] Provider/vendor
  - [ ] Date/time
  - [ ] Location
  - [ ] Confirmation code

### Actions + States

- [ ] Add confidence labels (high/medium/low)
- [ ] Add action buttons:
  - [ ] Add to Live Trip
  - [ ] Send to Review Queue
  - [ ] Edit Parsed Fields
- [ ] Add at least one ambiguous sample that defaults to review queue

## Phase 3: Reservation Detail Drawer/Modal

- [ ] Add open-details affordance on each reservation card
- [ ] Add details drawer or modal including:
  - [ ] Full structured fields
  - [ ] Source snippet reference
  - [ ] Editable values
  - [ ] Save/cancel controls
- [ ] Add operational quick actions:
  - [ ] Copy confirmation code
  - [ ] Call provider (mock action acceptable)
  - [ ] Open directions/map link (mock action acceptable)
  - [ ] Add internal trip note

## Phase 4: Review Queue Action Layer

- [ ] For each queue item, show:
  - [ ] Flag reason(s)
  - [ ] Data confidence
  - [ ] Potential trip impact if unresolved
- [ ] Add item actions:
  - [ ] Accept
  - [ ] Edit + Accept
  - [ ] Merge duplicate
  - [ ] Reject/archive
  - [ ] Re-parse (prototype simulation)
- [ ] Ensure accepted items appear in live trip cards

## Phase 5: Missed-Flight / Disruption Recovery

- [ ] Expand recovery panel with urgency-based layout:
  - [ ] Green guidance
  - [ ] Yellow guidance
  - [ ] Red guidance (highest priority)
- [ ] Add "Who to call now" block
- [ ] Add "What to say" script block
- [ ] Add decision-path tree for missed-flight scenario
- [ ] Include card-benefit-aware logistics options without insurance framing

## Phase 6: Quality and UX Polish

- [ ] Maintain easy-on-the-eyes typography and spacing
- [ ] Ensure critical actions are obvious and reachable quickly
- [ ] Confirm stage transitions visibly change available actions
- [ ] Validate voice-input CTA remains one-button and prominent
- [ ] Add empty/error states for import parsing and queue actions
- [ ] Reserve green/yellow/red for trip-critical urgency only
- [ ] Ensure no layout shift/jank during stage or severity transitions
- [ ] Add premium motion polish (subtle, fast, purposeful)
- [ ] Keep prompts non-annoying: dedupe repetitive nudges and provide a subtle guidance mode
- [ ] Before every major feature pass, run a "readiness -> recovery" flow audit to remove input friction and preserve one-way trip momentum

## Phase 7: Accuracy, Safety, and Miss-Prevention

- [ ] Add timezone-aware date/time model across all reservations
- [ ] Validate parsed event times against location/timezone and flag conflicts
- [ ] Compute and display "latest safe departure" for airport/train/dinner commitments
- [ ] Add escalating alert schedule (for example: T-24h, T-12h, T-3h, T-90m, T-45m)
- [ ] Block "confirmed" state for critical cards with unresolved required fields
- [ ] Keep prior trusted itinerary active when new import confidence is low
- [ ] Add audit log entries for critical timeline changes
- [ ] Add one-tap undo for recent critical edits

## Phase 8: Test Matrix (Must Run)

- [ ] Parser contract tests:
  - [ ] clean reservation email
  - [ ] missing-time email
  - [ ] duplicate reservation email
  - [ ] conflicting-time email
- [ ] Timezone tests:
  - [ ] same-day domestic trip
  - [ ] overnight trip crossing timezone
  - [ ] daylight saving boundary case
- [ ] State-machine tests:
  - [ ] readiness -> pre-departure -> airport -> arrival
  - [ ] any stage -> recovery on disruption trigger
  - [ ] green -> yellow -> red escalation behavior
- [ ] E2E disruption tests:
  - [ ] missed-flight playbook appears with prioritized actions
  - [ ] call script content populates with reservation context
  - [ ] queue resolution updates live itinerary deterministically
- [ ] Family location tests:
  - [ ] map does not show member until sharing is enabled
  - [ ] disabling sharing removes/hides location promptly
  - [ ] visibility permissions are enforced correctly
  - [ ] stale/offline indicator appears when location is outdated

## Phase 9: Static Export, Sync Policy, and Family Collaboration

### Static Exports

- [ ] Add export actions for:
  - [ ] PDF
  - [ ] Word (DOCX)
  - [ ] Excel (XLSX)
- [ ] Add export scope selector:
  - [ ] full trip
  - [ ] selected person
  - [ ] selected date range
- [ ] Ensure exports include:
  - [ ] timezone labels
  - [ ] confirmation codes where relevant
  - [ ] assigned person/owner
  - [ ] generated-at timestamp and static-copy warning

### Sync Policy Controls

- [ ] Add settings toggle: "Update only on Wi-Fi"
- [ ] Add sync status widget:
  - [ ] last successful sync time
  - [ ] pending updates count
  - [ ] blocked reason when Wi-Fi-only mode is active on cellular
- [ ] Queue trip updates locally when Wi-Fi-only mode blocks sync
- [ ] Add manual "sync now once" override action

### Family Sharing + Person Context

- [ ] Add shared-trip member list and invite simulation
- [ ] Add identity picker ("Who am I?")
- [ ] Filter timeline/actions based on selected person
- [ ] Support group-assigned and individual-assigned items
- [ ] Surface conflicts where person-level schedules risk missing group-critical events
- [ ] Add optional family map view with member markers
- [ ] Default location sharing to OFF for each person
- [ ] Add per-person location sharing toggle (self-controlled)
- [ ] Add visibility controls ("who can see me")
- [ ] Show last-updated timestamp and stale-location state per member

## Minimum Acceptance Gate (Must Pass)

- [ ] Inbox import is demonstrably realistic (raw -> parsed -> route)
- [ ] Reservation details are viewable/editable in drawers/modals
- [ ] Review queue supports meaningful triage actions
- [ ] Recovery mode has operational scripts and decision guidance
- [ ] Green/yellow/red status meaning is visible across the app
- [ ] Visual quality is premium and stable under all stage transitions
- [ ] Time-critical cards cannot be confirmed with unresolved ambiguity
- [ ] Timezone-aware countdowns and leave-by times pass fixture tests
- [ ] Critical edit audit + undo flow works for timeline changes
- [ ] PDF/Word/Excel exports are generated and accurate for selected scope
- [ ] Wi-Fi-only mode blocks cellular sync and preserves queued updates
- [ ] Person selector correctly personalizes itinerary without data bleed
- [ ] Family map remains optional and off by default
- [ ] Location visibility always matches each person's consent settings
- [ ] No insurance references are present

## Suggested Demo Script (Optional but Recommended)

- [ ] Start in readiness with green state
- [ ] Import one clean and one ambiguous reservation
- [ ] Route ambiguous item into review queue
- [ ] Resolve queue item via edit + accept
- [ ] Simulate missed-flight and show red recovery workflow
- [ ] Return to stabilized yellow/green state after actions
