# Lombera Remote — acceptance test plan

**Goal:** Jeff hits **Connect** once; lands on Windows desktop; **no Windows password typed**; PAM **Sessions** shows his Tailscale identity.

**Prerequisites:** [RUNBOOK.md](./RUNBOOK.md) Steps 1–6 complete.  
**Apply:** `BLOCKED_ON_JEFF_TAILSCALE_ADMIN` until Jeff finishes admin steps.

---

## Test environment

| Component | Expected state |
|-----------|----------------|
| Tailnet | Lombera-Remote |
| PAM | Enabled |
| Connector | Online (`tag:lombera-pam-connector`) |
| Windows PC | RDP on, Tailscale on, `pam-rdp` account |
| PAM service | `lombera-office-pc` / display **Lombera Office PC** |
| Grant | Jeff email → `svc:lombera-office-pc` with `rdp: {}` |
| Client | Tailscale macOS (primary) |

---

## T1 — Service discovery

| Step | Action | Pass criteria |
|------|--------|---------------|
| T1.1 | Open Tailscale on Mac | Signed in to Lombera-Remote |
| T1.2 | Navigate to **Services** | **Lombera Office PC** visible |
| T1.3 | Confirm no second remote app required | Only Tailscale + system RDP client |

**Fail:** Service missing → check grant `src` email, service slug, PAM enabled.

---

## T2 — One-button Connect (native RDP)

| Step | Action | Pass criteria |
|------|--------|---------------|
| T2.1 | Services → **Lombera Office PC** → **Connect** | RDP client launches |
| T2.2 | Password prompt | Leave **blank** / empty |
| T2.3 | Session establishes | Windows desktop visible (logged in as `pam-rdp` or equivalent) |
| T2.4 | Jeff did not type Windows password | ✓ subjective + no credential manager autofill for `pam-rdp` |

**Fail:** Auth error → verify connector logs, `pam-rdp` password, `nc -zv` from connector.

---

## T3 — Browser Connect (fallback)

| Step | Action | Pass criteria |
|------|--------|---------------|
| T3.1 | Admin console → Services → **Lombera Office PC** → **Connect** | Browser RDP opens |
| T3.2 | Tailscale identity prompt | Authenticate as Jeff |
| T3.3 | Desktop loads | Same as T2.3 |

**Fail:** Device approval → approve browser device in **Machines**.

---

## T4 — Session audit

| Step | Action | Pass criteria |
|------|--------|---------------|
| T4.1 | Admin → **Sessions** | New row for RDP service |
| T4.2 | Open session detail | Actor = Jeff's Tailscale identity (email) |
| T4.3 | Fields present | Source device, source IP, start time, duration, **success** |
| T4.4 | Authorization | Grant `grant-jeff-rdp-connect` (or matching) listed as allowed |

**Fail:** No row → connection may not have used PAM path; check client used Services Connect not raw RDP to IP.

---

## T5 — Deny path (negative test)

| Step | Action | Pass criteria |
|------|--------|---------------|
| T5.1 | Temporarily remove Jeff grant from ACL | Save policy |
| T5.2 | Jeff attempts Connect | **Denied** / cannot connect |
| T5.3 | Sessions | Denied session with authorization failure |
| T5.4 | Restore Jeff grant | T2 passes again |

---

## T6 — No open-internet RDP

| Step | Action | Pass criteria |
|------|--------|---------------|
| T6.1 | From non-tailnet network, scan public IP for 3389 | **Closed** / no forward |
| T6.2 | Direct RDP to public IP without Tailscale | **Fails** |

---

## T7 — Credential isolation

| Step | Action | Pass criteria |
|------|--------|---------------|
| T7.1 | Jeff does not know `pam-rdp` password | ✓ |
| T7.2 | Password only on connector file or PAM service secret ref | ✓ |
| T7.3 | No auth keys in git / chat | ✓ repo scan |

---

## Sign-off

| Field | Value |
|-------|-------|
| Tester | Jeff |
| Date | |
| Tailscale session ID (from T4) | |
| Result | PASS / FAIL |
| Notes | |

---

## Commands (connector host — optional smoke)

```bash
sudo systemctl status tailzero
journalctl -u tailzero --since "10 min ago" --no-pager
nc -zv lombera-pc 3389
```
