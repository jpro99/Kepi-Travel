# Kepi Bot Deck

**Local control panel for domain bots** — runs on your PC, **not** deployed to kepitravel.com.

## Quick start

```powershell
cd bot-deck
npm start
```

- **Desktop:** http://127.0.0.1:3847  
- **Phone:** same Wi‑Fi → URL printed in terminal (e.g. `http://192.168.x.x:3847`)

Add to phone home screen for an app-like shortcut.

## Optional phone security (same Wi‑Fi)

```powershell
$env:BOT_DECK_TOKEN = "pick-a-long-secret"
npm start
```

On phone, open: `http://192.168.x.x:3847?token=pick-a-long-secret` (saved in browser).

## What it does

| Feature | Description |
|---------|-------------|
| **Dashboard** | See each bot idle / queued / active |
| **Instruct** | Assign tasks + get a **Cursor paste prompt** |
| **Tasks** | Start / done / cancel — track credit scope |
| **Messages** | Log between you ↔ bots ↔ conductor |
| **Memory** | Edit per-bot `.md` files; conductor sees cross-bot notes |

## Memory files

| Bot | File |
|-----|------|
| Conductor (master) | `memory/conductor.md` |
| Hotel | `memory/hotel.md` |
| Flight | `memory/flight.md` |
| Airport | `memory/airport.md` |
| Map | `memory/map.md` |
| Points & card | `memory/points.md` |
| Weekly audit reports | `memory/audits/` |
| Project-wide | `../KEPI_PROJECT_MEMORY.md` |

Cursor skills in `.cursor/skills/kepi-*` should align with these files.

## Workflow

1. Assign task in Bot Deck → copy **Cursor prompt**
2. Paste in Cursor chat → agent follows skill + reads memory
3. Mark task **Done** in Bot Deck when finished

### Weekly Audit (every ~1 week)

1. In Cursor: *"Run Kepi Weekly Audit"* (uses `kepi-weekly-audit` skill)
2. Read report in `memory/audits/` — pick **build #1**, **#2**, etc.
3. Tell Conductor: *"build #2 from last audit"* → routes to domain bot + ships

Bots do **not** auto-run LLM calls — you control when Cursor spends credits.

## Env

| Variable | Default |
|----------|---------|
| `BOT_DECK_PORT` | `3847` |
| `BOT_DECK_HOST` | `0.0.0.0` |
| `BOT_DECK_TOKEN` | (optional) |
