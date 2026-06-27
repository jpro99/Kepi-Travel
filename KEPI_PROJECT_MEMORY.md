# Kepi Project Memory

**Purpose:** Durable facts for humans and AI agents working on this repo.  
**Update rule:** When the user states something that should not be forgotten (decisions, completed external steps, preferences), append or edit this file in the same session.

Last updated: 2026-06-15

---

## Owner & product

- **Owner:** Jeff Russell
- **Production:** https://kepitravel.com (Vercel + Cloudflare)
- **Canonical repo:** `C:\Projects\Kepi Travel\kepi-travel` only — see `CANONICAL.md`
- **App type:** Invite-only travel assistant (trips, flights, hotels, airport guidance, family map)

---

## External providers — current state

### Duffel (flights + stays)

- **Flights:** Live via `DUFFEL_ACCESS_TOKEN` on Vercel
- **Stays (hotels):** **NOT enabled** on account — search returns 403 until Duffel enables it
- **Owner action:** Jeff has **already emailed Duffel support multiple times** to enable Stays — **do not keep telling him to send another email** unless he asks or status changes
- **While waiting:** App uses **LiteAPI** then estimated fallback

### LiteAPI / Nuitée

- **Status:** Sandbox/production key added to Vercel as `LITEAPI_KEY`
- **Code:** Wired in `src/lib/providers/liteapi/searchHotels.ts` — waterfall after Duffel
- **Owner action:** Deploy latest code; test Monopoli on Hotels tab for real photos/rates

### Travelpayouts

- **Status:** Account exists; **Drive install declined** — correct decision
- **Do not recommend:** Installing Drive, Money Script, or sitewide widgets on kepitravel.com
- **Optional later:** Server-built affiliate deep links only (no site script) — low priority

---

## Hotel product — built features

- **Stay profile** (`/api/hotels/profile`): User describes preferences once (elevator, ocean, breakfast) — voice or text
- **Trip stay planner:** Hotels tab walks trip segment-by-segment (Monopoli, then next city)
- **Ranking:** Hyatt preference, points, memory, profile boosts, chain diversity
- **Destination aliases:** e.g. Monopoly → Monopoli
- **Not yet shipped to prod until deploy:** Confirm with git push / Vercel deploy status

---

## Jeff's hotel preferences (for ranking/testing)

- Prefers **Hyatt** (Globalist) but wants **variety** — not three Hyatts in a row
- Cares about: elevator/no stairs, ocean proximity, train/metro, quality/cleanliness, breakfast nice-to-have
- Example trip search: **Monopoli, Italy**

---

## AI domain bots (Cursor skills)

Project skills live in `.cursor/skills/` — these are **playbooks for Cursor agents**, not autonomous 24/7 processes.

| Bot | Skill path | Bot Deck memory |
|-----|------------|-----------------|
| **Conductor** | `.cursor/skills/kepi-conductor/SKILL.md` | `bot-deck/memory/conductor.md` |
| **Hotel** | `.cursor/skills/kepi-hotel-bot/SKILL.md` | `bot-deck/memory/hotel.md` |
| **Flight** | `.cursor/skills/kepi-flight-bot/SKILL.md` | `bot-deck/memory/flight.md` |
| **Airport** | `.cursor/skills/kepi-airport-bot/SKILL.md` | `bot-deck/memory/airport.md` |
| **Map** | `.cursor/skills/kepi-map-bot/SKILL.md` | `bot-deck/memory/map.md` |
| **Points** | `.cursor/skills/kepi-points-bot/SKILL.md` | — |
| **Card** | `.cursor/skills/kepi-card-bot/SKILL.md` | — |

## Travel Fit (product)

- **More tab:** Travel Fit card learns airlines, hotels, hubs from reservations; habits saved **locally on device** + optional Redis backup when signed in
- **Card wallet:** card product names only (no PAN on servers) — `/api/points-profile`
- **Earn stack:** Hotels tab shows suggested earn path — `/api/travel-fit`
- **Hybrid model:** free basics; Pro for deep optimization later
- **Rakuten:** one-tap only, never silent auto-apply

**Local control UI:** `bot-deck/` — run `cd bot-deck && npm start` → http://127.0.0.1:3847 (phone: same Wi‑Fi). Assign tasks, edit memory, copy Cursor prompts. Does **not** auto-spend AI credits.

**Remote control UI:** https://kepitravel.com/admin/bots — admin login + `ADMIN_USER_IDS`. Redis-backed tasks/memory; works from phone anywhere (no PC required).

**How Jeff uses them:** Bot Deck for tasks/memory → paste prompt in Cursor → mark task done.

---

## Agent instructions (read every session)

1. Read this file before giving provider/setup advice
2. Do not repeat completed owner actions (Duffel emails, LiteAPI signup, Travelpayouts skip)
3. After meaningful decisions, update this file
4. App user memory ≠ this file — user prefs live in Redis (`hotelStayProfile`, `hotelMemory`, `traveler-genome`)

---

## Changelog

| Date | Note |
|------|------|
| 2026-06-15 | Created memory file; documented Duffel emails sent, LiteAPI key set, Travelpayouts Drive skipped, domain bot skills |
