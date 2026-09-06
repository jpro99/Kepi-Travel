# Lombera Remote — audit checklist

Use after initial [TEST-PLAN.md](./TEST-PLAN.md) pass, then monthly (or after any ACL/connector change).

---

## Identity & access

- [ ] Only intended users in PAM grants (`src` matches current firm roster)
- [ ] No `src: ["*"]` broad RDP grant in production policy
- [ ] Jeff grant uses exact Tailscale login email or controlled group
- [ ] Removed users: grant revoked **and** Tailscale machine removed/suspended
- [ ] `pam-rdp` password rotated on schedule (e.g. quarterly) and updated in secret ref

---

## PAM platform

- [ ] Tailscale PAM still enabled; no accidental disable during ACL edits
- [ ] `tag:border0-managed` and trust credential intact (post-PAM-enable artifacts)
- [ ] Connector **Online** in admin console
- [ ] `tailzero` service enabled on boot (`systemctl is-enabled tailzero`)
- [ ] Connector OS patches current

---

## Windows target

- [ ] RDP still enabled; NLA on
- [ ] No router port-forward 3389
- [ ] Windows + Tailscale updates applied
- [ ] `pam-rdp` not in Administrators group
- [ ] Sleep policy still prevents offline PC during business hours

---

## Session logs (sample last 30 days)

Admin → **Sessions** → filter `lombera-office-pc`:

- [ ] Every connection has identifiable **actor** (Tailscale identity)
- [ ] No unexplained **denied** spikes
- [ ] No sessions from unknown devices
- [ ] Session durations reasonable for firm usage
- [ ] Export or screenshot one session detail for records (optional)

---

## Secrets

- [ ] Upstream password not stored in plaintext in chat/email
- [ ] If using `from:file:` — connector file mode `600`, root-owned
- [ ] If using AWS/Keeper refs — IAM/permissions least-privilege
- [ ] PAM service config reviewed: no accidental password in display fields

---

## Network

- [ ] ACL: connector → target `:3389` only (no overly broad `*` dst)
- [ ] Windows firewall: Remote Desktop rule enabled
- [ ] Tailscale ACL denies unrelated tags from RDP target ports

---

## Incident readiness

- [ ] Rollback steps in [RUNBOOK.md](./RUNBOOK.md) § Rollback understood
- [ ] Connector logs accessible: `journalctl -fu tailzero`
- [ ] Break-glass: local console or onsite access if PAM/Tailscale outage
- [ ] [RISK-NOTES.md](./RISK-NOTES.md) reviewed — PAM beta acceptance documented

---

## Review log

| Date | Reviewer | Findings | Actions |
|------|----------|----------|---------|
| | Jeff | | |
