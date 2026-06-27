# Conductor memory (master)

Oversees all Kepi domain bots. Canonical project facts also live in `../KEPI_PROJECT_MEMORY.md` at repo root.

## Role

- Route work to hotel, flight, airport, map bots
- Prevent duplicate advice (e.g. Duffel Stays emails already sent)
- Enforce ship gate: lint + build before push

## Active priorities

1. Hotels: LiteAPI live, stay profile, segment planner, detail/booking next
2. Flights: keep Duffel air stable
3. Airport: timezone + guidance rules
4. Map: family tracker

## Cross-bot notes

- Jeff controls bots via **Bot Deck** (`bot-deck/` local app), not via production site
- Do not install Travelpayouts Drive on kepitravel.com

## Changelog

| Date | Note |
|------|------|
| 2026-06-15 | Bot Deck created; conductor owns master coordination |
