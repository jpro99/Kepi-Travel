# ACL / grant policy — Lombera-Remote

Copy-paste fragments for the **Lombera-Remote** tailnet policy file (HuJSON). Merge with your existing ACL — do not replace wholesale.

**Apply:** `BLOCKED_ON_JEFF_TAILSCALE_ADMIN` — Jeff edits in **Access controls** → JSON/HuJSON editor.

---

## Tags to add

```json
"tagOwners": {
  "tag:lombera-admin": ["autogroup:admin"],
  "tag:lombera-pam-connector": ["autogroup:admin"],
  "tag:lombera-rdp-target": ["autogroup:admin"]
}
```

PAM auto-tags (`tag:border0-managed`) are created when PAM is enabled — **do not remove**.

---

## Device / connector ACL (tailnet connectivity)

Allow connector to reach Windows target on tailnet; restrict who can SSH to connector admin port if you enable built-in connector SSH.

```json
"acls": [
  {
    "action": "accept",
    "src": ["tag:lombera-pam-connector"],
    "dst": ["tag:lombera-rdp-target:3389"]
  },
  {
    "action": "accept",
    "src": ["tag:lombera-admin"],
    "dst": ["tag:lombera-pam-connector:22"]
  }
]
```

Adjust ports if you change RDP or disable connector SSH.

---

## PAM grants

See [hujson-grants.example.json](./hujson-grants.example.json) for full `grants` array entries:

| Grant ID | Purpose |
|----------|---------|
| `grant-jeff-rdp-connect` | Jeff → `svc:lombera-office-pc` with `rdp: {}` |
| `grant-admin-pam-all` | Optional break-glass — admins all PAM RDP (tighten in prod) |
| `grant-deny-example` | Comment-only pattern for revoking access |

### Jeff-only production grant (recommended)

```json
{
  "src": ["jeff@lomberalaw.com"],
  "dst": ["svc:lombera-office-pc"],
  "ip": ["*"],
  "app": {
    "tailscale.com/cap/pam": [
      {
        "version": "v1",
        "permissions": {
          "rdp": {}
        }
      }
    ]
  }
}
```

Replace email with Jeff's exact Tailscale login. Alternatively use `group:lombera-partners` if you create a Tailscale group.

### Service name ↔ selector

The `dst` selector `svc:lombera-office-pc` must match the **service name** (slug) created in admin console Step 5, not necessarily the display name.

---

## Grants are additive (important)

If a broad grant like `src: ["*"]` with `rdp: {}` remains in policy, **restricting** another grant does not revoke access. Review **all** matching grants when locking down.

Source: [Control access to PAM services](https://tailscale.com/docs/privileged-access-management/how-to/control-access)

---

## Post-merge validation

1. **Access controls** → save policy.
2. **Services** → confirm `lombera-office-pc` listed.
3. Jeff's client → **Services** → should see **Lombera Office PC** only if grant matches.
4. Denied test: remove grant temporarily → Connect should fail with session log **denied**.
