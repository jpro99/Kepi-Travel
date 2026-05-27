# Kepi-Search Permanent Engineering Rules

These rules are mandatory for every coding session.

## 1) Understand before editing
- Read the relevant files end-to-end before changing code.
- Do not guess requirements or behavior.
- If behavior is unclear, trace the data flow first.

## 2) No blind patching
- Do not patch code without understanding call sites and side effects.
- Prefer targeted, minimal edits over broad speculative rewrites.
- Verify imports, types, runtime environment, and execution context before modifying logic.

## 3) File creation discipline
- Do not create random/new files unless strictly necessary.
- Prefer updating existing modules.
- When a new file is required, wire it into the codebase intentionally and remove dead code.

## 4) Safe ID generation (required)
- Never use `crypto.randomUUID()`, `window.crypto.randomUUID()`, `self.crypto.randomUUID()`, or direct `randomUUID()` calls in app code.
- Always use the shared utility: `@/lib/utils/generateId`.

## 5) Redis/KV safety (required)
- Never initialize Redis clients at module top level.
- Never call `Redis.fromEnv()` outside a lazy function path.
- All Redis/KV operations must fail safely (no app crash on missing env/config/provider errors).

## 6) Next.js version caution
- This repo may use breaking Next.js behavior.
- Before framework-level changes, read relevant docs in `node_modules/next/dist/docs/`.

## 7) Validation before finishing
- Required checks before finalizing:
  - `npm run lint`
  - `npm run build`
- If changes affect covered behavior, run related tests.

## 8) Git quality
- Use clear, descriptive commit messages.
- Keep commits focused on one logical change.
- Do not leave partial or unexplained edits.

## 9) Search ALL files before fixing
- When fixing a bug, search the entire repo for the same pattern before pushing.
- Use the GitHub API tree endpoint to find all .ts/.tsx files then grep for the pattern.
- Never fix one file and assume it is the only instance.

## 10) Email sending
- Resend requires `@react-email/render` to render React components to HTML.
- Use `render()` from `@react-email/render` then pass `html:` to resend.emails.send().
- Never use `react:` prop directly — Resend will throw "Failed to render React component".
- Never use `renderToStaticMarkup` from react-dom/server — same issue.
- Shared Resend client: `getResendClient()` from `@/lib/email/resendClient`.
- Shared from address: `getResendFromEmail()` — reads `RESEND_FROM_EMAIL` env var.

## 11) Timezone conversion (critical)
- NEVER use `new Date(localTimeString)` for timezone conversion — browser timezone pollutes the result.
- ALWAYS use `Date.UTC()` to parse local time components, then apply Intl.DateTimeFormat offset.
- Correct algorithm (used in NextUpCard, OnTrackButton, TripTimeline):
  1. Parse components → `approxUtcMs = Date.UTC(year, month-1, day, hour, min)`
  2. Format approxUtcMs in target timezone via Intl.DateTimeFormat
  3. Parse formatted parts → `tzAsUtcMs = Date.UTC(...formatted parts...)`
  4. `offsetMs = tzAsUtcMs - approxUtcMs`
  5. `return approxUtcMs - offsetMs`
- This is implemented as `toUtcMs(localTime, timezone)` in all three components.
- HND 21:20 JST → 12:20 UTC. HNL 13:41 HST → 23:41 UTC. Gap = 11h21m. HND is seq=1.

## 12) AI guidance rules
- Both SYSTEM_PROMPT and ON_TRACK_SYSTEM_PROMPT inherit from MASTER_CONCIERGE_PROMPT.
- Language rules (no "illegal", no "impossible", no "rebook immediately" for through-tickets) must be in MASTER_CONCIERGE_PROMPT to apply to both.
- Server-side enforcement in route.ts catches forbidden headlines even if AI ignores prompt.
- Pre-compute utcTime and seq fields in context so AI never does timezone math.
- arrivalTime="[not stored — do not estimate]" when missing — AI must not guess arrival times.

## 13) Invite system
- Send invite: `/api/admin/send-invite` POST — generates code with intendedEmail + sends email.
- Redeem: `/api/invite/redeem` — verifies user's Clerk email matches intendedEmail before allowing.
- Codes without intendedEmail (generated without email) work for anyone.
- Email template: `src/lib/email/templates/inviteEmail.tsx` — navy-to-azure gradient.

## 14) Domain
- Production domain: kepitravel.com (DNS on Cloudflare, Vercel auto-configured)
- www.kepitravel.com redirects to kepitravel.com
- NEXT_PUBLIC_APP_URL = https://kepitravel.com

---

## Fix Log

### 2026-05-27 (Session 3)
- Fixed `toUtcMs` using `Date.UTC` in NextUpCard, OnTrackButton, TripTimeline — browser timezone no longer pollutes UTC conversion
- Fixed `buildContext`/`buildContextBlock` in all three components — pre-computes `utcTime` and `seq` fields so AI never does timezone math
- Fixed `T23:59:00` pattern removed from all three components
- Fixed ON_TRACK_SYSTEM_PROMPT missing language rules — moved to MASTER_CONCIERGE_PROMPT so both prompts inherit them
- Fixed server-side language enforcement in trip-guidance route — catches "illegal/impossible/rebook" headlines before they reach user
- Fixed packing timing rules — uses utcTime for hours calculation, departure hour for morning/evening determination
- Fixed HNL connection thresholds — through-ticket 2-3.5h = warning, not critical
- Fixed Global Entry guidance — always presents both options (GE kiosk + Mobile Passport)
- Fixed checklist persistence — applyManagedTripToState marks initialized, toggle saves directly to Redis
- Fixed admin invite system — email input, send lifetime/trial buttons, result card with copy code/link
- Fixed invite email rendering — switched to @react-email/render, added to package.json
- Fixed intendedEmail lock — invite codes tied to specific email, redeem verifies Clerk email
- Replaced all violet/purple/fuchsia with enterprise blue palette across all UI components
- Deployed to kepitravel.com — Cloudflare DNS auto-configured via Vercel
