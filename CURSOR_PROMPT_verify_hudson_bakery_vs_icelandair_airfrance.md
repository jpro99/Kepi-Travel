Read `.cursor/skills/kepi-airport-bot/SKILL.md` and
`CURSOR_PROMPT_MASTER_airport_maps_all_airports.md` first.

## Task: verify only — do not change any coordinates, data, or shipped code yet

This is an investigation, not a fix. Report findings. Do not edit `sea.ts`, do not touch
the OSM import, do not publish anything. Jeff wants to see the actual numbers before we
decide what (if anything) needs to change.

## What to check

Near SEA coordinate `47.443492, -122.300883` (the spot Jeff pointed at, comparing
Atrius's map against real OpenStreetMap.org data at the same location):

1. Query Overpass for the real OSM node coordinates of **Hudson** and **Alki Bakery**
   (or whatever shop/food-named nodes exist within ~150m of that point — list all of them
   with their exact lat/lon and OSM tags).
2. Separately query for any OSM node tagged as a check-in desk, ticket counter, or airline
   office for **Icelandair** and **Air France** at SEA — search `aeroway=check_in_desk`,
   `office=airline`, and `operator`/`name` containing "Iceland" or "Air France", anywhere
   at SEA, not just near that one point.
3. Report, plainly:
   - The exact coordinates found for Hudson / Alki Bakery / any other named shop nodes in
     that radius.
   - Whether ANY real OSM-tagged node exists for Icelandair or Air France check-in at SEA.
     If yes: report its exact coordinate and the distance (meters) to the nearest shop node
     from step 1.
   - If no real OSM node exists for Icelandair or Air France: say so explicitly, and report
     what coordinate (if any) `sea.ts` currently uses for those two airlines today, and
     where that coordinate actually falls (on top of a real shop node? in open space?
     inside the terminal footprint?).
4. Cross-check against the already-known gap: `sea.ts` currently hardcodes airline
   check-in for Alaska, Delta, United, Air Canada, and Emirates only. Confirm whether
   Icelandair and Air France are simply absent from `sea.ts` entirely (expected finding) or
   present with an invented coordinate (bigger problem — means a coordinate was fabricated
   without ground truth, which the master prompt's core rule prohibits).

## Report format

Plain findings only, no code changes:

- Table or list: name, exact lat/lon, source tag, distance to nearest other named node.
- One-line verdict: is this a case of (a) a real airline coordinate gap — nothing invented,
  just not yet built — or (b) an actual fabricated-coordinate violation of the ground-truth
  rule that needs an immediate fix?
- If (b): identify the exact line(s) in `sea.ts` and stop there — do not fix without
  Jeff's go-ahead.

## Why this matters

Jeff compared Atrius's map against raw OpenStreetMap.org at the same spot and saw shops
where Atrius shows airlines, and asked whether Kepi's data pipeline is confusing the two.
The working theory (unverified until this check runs) is that this is not a data-source
problem — OSM's own shop tags and door/gate tags share one coordinate system and can't
disagree with each other — but rather that Icelandair and Air France simply don't have
real ground-truthed coordinates yet, same category as the known American/Frontier gap near
Door 23. This check either confirms that theory with real numbers or surfaces an actual
fabricated coordinate that violates the master prompt's core rule ("never claim precision
Kepi hasn't earned"). Either way, report back before touching anything.
