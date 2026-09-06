# Lombera Remote — Tailscale PAM RDP Connect

Firm remote access for **Lombera-Remote** tailnet: one-button Connect via Tailscale PAM, identity-based grants, connector-held Windows credentials, and session audit.

## What this is

| In scope | Out of scope |
|----------|--------------|
| Tailscale client → **Services** → **Connect** (native RDP or browser) | RemotePC-style third-party viewer |
| RDP only over tailnet + PAM proxy (no public `:3389`) | Open-internet RDP / port forwarding |
| Tailscale identity in session logs | Jeff typing Windows password at connect time |
| Connector holds upstream creds (or `from:` secret refs) | Homemade RDP viewer / custom app |

## Architecture (one Windows Pro PC)

```
Jeff (Mac/PC/iPad)
  │  Tailscale identity + PAM grant
  ▼
Tailscale client → Services → "Lombera Office PC" → Connect
  │  (empty RDP password — PAM injects upstream creds)
  ▼
Tailscale PAM connector (Linux/macOS, same LAN as PC)
  │  RDP :3389 on tailnet IP or LAN IP
  ▼
Windows 11 Pro workstation (RDP host, Tailscale node tagged)
```

**Connector requirement:** PAM connectors run **Linux or macOS only** ([install docs](https://tailscale.com/docs/privileged-access-management/connectors/install)). For a single Windows Pro box, place a small always-on Linux peer on the same network (NUC, Pi, Docker host, or firm file-server VM).

## Deliverables in this folder

| File | Purpose |
|------|---------|
| [RUNBOOK.md](./RUNBOOK.md) | Step-by-step enable PAM, connector, RDP service, grants |
| [windows-pro-prep.md](./windows-pro-prep.md) | Windows Pro RDP + Tailscale prep |
| [acl-policy/](./acl-policy/) | Copy-paste HuJSON grant snippets |
| [TEST-PLAN.md](./TEST-PLAN.md) | Jeff acceptance test (one-tap, no password, audit row) |
| [AUDIT-CHECKLIST.md](./AUDIT-CHECKLIST.md) | Monthly/quarterly review checklist |
| [RISK-NOTES.md](./RISK-NOTES.md) | PAM beta, blast radius, mitigations |

## Apply status

```
BLOCKED_ON_JEFF_TAILSCALE_ADMIN
```

This cloud agent **cannot** log into the Lombera-Remote Tailscale admin console. Jeff (Owner/Admin) applies steps in [RUNBOOK.md](./RUNBOOK.md) § Apply order. No auth keys or invite codes are stored in this repo.

## Official references

- [Access Windows via RDP with Tailscale PAM](https://tailscale.com/docs/privileged-access-management/how-to/access-windows-server-rdp) (validated 2026-08-17)
- [Get started with Tailscale PAM](https://tailscale.com/docs/privileged-access-management/get-started)
- [Control access to PAM services (grants)](https://tailscale.com/docs/privileged-access-management/how-to/control-access)
- [PAM session logs](https://tailscale.com/docs/privileged-access-management/session-logs)
- [Manage secrets (`from:` references)](https://tailscale.com/docs/privileged-access-management/how-to/manage-secrets)
