# Airport bot memory

Owns: airport navigation, connection guidance, NextUp/OnTrack, trip-guidance language rules.

## Critical rules

- Timezone: `Date.UTC` + Intl offset — never `new Date(localString)` (AGENTS.md §11)
- No "illegal/impossible/rebook immediately" headlines for through-tickets
- Global Entry: always show GE kiosk + Mobile Passport

## Changelog

| Date | Note |
|------|------|
| 2026-06-15 | Bot Deck initialized |
