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
5. Provide dependable static itinerary outputs for travelers and companions (PDF/Word/Excel)
6. Support shared family coordination with person-specific schedule views
7. Offer optional family location awareness with explicit on/off consent controls

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

## 5.1) Premium Visual System Requirements (Visually Stunning)

The interface must look premium while preserving operational speed and clarity:

- Tiered visual hierarchy:
  - Primary action strip always visible in each stage
  - Secondary details in drawers/modals
  - Contextual metadata in subdued but legible styles
- High-end interaction quality:
  - Smooth, short animations for stage transitions and panel opens
  - No jitter or layout shift when status changes
- Color discipline:
  - Green/yellow/red reserved for trip-critical status and urgency
  - Neutral palette for baseline content to reduce eye fatigue
- Typography and spacing:
  - Large readable headings for moment awareness
  - Scannable card rows with generous spacing and clear iconography
- Accessibility-grade contrast and focus states on all actionable controls

The product should feel "concierge premium," but never trade clarity for decoration.

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

### E. Static Itinerary Export

Users must be able to export itinerary views into shareable static formats:

- PDF export:
  - Print-ready trip summary with timeline, confirmations, contacts, and critical alerts
- Word export (DOCX):
  - Editable narrative itinerary suitable for manual customization
- Excel export (XLSX):
  - Structured schedule rows for flights/hotels/ground/events with time and owner columns

Export requirements:

- Include timezone labels on every time-based row
- Include owner/person assignment for family/group items
- Include generated-at timestamp and source-of-truth warning ("static copy may age")
- Allow export scope selection:
  - Entire trip
  - Per person
  - Selected date range

### F. Connectivity and Sync Controls

The app must support user-directed synchronization behavior:

- Default behavior: normal sync policy
- Optional mode: "Update only on Wi-Fi"
- Visual sync state indicators:
  - Last successful sync time
  - Pending updates count
  - Sync blocked reason (for example, cellular-only network while Wi-Fi-only is enabled)

Behavioral requirements:

- When Wi-Fi-only mode is enabled, critical timeline edits are queued locally until Wi-Fi is available
- User can force a one-time manual sync override if needed
- No silent data loss when transitions occur between offline/cellular/Wi-Fi states

### G. Family Sharing and Per-Person Scheduling

The app must support shared trips where family members can see aligned information but keep personalized views.

Core requirements:

- Trip sharing:
  - Invite family members to a shared trip workspace
  - Provide role-aware visibility (for example, organizer vs traveler)
- Identity picker:
  - In-app selector: "Who am I right now?"
  - Instant switch of visible timeline/actions based on selected person
- Assignment model:
  - Every itinerary item can be assigned to one or more people
  - Group items appear on all relevant timelines
  - Individual items appear only on assigned people timelines
- Coordination safeguards:
  - Conflicts are surfaced when individual schedules diverge from group-critical moments
  - Shared transport/meeting points include attendance visibility

### H. Optional Family Location Map (Consent-Driven)

Family members may optionally share real-time location during active trip windows to reduce separation risk.

Core requirements:

- Explicit consent model:
  - Location sharing is off by default
  - Each person can enable/disable their own sharing at any time
- Visibility controls:
  - "Who can see me" options (all trip members, selected members, organizer only)
  - Per-person visibility indicator in member roster
- Map behavior:
  - Optional family map view with member markers
  - Last-updated timestamp and stale-location indicator
  - Graceful fallback when a member is offline or has location disabled
- Safety and privacy:
  - Clear in-app disclosure of what is shared and when
  - Quick "pause sharing" control from main UI
  - No background sharing outside user-defined trip windows

## 7) Non-Functional Requirements

- Premium visual hierarchy: legible typography, low eye strain, high contrast for critical actions
- Responsive layout for laptop and tablet portrait/landscape
- Fast interaction response for stage switching and drawer/modals
- Clear empty/error states for import and review workflows
- Deterministic status calculations (no hidden/random transitions)
- Timezone-safe scheduling and countdown logic
- Defensive data handling for partial/ambiguous imports
- Export generation must be deterministic and consistent with current visible trip state
- Sync policy behavior must be explicit, testable, and user-visible
- Location sharing controls must be privacy-safe, explicit, and reversible

## 7.1) Accuracy and Reliability Requirements (Anti-Miss)

Because users depend on this app for time-critical execution, missed-event prevention is a first-class requirement.

Required safeguards:

1. Multi-signal timing validation:
   - Cross-check parsed times against known airport/hotel/city timezone
   - Flag impossible or conflicting timelines before activation
2. Redundant reminders:
   - T-24h, T-12h, T-3h, T-90m, T-45m, and user-configurable critical alerts
   - Escalate reminder tone and UI prominence by green/yellow/red
3. Readiness gating:
   - Do not mark key segments "ready" when required fields are missing
   - Require explicit user confirmation on high-risk unresolved items
4. Miss-prevention buffers:
   - Precompute leave-by times for airport/train/dinner transfers
   - Surface "latest safe departure" timestamps and fallback options
5. Fallback mode:
   - If parsing confidence is low, route to review and keep prior trusted itinerary active
   - Never silently overwrite confirmed trip-critical details
6. Full auditability:
   - Log who/what changed a critical time, when, and from which source
   - Provide one-tap undo for recent critical edits

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

### Accuracy / Safety Gate

- No critical segment (flight/train/transfer/reservation) can enter "confirmed" state with unresolved time or timezone ambiguity
- Countdown and leave-by recommendations are validated against timezone-aware test fixtures
- Alert escalation behavior is deterministic and test-covered for green/yellow/red transitions
- Critical timeline edits are logged and reversible (undo path verified)

### Export / Sharing / Sync Gate

- PDF/Word/Excel exports contain timezone labels, owner assignments, and generated-at timestamp
- Per-person export matches the selected person's filtered itinerary exactly
- Wi-Fi-only mode prevents background sync on cellular while preserving queued updates
- Shared-trip person switch updates visible timeline/actions without cross-person data leakage
- Location map is optional, off by default, and respects per-person sharing consent/visibility settings

### Scope Guardrail

- No travel insurance feature, copy, or call-to-action appears anywhere in the prototype

## 10) Delivery Constraints for Future AI Iterations

- Return full complete files only (no partial snippets)
- Put exact file path at the top of every file handoff
- Implement comprehensively, anticipating likely next-step needs

## 11) Canonical Working File

`~/output/travel-app/adaptive-travel-assistant.html`
