# Adaptive Travel Assistant Prototype — Product Requirements Document (PRD)

## 1) Product Overview

Adaptive Travel Assistant is a premium logistics-first travel execution app for U.S. travelers. The interface adapts to trip stage and urgency level so the user always sees the right actions at the right time.

Primary trip stages:

1. Readiness
2. Pre-departure
3. Airport
4. Arrival
5. Recovery / Disruption

Status model:

- Green: On-time and in control
- Yellow: Behind schedule / at risk
- Red: Urgent disruption requiring immediate action

Out of scope:

- Travel insurance features, recommendations, or flows are explicitly excluded.

## 2) Product Goals

1. Minimize input friction:
   - Email forwarding/importing
   - One-button voice input
2. Make the interface context-aware by trip stage and urgency
3. Provide clear operational guidance, not generic travel inspiration
4. Deliver a premium, easy-on-the-eyes visual experience

## 3) Target User

- Primary user: U.S.-based frequent traveler who values smooth execution over planning novelty.
- Core need: rapid clarity and action during dynamic trip moments (especially delays/disruptions).

## 4) Existing Prototype Baseline (Must Preserve)

- Readiness board/checklist for:
  - Flights
  - Hotels
  - Transportation
  - Passport
  - Check-in timing
  - Arrival transfer
  - Essentials
  - First-night planning
- Reservation cards generated from imported/forwarded confirmation emails
- Intake review queue for ambiguous imports (duplicate, missing data, uncertain timing)
- Adaptive stage screens (readiness/pre-departure/airport/arrival/recovery)
- Live editor controls that mutate trip state and content in real time

## 5) Core UX Principles

1. Action-first: every screen should answer "what should I do now?"
2. Progressive disclosure: high-level status first, details on demand
3. Trust through structure: imported data is editable and auditable
4. Calm urgency: premium visual design with strong emphasis cues only when needed

## 6) Feature Requirements

### A. Email Import Workflow (Realistic)

Provide an inbox-import flow that demonstrates:

- Entry points:
  - "Forward your confirmations"
  - "Paste email content"
  - "Connect inbox (prototype simulation)"
- Raw email preview panel (subject, sender, timestamp, message body excerpt)
- Parsed object preview panel (reservation type, provider, date/time, location, confirmation code)
- Mapping quality indication:
  - High confidence (auto-approve candidate)
  - Medium confidence (review suggested)
  - Low confidence (review required)
- Explicit "Send to Review Queue" and "Add to Live Trip" actions

### B. Reservation Detail Drawers / Modals

Each reservation card should open a details panel containing:

- Full parsed fields and original source snippets
- Editable fields and save/cancel actions
- Confidence markers per field (where relevant)
- Operational actions:
  - Call provider
  - Open map/directions
  - Copy confirmation code
  - Add note

### C. Intake Review Queue Actions

Review queue items should support:

- Accept as-is
- Edit then accept
- Merge with existing item (for duplicates)
- Reject/archive
- Request re-parse (prototype action)

Queue UI should clearly show:

- Why an item was flagged
- Impact if unresolved (for example, "airport transfer timing unknown")

### D. Missed-Flight / Disruption Recovery Workflow

Recovery mode should include an actionable playbook:

- "Who to call now" (airline, hotel, transfer, key contacts)
- "What to say" scripted prompts (short and practical)
- Decision-path guidance based on:
  - Current status severity (green/yellow/red)
  - Reservation context and available fallback options
  - Card/travel-benefit placeholders (operational support framing only; no insurance flows)

Recovery must prioritize immediate execution over information density.

## 7) Non-Functional Requirements

- Premium visual hierarchy: legible typography, low eye strain, high contrast for critical actions
- Responsive layout for laptop and tablet portrait/landscape
- Fast interaction response for stage switching and drawer/modals
- Clear empty/error states for import and review workflows

## 8) Content and Tone Requirements

- Language should be concise, operational, and confidence-building
- Avoid legal/coverage wording related to insurance
- Status copy must be explicit and actionable

## 9) Acceptance Criteria

### Email Import

- User can view raw email content and parsed reservation side by side
- User can route import to either live trip or review queue
- At least one ambiguous case is represented with reason labels

### Reservation Details

- Every reservation card has a visible details entry point
- Details panel exposes editable fields and source references
- Save/cancel controls work at prototype level (state updates reflected)

### Review Queue

- Each flagged item shows reason(s) and suggested action
- Accept/edit/merge/reject actions are present and stateful
- Queue changes propagate to live trip cards when accepted

### Recovery Mode

- Red-state disruption view provides a prioritized action list
- Includes "who to call" and "what to say" guidance blocks
- Presents a branching decision path for at least one disruption scenario (for example, missed flight)

### Scope Guardrail

- No travel insurance feature, copy, or call-to-action appears anywhere in the prototype

## 10) Delivery Constraints for Future AI Iterations

- Return full complete files only (no partial snippets)
- Put exact file path at the top of every file handoff
- Implement comprehensively, anticipating likely next-step needs

## 11) Canonical Working File

`~/output/travel-app/adaptive-travel-assistant.html`
