# Lombera Remote — risk notes

## Tailscale PAM is beta

> **Note:** Tailscale PAM is currently in **beta** (docs validated Aug–Sep 2026).

| Risk | Impact | Mitigation |
|------|--------|------------|
| API / UX breaking changes | Connect flow or grants may change | Pin doc dates in RUNBOOK; subscribe to Tailscale changelog |
| Beta SLA | No production SLA | Maintain break-glass (local console, onsite) |
| Feature gaps | RDP session replay may be limited vs SSH DB logs | Rely on Sessions metadata (who/when/device); see session logs docs |
| Waitlist / entitlement | PAM not enabled on tailnet | Join waitlist or contact Tailscale Sales before build |

Sources: [PAM get started](https://tailscale.com/docs/privileged-access-management/get-started), [RDP how-to](https://tailscale.com/docs/privileged-access-management/how-to/access-windows-server-rdp)

---

## Architecture risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Single Windows Pro session | One RDP user at a time for `pam-rdp` | Accept for solo practice; scale later if needed |
| Connector SPOF | Connector down → no remote access | Monitor `tailzero`; redundant connector optional |
| Connector host compromise | Attacker could reach RDP upstream creds | Harden Linux host; minimal packages; patch; file mode 600 secrets |
| `pam-rdp` credential leak | Full desktop access as service account | Rotate password; audit Sessions; not Jeff's daily account |
| Grants additive | "Deny" in one grant doesn't override broad grant | Remove broad `*` grants; periodic ACL review |

---

## What we deliberately avoid

| Anti-pattern | Why |
|--------------|-----|
| Public `:3389` | Ransomware / brute-force exposure |
| RemotePC / Parsec / TeamViewer clone | Second app, duplicate billing, different trust model |
| Homemade viewer in Kepi | Maintenance burden, security liability |
| Jeff typing Windows password | Defeats PAM identity + audit story |
| Auth keys in git/chat | Credential leak |

---

## Residual acceptance (Jeff sign-off)

By enabling Lombera Remote via Tailscale PAM beta, the firm accepts:

1. Dependency on Tailscale + Border0 PAM connector (`tailzero`) availability.
2. Session audit = PAM Sessions metadata; not necessarily full RDP video replay.
3. Admin apply steps require Jeff (`BLOCKED_ON_JEFF_TAILSCALE_ADMIN` for automation).
4. Windows Pro single-session limits for the service account model.

---

## When to revisit

- Tailscale PAM GA announcement → re-read migration notes
- New staff needing remote → new grants, not shared `pam-rdp` password to humans
- Second office PC → second `svc:` + grants, same or additional connector
- Compliance request for session recording → evaluate PAM recording features at that time
