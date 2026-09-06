# Lombera Remote — Tailscale PAM RDP Connect Runbook

**Tailnet:** `Lombera-Remote`  
**Target:** One Windows 11 Pro workstation  
**End state:** Jeff opens Tailscale → Services → **Lombera Office PC** → **Connect** — no Windows password, session appears in PAM Sessions.

> **Apply status:** `BLOCKED_ON_JEFF_TAILSCALE_ADMIN` — all admin-console steps below require Jeff (Owner/Admin on Lombera-Remote).

---

## Prerequisites checklist

| # | Item | Owner |
|---|------|-------|
| 1 | Tailscale PAM enabled on Lombera-Remote (waitlist or Sales if not yet) | Jeff |
| 2 | Windows Pro PC on tailnet with RDP enabled ([windows-pro-prep.md](./windows-pro-prep.md)) | Jeff / onsite |
| 3 | Linux/macOS connector host on **same LAN** as Windows PC, always on | Jeff / onsite |
| 4 | Dedicated local Windows account for PAM (e.g. `.\pam-rdp`) — **not** Jeff's daily login | Jeff |
| 5 | Tailscale client on Jeff's devices (Mac primary) | Jeff |

---

## Apply order (Jeff — admin console)

Do these in sequence. Do **not** paste invite codes or auth keys into chat or git.

### Step 1 — Enable Tailscale PAM

1. Sign in to [Tailscale admin console](https://login.tailscale.com/admin) for **Lombera-Remote**.
2. Open **PAM** → **Enable**.
3. Confirm auto-provisioned artifacts (do not delete):
   - Tag `tag:border0-managed`
   - `autoApprovers` for PAM connectors/services
   - Initial admin PAM grant for `autogroup:admin`
   - Trust credential for PAM OIDC

Source: [Get started with Tailscale PAM](https://tailscale.com/docs/privileged-access-management/get-started)

### Step 2 — Tag firm devices (ACL prep)

In **Access controls** → **Tags**, ensure these exist (add if missing):

| Tag | Owns | Used on |
|-----|------|---------|
| `tag:lombera-admin` | `autogroup:admin` | Jeff's Mac, admin connectors |
| `tag:lombera-pam-connector` | `autogroup:admin` | PAM connector host |
| `tag:lombera-rdp-target` | `autogroup:admin` | Windows Pro PC |

Merge the grant snippets from [acl-policy/hujson-grants.example.json](./acl-policy/hujson-grants.example.json) into your tailnet policy file. See [acl-policy/README.md](./acl-policy/README.md).

**Network posture (recommended):** Windows RDP listens only on tailnet / LAN — **no** router port-forward of `3389` to the internet.

### Step 3 — Install PAM connector (onsite Linux host)

On the always-on Linux machine that can reach the Windows PC on `3389`:

1. Admin console → **Connectors** → **Add connector** → **Linux**.
2. Copy the **install command with invite code** from the console (one-time; keep private).
3. SSH to the Linux host and run the command locally.
4. Verify connector shows **Online** in **Connectors**.
5. Tag the connector device: `tag:lombera-pam-connector`.

Service management on Linux:

```bash
sudo systemctl status tailzero
journalctl -fu tailzero
```

Source: [Install a Tailscale PAM connector](https://tailscale.com/docs/privileged-access-management/connectors/install)

**Docker alternative** (same LAN host):

```bash
# Replace INVITE_CODE from admin console — do not commit
docker run -ti --name tailzero-connector \
  --volume tailzero-volume:/var/lib/tailzero \
  --restart unless-stopped \
  ghcr.io/borderzero/tailzero \
  --border0-invite-code INVITE_CODE
```

### Step 4 — Prepare Windows Pro PC

Complete [windows-pro-prep.md](./windows-pro-prep.md) before creating the PAM service:

- RDP enabled, firewall allows 3389 from LAN/tailnet
- Tailscale installed; device tagged `tag:lombera-rdp-target`
- Local service account `pam-rdp` with password stored for connector only
- Note the PC's **tailnet MagicDNS name** (e.g. `lombera-pc`) or stable **100.x** tailnet IP

### Step 5 — Create RDP PAM service

Admin console → **Services** → **Add service** → **PAM service** → **RDP**:

| Field | Example value | Notes |
|-------|---------------|-------|
| Name | `lombera-office-pc` | Shown in Tailscale client Services list |
| Display name | `Lombera Office PC` | User-facing label |
| Connector | `lombera-pam-connector` | Must be online |
| Upstream hostname | `lombera-pc` or `100.x.y.z` | Tailnet DNS or IP — connector must reach it |
| Port | `3389` | Default RDP |
| Username | `pam-rdp` | Local account (or `DOMAIN\user` if domain-joined) |
| Password | *(see below)* | **Not** Jeff's password |
| Domain | *(blank for local)* | Only if domain account |

**Credential options (pick one):**

**A — Quick start (rotate after test):** Enter password directly in service config. Rotate after [TEST-PLAN.md](./TEST-PLAN.md) passes.

**B — Production (recommended):** Store password on connector host and reference it:

```
from:file:/etc/lombera-remote/pam-rdp.password
```

Create file on connector (root-only):

```bash
sudo install -o root -g root -m 600 /dev/stdin /etc/lombera-remote/pam-rdp.password <<'EOF'
PASTE_GENERATED_PASSWORD_HERE
EOF
```

Source: [Manage secrets](https://tailscale.com/docs/privileged-access-management/how-to/manage-secrets)

### Step 6 — Grant Jeff access (least privilege)

After the service exists, it appears as `svc:lombera-office-pc` in policy.

Add the Jeff-only grant from [acl-policy/hujson-grants.example.json](./acl-policy/hujson-grants.example.json) → `grant-jeff-rdp-connect`.

**Do not** leave the broad `src: ["*"]` RDP grant in production.

### Step 7 — Jeff Connect flow (one button)

**Desktop (preferred — native RDP):**

1. Open **Tailscale** on Mac.
2. Go to **Services** (or **Browse services**).
3. Select **Lombera Office PC**.
4. Click **Connect** → choose **Microsoft Remote Desktop** (or built-in client).
5. When RDP prompts for password: leave **empty** / blank. PAM supplies upstream creds via connector.

**Browser fallback:**

1. Admin console → **Services** → **Lombera Office PC** → **Connect** (top right).
2. Authenticate with Tailscale identity if prompted.
3. If device approval is on, approve the browser device once.

Source: [Access Windows via RDP with Tailscale PAM](https://tailscale.com/docs/privileged-access-management/how-to/access-windows-server-rdp)

### Step 8 — Verify session audit

1. Admin console → **Sessions**.
2. Filter by service `lombera-office-pc` and actor Jeff's email.
3. Confirm: success status, Jeff's Tailscale identity, source device, duration.

Run full checklist: [TEST-PLAN.md](./TEST-PLAN.md) and [AUDIT-CHECKLIST.md](./AUDIT-CHECKLIST.md).

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Service missing in client | PAM enabled? Grant matches Jeff's identity → `svc:lombera-office-pc`? |
| Connect denied | Sessions → denied entry → authorization details / grants evaluated |
| Black screen / auth fail | Connector online? `telnet lombera-pc 3389` from connector host? `pam-rdp` password valid? |
| RDP asks for password | Must be **empty** — if client won't allow blank, use Tailscale browser Connect |
| Browser device blocked | Device approval → approve browser session device |
| Connector offline | `systemctl status tailzero`; `journalctl -fu tailzero` |

---

## Rollback

1. **Services** → edit RDP service → **Remove service**.
2. Remove Jeff-specific grant from ACL (keep deny-by-default).
3. Stop connector: `sudo systemctl stop tailzero`.
4. Optional: disable RDP on Windows if no longer needed.

---

## What we explicitly did NOT build

- No Kepi / custom RDP viewer
- No RemotePC agent
- No public `:3389` exposure
- No second remote-desktop app beyond Tailscale + OS RDP client
