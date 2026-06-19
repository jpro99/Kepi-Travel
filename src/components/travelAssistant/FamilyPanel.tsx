"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";

interface LocationPoint {
  lat: number; lon: number; accuracy?: number;
  updatedAt: string; memberId: string; label?: string;
}
interface FamilyMember {
  id: string; name: string; email: string | null;
  role: "organizer" | "adult" | "teen" | "child";
  color: string; sharingEnabled: boolean;
  visibility: "all-members" | "organizer-only";
  joinedAt: string; imageUrl?: string | null;
}
interface FamilyGroup {
  id: string; name: string; ownerId: string;
  members: FamilyMember[]; inviteCode: string; createdAt: string;
}
interface FamilyPanelProps {
  isPremium: boolean;
  onUpgrade: () => void;
}

const SHARING_PREF_KEY = "kepi:family-sharing-active";

function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d/60)}h ago`;
  return `${Math.floor(d/1440)}d ago`;
}
function isStale(iso: string): boolean { return Date.now() - Date.parse(iso) > 10 * 60_000; }

function QRCode({ url }: { url: string }) {
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=10&data=${encodeURIComponent(url)}`;
  return (
    <div className="flex flex-col items-center gap-2">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={qrUrl} alt="QR Code" width={180} height={180}
        className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white p-2" />
      <p className="text-[10px] text-slate-500 dark:text-slate-400">Scan to join on any device</p>
    </div>
  );
}

export function FamilyPanel({ isPremium, onUpgrade }: FamilyPanelProps) {
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [groupRole, setGroupRole] = useState<"owner" | "member">("owner");
  const [myMemberId, setMyMemberId] = useState<string | null>(null);

  // Add member form
  const [addingMember, setAddingMember] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<"adult" | "teen" | "child">("adult");
  const [sendingInvite, setSendingInvite] = useState(false);

  // Invite
  const [showQR, setShowQR] = useState(false);
  const [showInvitePanel, setShowInvitePanel] = useState(false);

  // Group name
  const [editingGroupName, setEditingGroupName] = useState(false);
  const [groupNameDraft, setGroupNameDraft] = useState("");

  // Join group
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");

  // Create group
  const [creatingGroup, setCreatingGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");

  // ── Location sharing — GPS is managed at page.tsx level, never unmounts ─────
  // FamilyPanel just controls the preference; page.tsx does the actual watching.
  const [sharingLocation, setSharingLocation] = useState(
    typeof window !== "undefined" && localStorage.getItem("kepi:family-sharing-active") === "1"
  );
  const [locationError] = useState<string | null>(null);

  const activeGroup = useMemo(
    () => groups.find(g => g.id === activeGroupId) ?? groups[0] ?? null,
    [groups, activeGroupId]
  );

  const inviteLink = useMemo(
    () => activeGroup
      ? `${typeof window !== "undefined" ? window.location.origin : "https://kepitravel.com"}/join-family?code=${activeGroup.inviteCode}`
      : "",
    [activeGroup]
  );

  // sendLocation moved to page.tsx persistent effect




  const toggleSharing = useCallback(() => {
    if (sharingLocation) {
      setSharingLocation(false);
      window.dispatchEvent(new CustomEvent("kepi:family-stop-sharing"));
      setMessage("Location sharing stopped.");
    } else {
      setSharingLocation(true);
      window.dispatchEvent(new CustomEvent("kepi:family-start-sharing"));
      setMessage(null);
    }
  }, [sharingLocation]);



  // Load groups
  const load = useCallback(async (groupId?: string) => {
    try {
      const url = groupId ? `/api/family?groupId=${groupId}` : "/api/family";
      const res = await fetch(url, { cache: "no-store" });
      const data = await res.json() as {
        group: FamilyGroup; groups?: FamilyGroup[];
        locations: Record<string, LocationPoint>;
        role?: "owner" | "member"; myMemberId?: string;
      };
      if (data.groups) setGroups(data.groups);
      else if (data.group) setGroups([data.group]);
      setLocations(data.locations ?? {});
      setGroupRole(data.role ?? "owner");
      if (data.myMemberId) setMyMemberId(data.myMemberId);
      if (data.group) setActiveGroupId(data.group.id);
    } catch {
      setMessage("Could not load family groups.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    void load();
  }, [isPremium, load]);

  // Listen for join event from page.tsx auto-join
  useEffect(() => {
    if (!isPremium) return;
    const handler = () => { void load(); };
    window.addEventListener("kepi:family-reload", handler);
    return () => window.removeEventListener("kepi:family-reload", handler);
  }, [isPremium, load]);



  // Poll locations every 10s
  useEffect(() => {
    if (!isPremium) return;
    const id = setInterval(() => {
      void fetch("/api/family", { cache: "no-store" })
        .then(r => r.json())
        .then((d: { locations?: Record<string, LocationPoint> }) => { if (d.locations) setLocations(d.locations); })
        .catch(() => null);
    }, 10_000);
    return () => clearInterval(id);
  }, [isPremium]);

  const handleAddMember = useCallback(async () => {
    if (!newName.trim() || !activeGroup) { setMessage("Enter a name."); return; }
    setBusy(true); setSendingInvite(Boolean(newEmail.trim()));
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-member", groupId: activeGroup.id,
          name: newName.trim(), email: newEmail.trim() || null, role: newRole,
          inviteLink: newEmail.trim() ? inviteLink : undefined,
          senderName: activeGroup.members[0]?.name ?? "Your organizer",
        }),
      });
      const data = await res.json() as { group: FamilyGroup; groups: FamilyGroup[]; emailSent?: boolean };
      if (data.groups) setGroups(data.groups);
      else if (data.group) setGroups(prev => prev.map(g => g.id === data.group.id ? data.group : g));
      setNewName(""); setNewEmail(""); setAddingMember(false);
      const emailMsg = data.emailSent
        ? ` Invite sent to ${newEmail} — they'll join automatically when they tap the link.`
        : newEmail ? " (Email not configured — share the link below.)" : "";
      setMessage(`✅ ${newName} added.${emailMsg}`);
    } catch { setMessage("Failed to add member."); }
    finally { setBusy(false); setSendingInvite(false); }
  }, [newName, newEmail, newRole, activeGroup, inviteLink]);

  const handleSendInviteEmail = useCallback(async (email: string, name: string) => {
    if (!activeGroup) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send-invite", groupId: activeGroup.id, email, name, inviteLink, senderName: activeGroup.members[0]?.name ?? "Your organizer" }),
      });
      const data = await res.json() as { emailSent?: boolean };
      setMessage(data.emailSent ? `✅ Invite sent to ${email}` : "Couldn't send email — share the link manually.");
    } catch { setMessage("Failed."); }
    finally { setBusy(false); }
  }, [activeGroup, inviteLink]);

  const handleRemoveMember = useCallback(async (memberId: string, name: string) => {
    if (!activeGroup || !confirm(`Remove ${name}?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-member", groupId: activeGroup.id, memberId }),
      });
      const data = await res.json() as { group: FamilyGroup; groups: FamilyGroup[] };
      if (data.groups) setGroups(data.groups);
      setMessage(`${name} removed.`);
    } catch { setMessage("Failed."); }
    finally { setBusy(false); }
  }, [activeGroup]);

  const handleUpdateGroupName = useCallback(async () => {
    if (!activeGroup || !groupNameDraft.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "update-group", groupId: activeGroup.id, groupName: groupNameDraft.trim() }),
      });
      const data = await res.json() as { groups: FamilyGroup[] };
      if (data.groups) setGroups(data.groups);
      setEditingGroupName(false);
    } catch { setMessage("Failed."); }
    finally { setBusy(false); }
  }, [activeGroup, groupNameDraft]);

  const handleCreateGroup = useCallback(async () => {
    if (!newGroupName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create-group", groupName: newGroupName.trim() }),
      });
      const data = await res.json() as { group: FamilyGroup; groups: FamilyGroup[] };
      if (data.groups) setGroups(data.groups);
      if (data.group) setActiveGroupId(data.group.id);
      setCreatingGroup(false); setNewGroupName("");
    } catch { setMessage("Failed."); }
    finally { setBusy(false); }
  }, [newGroupName]);

  const handleJoinGroup = useCallback(async () => {
    if (!joinCode.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "join-group", inviteCode: joinCode.trim().toUpperCase(), name: joinName.trim() || "Family Member" }),
      });
      const data = await res.json() as { ok?: boolean; group?: FamilyGroup; error?: string };
      if (!res.ok || !data.ok) { setMessage(data.error ?? "Invalid code."); setBusy(false); return; }
      if (data.group) setGroups([data.group]);
      setGroupRole("member"); setJoiningGroup(false); setJoinCode(""); setJoinName("");
      setMessage("✅ Joined! Starting location sharing automatically…");
      setSharingLocation(true);
      localStorage.setItem(SHARING_PREF_KEY, "1");
      window.dispatchEvent(new CustomEvent("kepi:family-start-sharing"));
    } catch { setMessage("Failed to join."); }
    finally { setBusy(false); }
  }, [joinCode, joinName]);

  const handleLeaveGroup = useCallback(async () => {
    if (!confirm("Leave this group?")) return;
    setBusy(true);
    try {
      await fetch("/api/family", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "leave-group" }) });
      setGroupRole("owner");
      setSharingLocation(false);
      localStorage.removeItem(SHARING_PREF_KEY);
      window.dispatchEvent(new CustomEvent("kepi:family-stop-sharing"));
      void load();
    } catch { setMessage("Failed."); }
    finally { setBusy(false); }
  }, [load]);

  // ── Paywall ───────────────────────────────────────────────────────────────
  if (!isPremium) {
    return (
      <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👨‍👩‍👧</span>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-white">Family Groups</h2>
            <span className="text-[10px] font-bold uppercase tracking-wider text-[#007AFF]">Pro feature</span>
          </div>
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
          See where everyone is in real time. Share locations and keep your whole group on the same page.
        </p>
        <button type="button" onClick={onUpgrade} className="w-full rounded-2xl bg-[#007AFF] py-3 text-sm font-bold text-white">
          Upgrade to Pro
        </button>
      </div>
    );
  }

  if (loading) return (
    <div className="rounded-3xl bg-white dark:bg-slate-900 ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-5">
      <div className="h-4 w-32 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
    </div>
  );

  // Count live members
  const liveCount = Object.values(locations).filter(l => !isStale(l.updatedAt)).length;
  const totalMembers = activeGroup?.members.length ?? 0;

  return (
    <div className="space-y-3">
      {/* ── My sharing status — always visible at top ── */}
      <div className={`rounded-3xl shadow-sm ring-1 overflow-hidden transition-all ${
        sharingLocation
          ? "bg-emerald-500 ring-emerald-400/50"
          : "bg-white dark:bg-slate-900 ring-black/[0.06] dark:ring-white/[0.08]"
      }`}>
        <div className="flex items-center justify-between px-5 py-4 gap-3">
          <div>
            <p className={`font-bold text-base ${sharingLocation ? "text-white" : "text-slate-900 dark:text-white"}`}>
              {sharingLocation ? "🟢 Sharing your location" : "📍 Share your location"}
            </p>
            <p className={`text-xs mt-0.5 ${sharingLocation ? "text-emerald-100" : "text-slate-500 dark:text-slate-400"}`}>
              {sharingLocation
                ? lastSentAt
                  ? `Last sent ${timeAgo(lastSentAt)} · auto-resumes when you return`
                  : "Starting GPS…"
                : "Tap to share — stays on when you navigate away"}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSharing}
            className={`shrink-0 rounded-2xl px-4 py-2.5 text-sm font-bold transition ${
              sharingLocation
                ? "bg-white/20 text-white hover:bg-white/30"
                : "bg-[#007AFF] text-white"
            }`}
          >
            {sharingLocation ? "Stop" : "Start sharing"}
          </button>
        </div>
        {locationError && (
          <div className="mx-4 mb-4 rounded-2xl bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 px-3 py-2">
            <p className="text-xs text-amber-700 dark:text-amber-300 font-medium">⚠️ {locationError}</p>
            {locationError.includes("permission") && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                iPhone: Settings → Privacy &amp; Security → Location Services → Safari → While Using App
              </p>
            )}
            {!locationError.includes("permission") && (
              <p className="text-[10px] text-amber-600 dark:text-amber-400 mt-0.5">
                Sharing preference saved — will resume automatically when GPS is available.
              </p>
            )}
          </div>
        )}
      </div>

      {/* ── Group panel ── */}
      {groups.length > 0 && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] overflow-hidden">
          {/* Group switcher + name */}
          <div className="flex items-center gap-2 px-5 pt-4 pb-3">
            <div className="flex-1 min-w-0 overflow-x-auto flex gap-1.5">
              {groups.map(g => (
                <button key={g.id} type="button"
                  onClick={() => { setActiveGroupId(g.id); void load(g.id); }}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold transition ${
                    g.id === (activeGroup?.id) ? "bg-[#007AFF] text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
                  }`}>
                  {g.name}
                </button>
              ))}
              <button type="button" onClick={() => setCreatingGroup(true)}
                className="shrink-0 rounded-full px-3 py-1 text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500">
                + New
              </button>
            </div>
            {groupRole === "owner" && (
              <button type="button" onClick={() => { setGroupNameDraft(activeGroup?.name ?? ""); setEditingGroupName(true); }}
                className="shrink-0 text-slate-400 hover:text-[#007AFF] text-sm">✏️</button>
            )}
          </div>

          {/* Inline group rename */}
          {editingGroupName && (
            <div className="px-5 pb-3 flex gap-2">
              <input autoFocus value={groupNameDraft} onChange={e => setGroupNameDraft(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void handleUpdateGroupName(); if (e.key === "Escape") setEditingGroupName(false); }}
                className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-sm font-bold" />
              <button type="button" onClick={() => void handleUpdateGroupName()} className="rounded-xl bg-[#007AFF] px-3 py-1.5 text-xs font-bold text-white">Save</button>
              <button type="button" onClick={() => setEditingGroupName(false)} className="text-slate-400 px-1">✕</button>
            </div>
          )}

          {/* Create group */}
          {creatingGroup && (
            <div className="px-5 pb-4 flex gap-2">
              <input autoFocus value={newGroupName} onChange={e => setNewGroupName(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") void handleCreateGroup(); }}
                placeholder="Group name (e.g. Japan Trip)" className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-sm" />
              <button type="button" onClick={() => void handleCreateGroup()} disabled={!newGroupName.trim()} className="rounded-xl bg-[#007AFF] px-4 py-2 text-sm font-bold text-white disabled:opacity-40">Create</button>
              <button type="button" onClick={() => setCreatingGroup(false)} className="rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm text-slate-500">✕</button>
            </div>
          )}

          {/* Live count header */}
          {totalMembers > 1 && (
            <div className="px-5 pb-2">
              <p className="text-xs text-slate-400 dark:text-slate-500">
                {liveCount} of {totalMembers} sharing live · updates every 10s
              </p>
            </div>
          )}

          {/* Members */}
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {(activeGroup?.members ?? []).map(member => {
              const loc = locations[member.id];
              const live = loc && !isStale(loc.updatedAt);
              const isMe = member.id === myMemberId;
              return (
                <div key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <div className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center text-sm font-bold text-white shadow-sm"
                    style={{ background: member.color }}>
                    {member.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-white">
                      {member.name}
                    </p>
                    <p className="text-xs mt-0.5 flex items-center gap-1.5">
                      <span className={`inline-block h-2 w-2 rounded-full ${!loc ? "bg-slate-200 dark:bg-slate-700" : live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                      <span className={!loc ? "text-slate-400" : live ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400"}>
                        {!loc ? "Not sharing yet" : live ? `Live · ${timeAgo(loc.updatedAt)}` : `Stale · ${timeAgo(loc.updatedAt)}`}
                      </span>
                    </p>
                    {member.email && !isMe && !loc && groupRole === "owner" && (
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">{member.email}</p>
                    )}
                  </div>
                  {/* Resend invite if no location and has email */}
                  {!isMe && member.email && !loc && groupRole === "owner" && (
                    <button type="button" onClick={() => void handleSendInviteEmail(member.email!, member.name)} disabled={busy}
                      className="shrink-0 rounded-lg bg-[#007AFF]/10 dark:bg-[#0A84FF]/20 px-2 py-1 text-[10px] font-bold text-[#007AFF] dark:text-[#0A84FF]">
                      Resend
                    </button>
                  )}
                  {!isMe && groupRole === "owner" && (
                    <button type="button" onClick={() => void handleRemoveMember(member.id, member.name)} disabled={busy}
                      className="shrink-0 text-slate-300 dark:text-slate-600 hover:text-red-400 text-lg px-1 leading-none">×</button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Invite section (owner only) ── */}
      {activeGroup && groupRole === "owner" && (
        <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] overflow-hidden">
          <button type="button" onClick={() => setShowInvitePanel(v => !v)}
            className="w-full flex items-center justify-between px-5 py-4 text-left">
            <div>
              <p className="font-semibold text-sm text-slate-900 dark:text-white">Invite to {activeGroup.name}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Add by email · share link · QR code · they join automatically
              </p>
            </div>
            <span className="text-slate-400 text-lg">{showInvitePanel ? "▲" : "▼"}</span>
          </button>

          {showInvitePanel && (
            <div className="border-t border-slate-100 dark:border-slate-800 px-5 pb-5 space-y-4">
              {/* Add person */}
              {addingMember ? (
                <div className="space-y-2 pt-4">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Add person</p>
                  <input type="text" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleAddMember(); }}
                    placeholder="Name (e.g. Stephanie)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm" />
                  <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") void handleAddMember(); }}
                    placeholder="Email — invite sent automatically"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm" />
                  <div className="flex gap-2">
                    {(["adult","teen","child"] as const).map(r => (
                      <button key={r} type="button" onClick={() => setNewRole(r)}
                        className={`flex-1 rounded-xl py-2 text-xs font-semibold capitalize transition ${newRole === r ? "bg-[#007AFF] text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300"}`}>
                        {r}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => void handleAddMember()} disabled={busy || !newName.trim()}
                      className="flex-1 rounded-xl bg-[#007AFF] py-2.5 text-sm font-bold text-white disabled:opacity-40">
                      {sendingInvite ? "Sending invite…" : busy ? "Adding…" : newEmail ? "Add & send invite" : "Add"}
                    </button>
                    <button type="button" onClick={() => { setAddingMember(false); setNewName(""); setNewEmail(""); }}
                      className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-500">Cancel</button>
                  </div>
                  {newEmail && (
                    <p className="text-[11px] text-slate-400">
                      They&apos;ll receive an email with a link. When they tap it, they join automatically and location sharing starts immediately.
                    </p>
                  )}
                </div>
              ) : (
                <button type="button" onClick={() => setAddingMember(true)}
                  className="w-full rounded-2xl border border-dashed border-[#007AFF]/40 py-3 mt-4 text-sm font-semibold text-[#007AFF] hover:bg-[#007AFF]/5 transition">
                  + Add family member
                </button>
              )}

              {/* Share link */}
              <div className="space-y-2">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Or share a link</p>
                <div className="flex gap-2">
                  <button type="button"
                    onClick={() => void navigator.clipboard.writeText(inviteLink).then(() => setMessage("✅ Link copied!"))}
                    className="flex-1 rounded-xl bg-slate-100 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                    📋 Copy invite link
                  </button>
                  {"share" in navigator && (
                    <button type="button"
                      onClick={() => void navigator.share({ title: `Join ${activeGroup.name}`, url: inviteLink })}
                      className="rounded-xl bg-slate-100 dark:bg-slate-800 px-4 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                      📤 Share
                    </button>
                  )}
                </div>
                <p className="text-[10px] font-mono text-center text-slate-400">
                  Code: <span className="font-bold">{activeGroup.inviteCode}</span>
                </p>
              </div>

              {/* QR */}
              <button type="button" onClick={() => setShowQR(v => !v)}
                className="w-full text-center text-xs font-semibold text-[#007AFF] py-1">
                {showQR ? "Hide QR code" : "Show QR code — scan to join"}
              </button>
              {showQR && <QRCode url={inviteLink} />}
            </div>
          )}
        </div>
      )}

      {/* ── Leave / Join another group ── */}
      {groupRole === "member" ? (
        <button type="button" onClick={() => void handleLeaveGroup()} disabled={busy}
          className="w-full rounded-2xl border border-dashed border-red-200 dark:border-red-700 py-3 text-sm font-semibold text-red-500">
          Leave this group
        </button>
      ) : (
        joiningGroup ? (
          <div className="rounded-3xl bg-white dark:bg-slate-900 shadow-sm ring-1 ring-black/[0.06] dark:ring-white/[0.08] p-5 space-y-3">
            <p className="font-semibold text-sm text-slate-900 dark:text-white">Join a group by code</p>
            <p className="text-xs text-slate-500">Or just tap the invite link from your organizer — it joins automatically.</p>
            <input type="text" value={joinName} onChange={e => setJoinName(e.target.value)} placeholder="Your name"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm" />
            <input type="text" value={joinCode} onChange={e => setJoinCode(e.target.value.toUpperCase())}
              placeholder="Invite code (e.g. A1B2C3D4)" autoCapitalize="characters" autoCorrect="off" spellCheck={false}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2.5 text-sm font-mono uppercase tracking-widest" />
            <div className="flex gap-2">
              <button type="button" onClick={() => void handleJoinGroup()} disabled={busy || !joinCode.trim()}
                className="flex-1 rounded-xl bg-[#007AFF] py-2.5 text-sm font-bold text-white disabled:opacity-40">
                {busy ? "Joining…" : "Join & start sharing"}
              </button>
              <button type="button" onClick={() => setJoiningGroup(false)}
                className="rounded-xl border border-slate-200 dark:border-slate-700 px-4 py-2.5 text-sm text-slate-500">Cancel</button>
            </div>
          </div>
        ) : (
          <button type="button" onClick={() => setJoiningGroup(true)}
            className="w-full rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 py-3 text-sm font-semibold text-slate-400 hover:text-[#007AFF] hover:border-[#007AFF]/40 transition">
            Join someone else&apos;s group by code
          </button>
        )
      )}

      {message && (
        <p className={`text-xs px-1 ${message.startsWith("✅") || message.startsWith("🟢") ? "text-emerald-700 dark:text-emerald-300" : "text-red-600 dark:text-red-400"}`}>
          {message}
        </p>
      )}
    </div>
  );
}
