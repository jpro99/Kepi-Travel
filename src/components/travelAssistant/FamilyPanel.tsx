"use client";

type VisibilityMode = "all-members" | "organizer-only";

interface LocationPoint {
  lat: number;
  lon: number;
  updatedAt: string;
}

interface FamilyMember {
  id: string;
  name: string;
  role: "organizer" | "adult" | "teen";
  color: string;
  sharingEnabled: boolean;
  visibility: VisibilityMode;
  location: LocationPoint;
}

interface FamilyPanelProps {
  showFamilyMap: boolean;
  onShowFamilyMapChange: (show: boolean) => void;
  selectedFamilyMemberId: string;
  onSelectedFamilyMemberIdChange: (memberId: string) => void;
  selectedFamilyMember: FamilyMember;
  familyMembers: FamilyMember[];
  canViewerSeeMember: (viewer: FamilyMember, target: FamilyMember) => boolean;
  nowMs: number;
  canSendLocationNow: boolean;
  onToggleMemberSharing: (memberId: string) => void;
  onToggleMemberVisibility: (memberId: string) => void;
  visibleFamilyMarkers: Array<{ member: FamilyMember; x: number; y: number }>;
  formatClock: (value: string | null) => string;
  onSyncGoogleCalendar: () => void;
  calendarSyncInFlight: boolean;
  calendarSyncMessage: string | null;
  calendarSyncTone: "neutral" | "success" | "error";
}

export function FamilyPanel({
  showFamilyMap,
  onShowFamilyMapChange,
  selectedFamilyMemberId,
  onSelectedFamilyMemberIdChange,
  selectedFamilyMember,
  familyMembers,
  canViewerSeeMember,
  nowMs,
  canSendLocationNow,
  onToggleMemberSharing,
  onToggleMemberVisibility,
  visibleFamilyMarkers,
  formatClock,
  onSyncGoogleCalendar,
  calendarSyncInFlight,
  calendarSyncMessage,
  calendarSyncTone,
}: FamilyPanelProps) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Family sharing and optional location map</h2>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            Consent-based location sharing with identity context and per-person timeline controls.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-full border border-slate-300 bg-slate-50 px-3 py-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <input
            type="checkbox"
            checked={showFamilyMap}
            onChange={(event) => onShowFamilyMapChange(event.target.checked)}
          />
          Show family map
        </label>
      </div>

      <label className="mt-3 block text-sm">
        <span className="mb-1 block text-slate-700 dark:text-slate-300">Who am I right now?</span>
        <select
          value={selectedFamilyMemberId}
          onChange={(event) => onSelectedFamilyMemberIdChange(event.target.value)}
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        >
          {familyMembers.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name} ({member.role})
            </option>
          ))}
        </select>
      </label>

      <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/60">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold text-slate-900 dark:text-slate-100">Google Calendar sync</p>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              Mirror reservations to Google Calendar for family visibility and reminders.
            </p>
          </div>
          <button
            type="button"
            onClick={onSyncGoogleCalendar}
            disabled={calendarSyncInFlight}
            className="rounded-md bg-indigo-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {calendarSyncInFlight ? "Syncing..." : "Sync to Google Calendar"}
          </button>
        </div>
        {calendarSyncMessage ? (
          <p
            className={`mt-2 text-xs ${
              calendarSyncTone === "success"
                ? "text-emerald-700 dark:text-emerald-300"
                : calendarSyncTone === "error"
                  ? "text-rose-700 dark:text-rose-300"
                  : "text-slate-600 dark:text-slate-400"
            }`}
          >
            {calendarSyncMessage}
          </p>
        ) : null}
      </div>

      <div className="mt-3 grid gap-2">
        {familyMembers.map((member) => {
          const isVisibleToViewer = canViewerSeeMember(selectedFamilyMember, member);
          const updatedMs = Date.parse(member.location.updatedAt);
          const stale = nowMs - updatedMs > 5 * 60_000 || !canSendLocationNow;
          return (
            <div key={member.id} className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-700 dark:bg-slate-950/60">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: member.color }} />
                  <span className="font-medium">{member.name}</span>
                  <span className="text-xs text-slate-600 dark:text-slate-400">({member.role})</span>
                </div>
                <span className="text-xs text-slate-600 dark:text-slate-400">{isVisibleToViewer ? (stale ? "Stale" : "Live") : "Hidden"}</span>
              </div>
              <p className="mt-1 text-xs text-slate-600 dark:text-slate-400">Last update: {formatClock(member.location.updatedAt)}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => onToggleMemberSharing(member.id)}
                  className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  Sharing: {member.sharingEnabled ? "On" : "Off"}
                </button>
                <button
                  type="button"
                  onClick={() => onToggleMemberVisibility(member.id)}
                  className="rounded-md bg-slate-200 px-2 py-1 ring-1 ring-slate-300 hover:bg-slate-300 dark:bg-slate-800 dark:ring-slate-700 dark:hover:bg-slate-700"
                >
                  Visible to: {member.visibility === "all-members" ? "All" : "Organizer only"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showFamilyMap ? (
        <div className="relative mt-4 h-64 overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-100 via-indigo-100/60 to-slate-100 dark:border-slate-700 dark:from-slate-950 dark:via-indigo-950/40 dark:to-slate-950">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(56,189,248,0.08),transparent_55%)]" />
          {visibleFamilyMarkers.map(({ member, x, y }) => {
            const stale = nowMs - Date.parse(member.location.updatedAt) > 5 * 60_000 || !canSendLocationNow;
            return (
              <div
                key={member.id}
                className="absolute -translate-x-1/2 -translate-y-1/2 text-center"
                style={{ left: `${x}%`, top: `${y}%` }}
              >
                <span
                  className={`mx-auto block h-4 w-4 rounded-full ring-2 ring-white dark:ring-slate-900 ${stale ? "opacity-55" : ""}`}
                  style={{ backgroundColor: member.color }}
                />
                <span className="mt-1 block rounded bg-slate-200/90 px-1.5 py-0.5 text-[11px] text-slate-900 dark:bg-slate-900/80 dark:text-slate-100">
                  {member.name}
                </span>
              </div>
            );
          })}
          {visibleFamilyMarkers.length === 0 ? (
            <p className="absolute inset-0 flex items-center justify-center text-sm text-slate-600 dark:text-slate-400">
              No visible shared locations yet.
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-950/60 dark:text-slate-400">
          Family map is optional and currently hidden.
        </p>
      )}
    </article>
  );
}
