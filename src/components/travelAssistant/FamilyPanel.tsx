"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { FamilyMap } from "@/components/travelAssistant/FamilyMap";

interface LocationPoint {
  lat: number;
  lon: number;
  accuracy?: number;
  updatedAt: string;
  memberId: string;
  label?: string;
}

interface FamilyMember {
  id: string;
  name: string;
  email: string | null;
  role: "organizer" | "adult" | "teen" | "child";
  color: string;
  sharingEnabled: boolean;
  visibility: "all-members" | "organizer-only";
  joinedAt: string;
}

interface FamilyGroup {
  id: string;
  name: string;
  ownerId: string;
  members: FamilyMember[];
  inviteCode: string;
  createdAt: string;
}

interface FamilyPanelProps {
  isPremium: boolean;
  onUpgrade: () => void;
  maptilerKey?: string;
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - Date.parse(iso);
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

function isStale(iso: string): boolean {
  return Date.now() - Date.parse(iso) > 10 * 60_000;
}

export function FamilyPanel({ isPremium, onUpgrade, maptilerKey }: FamilyPanelProps) {
  const [group, setGroup] = useState<FamilyGroup | null>(null);
  const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [addingMember, setAddingMember] = useState(false);
  const [newMemberName, setNewMemberName] = useState("");
  const [newMemberEmail, setNewMemberEmail] = useState("");
  const [newMemberRole, setNewMemberRole] = useState<"adult" | "teen" | "child">("adult");
  const [sharingLocation, setSharingLocation] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [groupRole, setGroupRole] = useState<"owner" | "member" | null>(null);
  const [hasGroup, setHasGroup] = useState(false);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [showMap, setShowMap] = useState(true);
  const [mapFullscreen, setMapFullscreen] = useState(false);
  const [joiningGroup, setJoiningGroup] = useState(false);
  const [joinCode, setJoinCode] = useState("");
  const [joinName, setJoinName] = useState("");
  const [joinBusy, setJoinBusy] = useState(false);
  const watchIdRef = useRef<number | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/family", { cache: "no-store" });
      const data = await res.json() as { group: FamilyGroup; locations: Record<string, LocationPoint>; role?: "owner" | "member" };
      setGroup(data.group);
      setLocations(data.locations ?? {});
      setGroupRole(data.role ?? "owner");
      setHasGroup(true);
    } catch {
      setMessage("Could not load family group.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPremium) { setLoading(false); return; }
    void load();
  }, [isPremium, load]);

  const handleJoinGroup = useCallback(async () => {
    if (!joinCode.trim()) { setMessage("Enter the invite code from the group organizer."); return; }
    setJoinBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "join-group",
          inviteCode: joinCode.trim().toUpperCase(),
          name: joinName.trim() || "Family Member",
        }),
      });
      const data = await res.json() as { ok?: boolean; group?: FamilyGroup; error?: string; joined?: boolean; alreadyMember?: boolean };
      if (!res.ok || !data.ok) {
        setMessage(data.error ?? "Invalid invite code.");
        setJoinBusy(false);
        return;
      }
      if (data.group) setGroup(data.group);
      setGroupRole("member");
      setJoiningGroup(false);
      setJoinCode("");
      setMessage(data.alreadyMember ? "You're already in this group." : "✅ Joined the group! You can now share your location.");
      await load();
    } catch {
      setMessage("Failed to join group.");
    } finally {
      setJoinBusy(false);
    }
  }, [joinCode, joinName, load]);

  const handleLeaveGroup = useCallback(async () => {
    if (!confirm("Leave this family group?")) return;
    setBusy(true);
    try {
      await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "leave-group" }),
      });
      setGroupRole("owner");
      setGroup(null);
      setMessage("You've left the group.");
      await load();
    } catch {
      setMessage("Failed to leave group.");
    } finally {
      setBusy(false);
    }
  }, [load]);

  const shareLocation = useCallback(async () => {
    if (!navigator.geolocation) {
      setMessage("Geolocation not available on this device.");
      return;
    }
    setSharingLocation(true);
    setMessage("Getting your location...");
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          await fetch("/api/family", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "update-location",
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            }),
          });
          setMessage("✅ Location shared with your family group.");
          await load();
        } catch {
          setMessage("Failed to share location.");
        } finally {
          setSharingLocation(false);
        }
      },
      () => {
        setMessage("Location permission denied. Enable in device settings.");
        setSharingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10_000 }
    );
  }, [load]);

  const handleAddMember = useCallback(async () => {
    if (!newMemberName.trim()) { setMessage("Enter a name."); return; }
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "add-member",
          name: newMemberName.trim(),
          email: newMemberEmail.trim() || null,
          role: newMemberRole,
        }),
      });
      const data = await res.json() as { group: FamilyGroup };
      setGroup(data.group);
      setNewMemberName("");
      setNewMemberEmail("");
      setAddingMember(false);
      setMessage(`✅ ${newMemberName} added to your group.`);
    } catch {
      setMessage("Failed to add member.");
    } finally {
      setBusy(false);
    }
  }, [newMemberName, newMemberEmail, newMemberRole]);

  const handleRemoveMember = useCallback(async (memberId: string, name: string) => {
    if (!confirm(`Remove ${name} from your family group?`)) return;
    setBusy(true);
    try {
      const res = await fetch("/api/family", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove-member", memberId }),
      });
      const data = await res.json() as { group: FamilyGroup };
      setGroup(data.group);
      setMessage(`${name} removed.`);
    } catch {
      setMessage("Failed to remove member.");
    } finally {
      setBusy(false);
    }
  }, []);

  const handleToggleSharing = useCallback(async (memberId: string, current: boolean) => {
    const res = await fetch("/api/family", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "update-member", memberId, sharingEnabled: !current }),
    });
    const data = await res.json() as { group: FamilyGroup };
    setGroup(data.group);
  }, []);

  const copyInviteCode = useCallback(async () => {
    if (!group?.inviteCode) return;
    await navigator.clipboard.writeText(group.inviteCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [group]);

  // Premium gate — only block if user has no group. Members of invited groups can always see.
  if (!isPremium && !hasGroup) {
    return (
      <article className="rounded-2xl border border-sky-200 bg-gradient-to-br from-sky-50 to-white p-5 shadow-sm dark:border-sky-500/30 dark:from-sky-500/10 dark:to-slate-900">
        <div className="flex items-center gap-3">
          <span className="text-2xl">👨‍👩‍👧</span>
          <div>
            <h2 className="font-semibold">Family Tracker</h2>
            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">Pro</span>
          </div>
        </div>
        <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">
          See where every family member is in real time during your trip. Share locations, assign roles, and keep everyone on the same timeline — like Life360, built into your trip.
        </p>
        <ul className="mt-3 space-y-1 text-sm text-slate-600 dark:text-slate-300">
          <li>📍 Real-time location sharing — consent-based, always in control</li>
          <li>👤 Add family members — organizer, adult, teen, child roles</li>
          <li>🔒 Per-member privacy controls — share with all or organizer only</li>
          <li>🔔 Location alerts when members arrive at hotel or airport</li>
        </ul>
        <button
          type="button"
          onClick={onUpgrade}
          className="mt-4 w-full rounded-xl bg-sky-600 px-4 py-3 text-sm font-bold text-white transition hover:bg-sky-500"
        >
          Upgrade to Pro to create a Family group
        </button>
      </article>
    );
  }

  if (loading) {
    return (
      <article className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-sm text-slate-500 animate-pulse">Loading family group...</p>
      </article>
    );
  }

  return (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-semibold flex items-center gap-2">
            <span>👨‍👩‍👧</span>
            {group?.name ?? "My Family"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">{group?.members.length ?? 0} members</p>
        </div>
        <button
          type="button"
          onClick={() => void shareLocation()}
          disabled={sharingLocation}
          className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-bold text-white hover:bg-sky-500 disabled:opacity-60"
        >
          {sharingLocation ? "Getting location..." : "📍 Share my location"}
        </button>
      </div>

      {/* Map toggle */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
          {Object.keys(locations).length > 0 ? `${Object.keys(locations).length} location${Object.keys(locations).length !== 1 ? "s" : ""} live` : "No locations shared yet"}
        </p>
        <button
          type="button"
          onClick={() => setShowMap(v => !v)}
          className="text-xs font-semibold text-sky-600 hover:underline dark:text-sky-400"
        >
          {showMap ? "Hide map" : "Show map"}
        </button>
      </div>

      {/* Live map */}
      {showMap && (
        <FamilyMap
          members={group?.members ?? []}
          locations={locations}
          maptilerKey={maptilerKey ?? ""}
          height={300}
          onMemberClick={setSelectedMemberId}
        />
      )}


      {/* Invite code */}
      {group && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-xs font-semibold uppercase tracking-wider text-sky-700 dark:text-sky-300">Group invite code</p>
          <div className="mt-1 flex items-center gap-2">
            <p className="font-mono text-lg font-bold tracking-widest text-sky-900 dark:text-sky-100">{group.inviteCode}</p>
            <button
              type="button"
              onClick={() => void copyInviteCode()}
              className="rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:text-sky-300"
            >
              {copiedCode ? "Copied!" : "Copy"}
            </button>
          </div>
          <p className="mt-1 text-xs text-sky-600 dark:text-sky-400">Share this code with family members so they can join your group.</p>
        </div>
      )}

      {/* Member list */}
      <div className="space-y-2">
        {group?.members.map((member) => {
          const loc = locations[member.id];
          const stale = loc ? isStale(loc.updatedAt) : true;
          const hasLocation = Boolean(loc);
          return (
            <div key={member.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ring-2 ring-white dark:ring-slate-900 ${hasLocation && !stale ? "animate-pulse" : ""}`}
                    style={{ backgroundColor: member.color }}
                  />
                  <span className="font-medium text-sm">{member.name}</span>
                  <span className="text-xs text-slate-500 capitalize">{member.role}</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => void handleToggleSharing(member.id, member.sharingEnabled)}
                    className={`rounded-md px-2 py-1 text-xs font-semibold ${
                      member.sharingEnabled
                        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300"
                        : "bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                    }`}
                  >
                    {member.sharingEnabled ? "Sharing on" : "Sharing off"}
                  </button>
                  {member.id !== group?.ownerId && (
                    <button
                      type="button"
                      onClick={() => void handleRemoveMember(member.id, member.name)}
                      disabled={busy}
                      className="rounded-md px-2 py-1 text-xs text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-500/10"
                    >
                      Remove
                    </button>
                  )}
                </div>
              </div>
              {/* Location status */}
              <div className="mt-1.5 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                {hasLocation ? (
                  <>
                    <span className={`inline-block h-1.5 w-1.5 rounded-full ${stale ? "bg-amber-400" : "bg-emerald-400"}`} />
                    <span>{stale ? "Location stale — " : "Live — "}</span>
                    <span>{timeAgo(loc!.updatedAt)}</span>
                    {loc?.label && <span>· {loc.label}</span>}
                  </>
                ) : (
                  <>
                    <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                    <span>No location shared yet</span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Join/Leave for non-owners */}
      {groupRole === "member" && (
        <button
          type="button"
          onClick={() => void handleLeaveGroup()}
          disabled={busy}
          className="w-full rounded-xl border border-dashed border-rose-300 py-2.5 text-sm font-semibold text-rose-500 hover:bg-rose-50 dark:border-rose-700 dark:text-rose-400"
        >
          Leave this group
        </button>
      )}

      {/* Add member (owner only) */}
      {groupRole === "owner" && !addingMember ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAddingMember(true)}
            className="flex-1 rounded-xl border border-dashed border-slate-300 py-2.5 text-sm font-semibold text-slate-500 hover:border-sky-400 hover:text-sky-600 dark:border-slate-700 dark:text-slate-400"
          >
            + Add family member
          </button>
          {!joiningGroup && (
            <button
              type="button"
              onClick={() => setJoiningGroup(true)}
              className="rounded-xl border border-dashed border-sky-300 px-3 py-2.5 text-sm font-semibold text-sky-600 hover:bg-sky-50 dark:border-sky-700 dark:text-sky-400"
            >
              Join a group
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Add family member</p>
          <input
            type="text"
            value={newMemberName}
            onChange={(e) => setNewMemberName(e.target.value)}
            placeholder="Name (e.g. Sarah)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="email"
            value={newMemberEmail}
            onChange={(e) => setNewMemberEmail(e.target.value)}
            placeholder="Email (optional — for invite)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <select
            value={newMemberRole}
            onChange={(e) => setNewMemberRole(e.target.value as "adult" | "teen" | "child")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="adult">Adult</option>
            <option value="teen">Teen</option>
            <option value="child">Child</option>
          </select>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleAddMember()}
              disabled={busy || !newMemberName.trim()}
              className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {busy ? "Adding..." : "Add member"}
            </button>
            <button
              type="button"
              onClick={() => { setAddingMember(false); setNewMemberName(""); setNewMemberEmail(""); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {joiningGroup && (
        <div className="rounded-xl border border-sky-200 bg-sky-50 p-3 space-y-2 dark:border-sky-500/30 dark:bg-sky-500/10">
          <p className="text-xs font-semibold text-sky-800 dark:text-sky-200">Join a family group</p>
          <input
            type="text"
            value={joinName}
            onChange={(e) => setJoinName(e.target.value)}
            placeholder="Your name (e.g. Sarah)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-900"
          />
          <input
            type="text"
            value={joinCode}
            onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
            placeholder="Group invite code (e.g. A1B2C3D4)"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-sm uppercase tracking-widest dark:border-slate-700 dark:bg-slate-900"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleJoinGroup()}
              disabled={joinBusy || !joinCode.trim()}
              className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-bold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {joinBusy ? "Joining..." : "Join group"}
            </button>
            <button
              type="button"
              onClick={() => { setJoiningGroup(false); setJoinCode(""); setJoinName(""); }}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {message && (
        <p className={`text-xs ${message.startsWith("✅") ? "text-emerald-700 dark:text-emerald-300" : "text-rose-600 dark:text-rose-400"}`}>
          {message}
        </p>
      )}

      <p className="text-xs text-slate-400 dark:text-slate-500">
        Location sharing is consent-based. Each member controls their own sharing. You can turn it off at any time.
      </p>
    </article>
  );
}
