---
name: AppleSkill
description: >-
  Installed Apple skill for Kepi Travel. Use when Jeff says AppleSkill, Apple,
  HIG, Picasso, polish, or “does this look like Apple?” Kepi chrome first;
  Apple HIG corpus for facts only.
---

# AppleSkill

Installed project skill for Claude Code and Cursor.

## Load order (required)

1. `.cursor/skills/kepi-apple-bot/SKILL.md` — Kepi tokens, Picasso, G4/G16/G21
2. `KEPI_DESIGN_LAW.md` — G4, G16, G20, G21, I33, I36
3. `.claude/skills/hig/SKILL.md` — Apple HIG **facts** (hit targets, Dynamic Type, component names)

Kepi visual law wins when HIG taste conflicts (no dark-first, no Liquid Glass
on consumer web chrome, gold `#f4c95d` brand CTA).

HIG is fact lookup, not aesthetic direction. Grep `.claude/skills/hig/` for
44pt minimums, tab bars, sheets, settings, color, typography.

## Kepi tokens (do not replace from HIG color essays)

- Grouped bg `#F5F5F7` · text `#1D1D1F` · gold CTA `#f4c95d` · system blue `#007AFF`
- Lucide line icons — not SF Symbols in the web app
- Tap targets **48px+** (stricter than HIG 44pt)
- Light default. No navy empty-trip cockpit.

## Discuss before code

If Jeff only asks how it should look: propose, do not edit, until he says build.

## Source

- Kepi playbook: `.cursor/skills/kepi-apple-bot/SKILL.md`
- HIG pack: `Prisma-Labs-Dev/apple-skills` skill `hig` (see `skills-lock.json`)
