# Adaptive Travel Assistant Prototype — AI Execution Checklist

Use this checklist when implementing the next version of:

`~/output/travel-app/adaptive-travel-assistant.html`

## Operating Rules (Hard Requirements)

- [ ] Provide the complete full file in every delivery (no snippets or diffs)
- [ ] Put the exact file path at the top of the response
- [ ] Preserve premium adaptive UX direction
- [ ] Keep app focused on trip logistics/execution
- [ ] Do not add travel insurance content or workflows

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

## Minimum Acceptance Gate (Must Pass)

- [ ] Inbox import is demonstrably realistic (raw -> parsed -> route)
- [ ] Reservation details are viewable/editable in drawers/modals
- [ ] Review queue supports meaningful triage actions
- [ ] Recovery mode has operational scripts and decision guidance
- [ ] Green/yellow/red status meaning is visible across the app
- [ ] No insurance references are present

## Suggested Demo Script (Optional but Recommended)

- [ ] Start in readiness with green state
- [ ] Import one clean and one ambiguous reservation
- [ ] Route ambiguous item into review queue
- [ ] Resolve queue item via edit + accept
- [ ] Simulate missed-flight and show red recovery workflow
- [ ] Return to stabilized yellow/green state after actions
