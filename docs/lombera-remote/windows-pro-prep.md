# Windows 11 Pro — RDP target prep (Lombera Remote)

Prepare the firm Windows Pro PC as the **upstream** RDP host for Tailscale PAM. The PAM connector authenticates as a dedicated service account; Jeff never types that password.

---

## 1. Install Tailscale on Windows

1. Download from [tailscale.com/download/windows](https://tailscale.com/download/windows).
2. Sign in with the **Lombera-Remote** tailnet.
3. Admin console → **Machines** → select this PC → **Edit route settings** / tags:
   - Add tag: `tag:lombera-rdp-target`
4. Note **Machine name** (MagicDNS), e.g. `lombera-pc.lombera-remote.ts.net` — use short name `lombera-pc` in PAM service config.

**Security:** Do not enable "subnet router" unless you intend to route the whole office LAN through this PC.

---

## 2. Enable Remote Desktop (Pro)

### GUI

1. **Settings** → **System** → **Remote Desktop** → **On**.
2. Confirm "Network Level Authentication" is enabled (default on modern Windows).

### PowerShell (admin) — optional verify

```powershell
# Enable RDP
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server' -Name fDenyTSConnections -Value 0

# Require NLA (recommended)
Set-ItemProperty -Path 'HKLM:\System\CurrentControlSet\Control\Terminal Server\WinStations\RDP-Tcp' -Name UserAuthentication -Value 1

# Confirm
(Get-ItemProperty 'HKLM:\System\CurrentControlSet\Control\Terminal Server').fDenyTSConnections
# 0 = enabled
```

### Firewall

Windows usually opens **Remote Desktop** firewall rule when RDP is enabled. Verify:

```powershell
Get-NetFirewallRule -DisplayGroup "Remote Desktop" | Where-Object Enabled -eq True
```

---

## 3. Create PAM service account (local)

Use a **dedicated** local account — not Jeff's daily user.

```powershell
# Run in elevated PowerShell
$Password = Read-Host "Enter strong password for pam-rdp" -AsSecureString
New-LocalUser -Name "pam-rdp" -Password $Password -FullName "Tailscale PAM RDP" -Description "Connector-only RDP login" -PasswordNeverExpires
Add-LocalGroupMember -Group "Remote Desktop Users" -Member "pam-rdp"
```

Record the password **only** in:

- Tailscale PAM service config (initial test), or
- Connector secret file `from:file:/etc/lombera-remote/pam-rdp.password` (production)

Jeff must **not** save this password in a password manager he uses daily.

### Optional hardening

- Deny `pam-rdp` interactive console logon (RDP only) via Group Policy or `ntrights` if you use AD tooling.
- Do not add `pam-rdp` to Administrators.

---

## 4. Prevent sleep / disconnect

Remote sessions require the PC awake:

1. **Settings** → **System** → **Power** → set sleep to **Never** when plugged in (or firm policy equivalent).
2. If using laptop: prefer desktop mode or docked policy.

---

## 5. Verify from connector host (before PAM service)

On the Linux PAM connector (same LAN):

```bash
# Replace with tailnet IP or hostname
nc -zv lombera-pc 3389
# or
nc -zv 100.x.y.z 3389
```

Expected: `succeeded` or `open`.

If this fails, fix Windows firewall / RDP / routing before creating the PAM service.

---

## 6. Windows Pro session limits

Windows 11 **Pro** allows **one** concurrent interactive remote desktop session (plus console). PAM + Jeff = one RDP session as `pam-rdp`. If someone is logged in locally as the same user, conflicts are rare because PAM uses a separate account.

If the firm later needs multiple simultaneous admins, evaluate Windows Server or additional workstations — out of scope for this one-PC design.

---

## 7. No open-internet RDP

| Do | Don't |
|----|-------|
| RDP reachable on LAN + tailnet from connector | Router port-forward `3389` → PC |
| Tailscale on PC | Expose RDP via DDNS |
| PAM connector as only automated RDP client | Share `pam-rdp` password with humans |

---

## Checklist before Step 5 in RUNBOOK

- [ ] Tailscale online on PC, tagged `tag:lombera-rdp-target`
- [ ] MagicDNS name documented
- [ ] RDP enabled, NLA on
- [ ] `pam-rdp` in Remote Desktop Users
- [ ] Password stored for connector / PAM only
- [ ] `nc -zv` from connector succeeds on 3389
- [ ] PC won't sleep during business hours
