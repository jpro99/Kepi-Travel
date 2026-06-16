"use client";

import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import maplibregl, { Map } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { fetchJson } from "@/lib/api/readJsonResponse";
import { FAMILY_LOCATION_STALE_MS } from "@/lib/family/familyLocationWatch";
import { directMaptilerTransformRequest, maptilerStyleUrl } from "@/lib/map/maptilerClient";

// ---[ TYPES ]----------------------------------------------------------------
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
  lastSentAt: string | null;
}

// ---[ HELPERS ]--------------------------------------------------------------
function timeAgo(iso: string): string {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 60_000);
  if (d < 1) return "just now";
  if (d < 60) return `${d}m ago`;
  if (d < 1440) return `${Math.floor(d/60)}h ago`;
  return `${Math.floor(d/1440)}d ago`;
}
function isStale(iso: string): boolean { return Date.now() - Date.parse(iso) > FAMILY_LOCATION_STALE_MS; }

function familyInviteLink(code: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "https://kepitravel.com";
  return `${origin}/join-family?code=${encodeURIComponent(code)}`;
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

// ---[ MAIN COMPONENT ]-------------------------------------------------------
export function FamilyPanel({ isPremium, onUpgrade, lastSentAt }: FamilyPanelProps) {
    const router = useRouter();
    const { user } = useUser();
    const mapContainer = useRef<HTMLDivElement>(null);
    const mapRef = useRef<Map | null>(null);
    const markersRef = useRef<Record<string, maplibregl.Marker>>({});

    const [groups, setGroups] = useState<FamilyGroup[]>([]);
    const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
    const [locations, setLocations] = useState<Record<string, LocationPoint>>({});
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [maptilerKey, setMaptilerKey] = useState("");
    const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
    const [joinCode, setJoinCode] = useState("");
    const [actionBusy, setActionBusy] = useState(false);
    const [actionMessage, setActionMessage] = useState<string | null>(null);
    
    const activeGroup = useMemo(() => groups.find(g => g.id === activeGroupId) ?? groups[0] ?? null, [groups, activeGroupId]);

    // ---[ DATA FETCHING ]----------------------------------------------------
    const load = useCallback(async (groupId?: string) => {
        try {
            const url = groupId ? `/api/family?groupId=${groupId}` : "/api/family";
            const data = await fetchJson<{
                groups?: FamilyGroup[];
                group?: FamilyGroup;
                locations?: Record<string, LocationPoint>;
            }>(url);
            if (data.groups) setGroups(data.groups);
            else if (data.group) setGroups([data.group]);
            setLocations(data.locations ?? {});
            if (data.group) setActiveGroupId(data.group.id);
            setLoadError(null);
        } catch (e) {
            setLoadError(e instanceof Error ? e.message : "Could not load family group.");
            console.error("Could not load family groups", e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isPremium) { setLoading(false); return; }
        void fetchJson<{ maptilerKey?: string }>("/api/config")
            .then((d) => { if (d.maptilerKey) setMaptilerKey(d.maptilerKey); })
            .catch(() => null);
        void load();
        const poll = setInterval(() => load(activeGroupId ?? undefined), 15000);
        return () => clearInterval(poll);
    }, [isPremium, load, activeGroupId]);

    // ---[ MAP LOGIC ]--------------------------------------------------------
    useEffect(() => {
        if (mapRef.current || !mapContainer.current || !activeGroup || !maptilerKey) return;

        mapRef.current = new maplibregl.Map({
            container: mapContainer.current,
            style: maptilerStyleUrl("streets-v2-dark", maptilerKey),
            center: [-98.5795, 39.8283],
            zoom: 3,
            transformRequest: directMaptilerTransformRequest(maptilerKey),
        });

    }, [activeGroup, maptilerKey]);

    useEffect(() => {
        const map = mapRef.current;
        if (!map || !activeGroup) return;

        const memberLocations = activeGroup.members
            .map(m => locations[m.id])
            .filter((l): l is LocationPoint => !!l);

        // Update markers
        activeGroup.members.forEach(member => {
            const location = locations[member.id];
            if (!location) {
                // Remove marker if location is gone
                markersRef.current[member.id]?.remove();
                delete markersRef.current[member.id];
                return;
            }

            const el = document.createElement('div');
            el.className = 'family-marker';
            el.style.backgroundImage = `url(${member.imageUrl || `https://ui-avatars.com/api/?name=${member.name.charAt(0)}&background=${member.color.substring(1)}&color=fff`})`;
            el.style.border = `2px solid ${selectedMemberId === member.id ? '#38bdf8' : '#fff'}`;
            el.onclick = () => setSelectedMemberId(member.id);

            if (markersRef.current[member.id]) {
                markersRef.current[member.id].setLngLat([location.lon, location.lat]);
                (markersRef.current[member.id].getElement() as HTMLDivElement).style.border = `2px solid ${selectedMemberId === member.id ? '#38bdf8' : '#fff'}`;
            } else {
                markersRef.current[member.id] = new maplibregl.Marker({ element: el })
                    .setLngLat([location.lon, location.lat])
                    .addTo(map);
            }
        });

        // Fit map to markers
        if (memberLocations.length > 0) {
            const bounds = new maplibregl.LngLatBounds();
            memberLocations.forEach(loc => bounds.extend([loc.lon, loc.lat]));
            map.fitBounds(bounds, { padding: 80, maxZoom: 15, duration: 1000 });
        }

    }, [locations, activeGroup, selectedMemberId]);

    const handleCreateGroup = useCallback(async () => {
        setActionBusy(true);
        setActionMessage(null);
        try {
            const data = await fetchJson<{ group?: FamilyGroup; groups?: FamilyGroup[] }>("/api/family", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ action: "create-group", groupName: "My Family" }),
            });
            if (data.group) {
                setGroups(data.groups ?? [data.group]);
                setActiveGroupId(data.group.id);
            }
            await load(data.group?.id);
            setActionMessage("Family group ready — share the invite link below.");
        } catch (e) {
            setActionMessage(e instanceof Error ? e.message : "Could not create group.");
        } finally {
            setActionBusy(false);
        }
    }, [load]);

    const handleJoinGroup = useCallback(async () => {
        const code = joinCode.trim().toUpperCase();
        if (!code) {
            setActionMessage("Enter an invite code from your travel companion.");
            return;
        }
        setActionBusy(true);
        setActionMessage(null);
        try {
            const data = await fetchJson<{ ok?: boolean; error?: string; group?: FamilyGroup }>("/api/family", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    action: "join-group",
                    inviteCode: code,
                    name: user?.firstName ?? user?.username ?? "Family Member",
                    email: user?.primaryEmailAddress?.emailAddress ?? null,
                    imageUrl: user?.imageUrl ?? null,
                }),
            });
            if (!data.ok) throw new Error(data.error ?? "Could not join group.");
            setJoinCode("");
            await load(data.group?.id);
            setActionMessage(data.group ? `Joined ${data.group.name}. Location sharing is on.` : "Joined family group.");
            window.dispatchEvent(new Event("kepi:family-start-sharing"));
        } catch (e) {
            setActionMessage(e instanceof Error ? e.message : "Could not join group.");
        } finally {
            setActionBusy(false);
        }
    }, [joinCode, load, user]);

    const handleCopyInvite = useCallback(async (code: string) => {
        const copied = await copyText(familyInviteLink(code));
        setActionMessage(copied ? "Invite link copied — send it to your family." : "Could not copy link.");
    }, []);


    // ---[ RENDER LOGIC ]-----------------------------------------------------
    if (!isPremium) {
        return (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 text-center">
                <h2 className="font-bold text-slate-900 dark:text-white">Family Tracker</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">See your family on a live map and get arrival alerts. Upgrade to Pro to use this feature.</p>
                <button type="button" onClick={onUpgrade} className="mt-4 w-full rounded-2xl bg-[#007AFF] py-3 text-sm font-bold text-white">Upgrade to Pro</button>
            </div>
        );
    }

    if (loading) {
        return <div className="h-96 rounded-3xl bg-slate-800 animate-pulse" />;
    }

    if (loadError && !activeGroup) {
        return (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 text-center">
                <h2 className="font-bold text-slate-900 dark:text-white">Family map unavailable</h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">{loadError}</p>
                <button type="button" onClick={() => void load()} className="mt-4 rounded-2xl bg-[#007AFF] px-4 py-2 text-sm font-bold text-white">
                    Try again
                </button>
            </div>
        );
    }

    if (!activeGroup) {
        return (
            <div className="rounded-3xl bg-white dark:bg-slate-900 p-5 space-y-4">
                <div className="text-center">
                    <h2 className="font-bold text-slate-900 dark:text-white">Family Tracking</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-2">
                        Create a group for your trip, or join someone who already started one.
                    </p>
                </div>
                <button
                    type="button"
                    disabled={actionBusy}
                    onClick={() => void handleCreateGroup()}
                    className="w-full rounded-2xl bg-[#007AFF] py-3 text-sm font-bold text-white disabled:opacity-60"
                >
                    {actionBusy ? "Setting up…" : "Create family group"}
                </button>
                <div className="rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                        Have an invite code?
                    </p>
                    <input
                        value={joinCode}
                        onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                        placeholder="ABC12345"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2 text-sm text-slate-900 dark:text-white"
                    />
                    <button
                        type="button"
                        disabled={actionBusy}
                        onClick={() => void handleJoinGroup()}
                        className="w-full rounded-2xl bg-slate-900 dark:bg-white py-3 text-sm font-bold text-white dark:text-slate-900 disabled:opacity-60"
                    >
                        Join family group
                    </button>
                </div>
                {actionMessage ? (
                    <p className="text-sm text-center text-slate-600 dark:text-slate-300">{actionMessage}</p>
                ) : null}
            </div>
        );
    }

    const selectedMember = activeGroup.members.find(m => m.id === selectedMemberId);
    const selectedLocation = selectedMember ? locations[selectedMember.id] : undefined;

    return (
        <div className="h-[600px] w-full flex flex-col bg-slate-900 rounded-3xl overflow-hidden ring-1 ring-white/[0.08]">
            <div ref={mapContainer} className="flex-grow" />
            <div className="flex-shrink-0 bg-slate-900/80 backdrop-blur-sm p-4 border-t border-slate-800 space-y-3">
                <div className="flex justify-between items-center gap-3">
                    <h3 className="font-bold text-white text-lg">{activeGroup.name}</h3>
                    <button
                      type="button"
                      onClick={() => router.push("/travel-assistant/live-map")}
                      className="px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold shrink-0"
                    >
                      Open live map
                    </button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs text-slate-400">Invite code</span>
                    <code className="rounded-lg bg-slate-800 px-2 py-1 text-sm font-mono text-cyan-300">
                        {activeGroup.inviteCode}
                    </code>
                    <button
                        type="button"
                        onClick={() => void handleCopyInvite(activeGroup.inviteCode)}
                        className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white"
                    >
                        Copy invite link
                    </button>
                </div>
                {actionMessage ? (
                    <p className="text-xs text-slate-300">{actionMessage}</p>
                ) : null}
                {lastSentAt ? (
                    <p className="text-xs text-emerald-400">Your location shared {timeAgo(lastSentAt)}</p>
                ) : (
                    <p className="text-xs text-slate-400">Enable location in your browser to appear on the map.</p>
                )}
                <div className="flex overflow-x-auto gap-3 py-2 mt-2">
                    {activeGroup.members.map(member => {
                        const location = locations[member.id];
                        const live = location && !isStale(location.updatedAt);
                        return (
                            <button key={member.id} onClick={() => setSelectedMemberId(member.id)} className={`flex-shrink-0 text-left p-3 rounded-2xl transition-colors ${selectedMemberId === member.id ? 'bg-sky-500/20' : 'bg-slate-800/50'}`}>
                                <div className="flex items-center gap-3">
                                    <img src={member.imageUrl || `https://ui-avatars.com/api/?name=${member.name.charAt(0)}&background=${member.color.substring(1)}&color=fff`} alt={member.name} className="w-10 h-10 rounded-full" />
                                    <div>
                                        <p className="font-semibold text-white text-sm">{member.name}</p>
                                        <p className={`text-xs mt-0.5 flex items-center gap-1.5 ${!location ? "text-slate-400" : live ? "text-emerald-400" : "text-amber-400"}`}>
                                            <span className={`inline-block h-2 w-2 rounded-full ${!location ? "bg-slate-700" : live ? "bg-emerald-400 animate-pulse" : "bg-amber-400"}`} />
                                            {!location ? "Not sharing" : `${timeAgo(location.updatedAt)}`}
                                        </p>
                                    </div>
                                </div>
                                {selectedMemberId === member.id && selectedLocation && (
                                    <p className="text-slate-300 text-xs mt-2">At {selectedLocation.lat.toFixed(4)}, {selectedLocation.lon.toFixed(4)}</p>
                                )}
                            </button>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
