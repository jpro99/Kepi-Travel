# Points & card bot memory

Owns: Travel Fit, card wallet, earn stacks, loyalty pricing display, benefit playbooks, Points & Miles learn flow.

## Related skills

- `kepi-points-bot` — programs, Travel Fit, habits, status projection
- `kepi-card-bot` — `CARD_CATALOG`, earn categories, checkout recs
- Week 3 of **Weekly Audit** covers this domain explicitly

## Shipped (2026-07)

- Benefit playbooks + lounge entry steps (`benefitPlaybooks.ts`, `LoungeEntryGuide.tsx`)
- Card enrollment toggles (Priority Pass, Amex app QR) → Airport Mode
- `PointsMilesLearnPanel` under More — Rakuten, lounges, card wallet
- PDF-in-email pricing fixes + per-leg EUR/Volare parsing (with flight bot)

## Open product gaps (audit candidates)

- Re-scan / Trip health UX when PDF pricing still missing
- More cards/airports in playbook catalog (kepi-card-bot pipeline)
- Contextual Rakuten nudge at checkout time (not just More tab)
- Award trip display: miles + EUR taxes per leg on Book/Home

## Changelog

| Date | Note |
|------|------|
| 2026-07-06 | Memory file created; Week 3 audit domain |
