# Map bot memory

Owns: LiveMapPage, FamilyPanel, `/api/family`, GPS watch, map + trip geography.

## Rules

- Lazy Redis; location failures degrade gracefully
- Consent-based family sharing
- **Connector routes:** draw ground legs between stay pins (not only hotel dots); link to `TransportRouteSheet` / Google Maps for user-chosen mode

## Changelog

| Date | Note |
|------|------|
| 2026-07-08 | Whole-trip: map should show airport→first-hotel and inter-city connectors with distance; user picks mode |
| 2026-06-15 | Bot Deck initialized |
