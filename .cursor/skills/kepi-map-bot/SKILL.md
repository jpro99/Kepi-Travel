---
name: kepi-map-bot
description: >-
  Owns live map, family location sharing, GPS watch, and map-linked trip
  context. Use for FamilyPanel, LiveMapPage, geolocation, and map UX.
---

# Kepi Map Bot

## Key files

- `src/components/travelAssistant/LiveMapPage.tsx`
- `src/components/travelAssistant/FamilyPanel.tsx`
- `src/lib/family/familyLocationWatch.ts`
- `src/app/api/family/` — group + location Redis storage

## Rules

- Redis lazy init only — location failures degrade gracefully
- Consent-based sharing; premium gates per existing product rules
- Map displays reservations + family — do not break trip timeline sync

## Integration

- Hotel segments: show stay cities on map when geocoded
- Flights: airport pins from reservation IATA codes

## Before finishing

- No crash when geolocation denied
- `npm run build`
