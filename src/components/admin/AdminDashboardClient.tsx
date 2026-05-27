"use client"; // v2 - invite email

import { useCallback, useEffect, useState } from "react";
import { ActiveUsersCard } from "@/components/admin/ActiveUsersCard";
import { ApiUsageCard } from "@/components/admin/ApiUsageCard";
import { BackgroundJobsCard } from "@/components/admin/BackgroundJobsCard";
import { InsightsCard } from "@/components/admin/InsightsCard";
import { RecentAlertsCard } from "@/components/admin/RecentAlertsCard";
import { SystemHealthCard } from "@/components/admin/SystemHealthCard";
import { openSupportChat } from "@/components/support/SupportChat";
import type { AdminHealthResponse, AdminStatsResponse } from "@/lib/admin/adminTypes";

type AdminTab = "operations" | "insights" | "users" | "invite-codes";

interface AdminUserRow {
  userId: string;
  email: string;
  signedUpAt: string | null;
  signedUpVia: "organic" | "invite-code" | "referral-code";
  signedUpViaLabel: "Organic" | "Invite Code" | "Referral Code";
  codeUsed: string | null;
  currentPlan: "free" | "pro" | "concierge" | "lifetime" | "trial";
  trialExpiresAt: string | null;
  monthlyRevenueUsd: 0 | 9 | 29;
  status: "active" | "revoked";
  inviteCodeStatus: "active" | "revoked" | "used" | null;
}

interface AdminInviteCodeRow {
  code: string;
  type: "lifetime" | "trial-30" | "referral";
  createdBy: string;
  createdAt: string;
  usedBy: string | null;
  usedAt: string | null;
  status: "active" | "revoked" | "used";
  note: string | null;
}

function formatCodeTypeLabel(type: AdminInviteCodeRow["type"]): string {
  if (type === "lifetime") return "Invite Code (Lifetime)";
  if (type === "trial-30") return "Invite Code (30-day Trial)";
  return "Referral Code";
}

export function AdminDashboardClient() {
  const [health, setHealth] = useState<AdminHealthResponse | null>(null);
  const [stats, setStats] = useState<AdminStatsResponse | null>(null);
  const [activeTab, setActiveTab] = useState<AdminTab>("operations");
  const [loadingHealth, setLoadingHealth] = useState(true);
  const [loadingStats, setLoadingStats] = useState(true);
  const [healthError, setHealthError] = useState<string | null>(null);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [inviteCodes, setInviteCodes] = useState<AdminInviteCodeRow[]>([]);
  const [loadingInviteCodes, setLoadingInviteCodes] = useState(false);
  const [inviteCodesError, setInviteCodesError] = useState<string | null>(null);
  const [adminBusy, setAdminBusy] = useState(false);
  const [adminMessage, setAdminMessage] = useState<string | null>(null);
  const [inviteNote, setInviteNote] = useState("");
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteSendResult, setInviteSendResult] = useState<{ code: string; redeemUrl: string; emailSent: boolean; warning?: string } | null>(null);

  const loadHealth = useCallback(async (): Promise<void> => {
    setLoadingHealth(true);
    try {
      const response = await fetch("/api/admin/health", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Health endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as AdminHealthResponse;
      setHealth(payload);
      setHealthError(null);
    } catch (error) {
      setHealthError(error instanceof Error ? error.message : "Unknown admin health error.");
    } finally {
      setLoadingHealth(false);
    }
  }, []);

  const loadStats = useCallback(async (): Promise<void> => {
    setLoadingStats(true);
    try {
      const response = await fetch("/api/admin/stats", { cache: "no-store" });
      if (!response.ok) {
        throw new Error(`Stats endpoint returned ${response.status}`);
      }
      const payload = (await response.json()) as AdminStatsResponse;
      setStats(payload);
      setStatsError(null);
    } catch (error) {
      setStatsError(error instanceof Error ? error.message : "Unknown admin stats error.");
    } finally {
      setLoadingStats(false);
    }
  }, []);

  const loadUsers = useCallback(async (): Promise<void> => {
    setLoadingUsers(true);
    try {
      const response = await fetch("/api/admin/users", { cache: "no-store" });
      const payload = (await response.json()) as { users?: AdminUserRow[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Users endpoint returned ${response.status}`);
      }
      setUsers(Array.isArray(payload.users) ? payload.users : []);
      setUsersError(null);
    } catch (error) {
      setUsersError(error instanceof Error ? error.message : "Unknown admin users error.");
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  const loadInviteCodes = useCallback(async (): Promise<void> => {
    setLoadingInviteCodes(true);
    try {
      const response = await fetch("/api/admin/invite-codes", { cache: "no-store" });
      const payload = (await response.json()) as { codes?: AdminInviteCodeRow[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? `Invite codes endpoint returned ${response.status}`);
      }
      setInviteCodes(Array.isArray(payload.codes) ? payload.codes : []);
      setInviteCodesError(null);
    } catch (error) {
      setInviteCodesError(error instanceof Error ? error.message : "Unknown invite-code fetch error.");
    } finally {
      setLoadingInviteCodes(false);
    }
  }, []);

  useEffect(() => {
    const bootstrap = window.setTimeout(() => {
      void loadHealth();
      void loadStats();
      void loadUsers();
      void loadInviteCodes();
    }, 0);
    return () => window.clearTimeout(bootstrap);
  }, [loadHealth, loadInviteCodes, loadStats, loadUsers]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void loadStats();
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [loadStats]);

  const handleGenerateInviteCode = useCallback(
    async (type: "lifetime" | "trial-30"): Promise<void> => {
      if (adminBusy) return;
      setAdminBusy(true);
      setAdminMessage(null);
      try {
        const response = await fetch("/api/invite/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            note: inviteNote.trim() || undefined,
          }),
        });
        const payload = (await response.json()) as { code?: { code?: string }; error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Generate endpoint returned ${response.status}`);
        }
        const code = payload.code?.code ?? "unknown";
        const appUrl = window.location.origin;
        const redeemUrl = `${appUrl}/redeem?code=${encodeURIComponent(code)}`;
        setAdminMessage(`Generated ${type === "lifetime" ? "Lifetime" : "30-day Trial"} code: ${code}`);
        setInviteSendResult({ code, redeemUrl, emailSent: false });
        setInviteNote("");
        await loadInviteCodes();
      } catch (error) {
        setAdminMessage(error instanceof Error ? error.message : "Failed to generate Invite Code.");
      } finally {
        setAdminBusy(false);
      }
    },
    [adminBusy, inviteNote, loadInviteCodes],
  );

  const handleSendInvite = useCallback(
    async (type: "lifetime" | "trial-30"): Promise<void> => {
      if (adminBusy) return;
      const email = inviteEmail.trim();
      if (!email || !email.includes("@")) {
        setAdminMessage("Please enter a valid email address.");
        return;
      }
      setAdminBusy(true);
      setAdminMessage(null);
      setInviteSendResult(null);
      try {
        const response = await fetch("/api/admin/send-invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, type, note: inviteNote.trim() || email }),
        });
        const payload = (await response.json()) as {
          ok?: boolean; code?: string; redeemUrl?: string;
          emailSent?: boolean; warning?: string; error?: string;
        };
        if (!response.ok || !payload.ok) {
          throw new Error(payload.error ?? `Send invite returned ${response.status}`);
        }
        setInviteSendResult({
          code: payload.code ?? "",
          redeemUrl: payload.redeemUrl ?? "",
          emailSent: payload.emailSent ?? false,
          warning: payload.warning,
        });
        setAdminMessage(
          payload.emailSent
            ? `✅ Invite sent to ${email} — code: ${payload.code}`
            : `⚠️ Code generated (${payload.code}) but email not sent. ${payload.warning ?? ""}`,
        );
        setInviteEmail("");
        setInviteNote("");
        await loadInviteCodes();
      } catch (error) {
        setAdminMessage(error instanceof Error ? error.message : "Failed to send invite.");
      } finally {
        setAdminBusy(false);
      }
    },
    [adminBusy, inviteEmail, inviteNote, loadInviteCodes],
  );

  const handleRevokeInviteForUser = useCallback(
    async (targetUserId: string): Promise<void> => {
      if (adminBusy) return;
      setAdminBusy(true);
      setAdminMessage(null);
      try {
        const response = await fetch("/api/admin/revoke", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId: targetUserId }),
        });
        const payload = (await response.json()) as { error?: string; code?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? `Revoke endpoint returned ${response.status}`);
        }
        setAdminMessage(`Revoked Invite Code ${payload.code ?? ""} and downgraded user.`);
        await Promise.all([loadUsers(), loadInviteCodes()]);
      } catch (error) {
        setAdminMessage(error instanceof Error ? error.message : "Failed to revoke Invite Code.");
      } finally {
        setAdminBusy(false);
      }
    },
    [adminBusy, loadInviteCodes, loadUsers],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-1 text-xs dark:border-slate-700 dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setActiveTab("operations")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "operations"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Operations
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("insights")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "insights"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Insights
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("users")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "users"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Users
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("invite-codes")}
            className={`rounded-md px-3 py-1.5 font-semibold transition ${
              activeTab === "invite-codes"
                ? "bg-cyan-500 text-slate-950"
                : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
            }`}
          >
            Invite Codes
          </button>
        </div>
        <button
          type="button"
          onClick={() => openSupportChat()}
          className="text-xs font-semibold text-cyan-700 underline decoration-cyan-400 underline-offset-2 hover:text-cyan-600 dark:text-cyan-300 dark:hover:text-cyan-200"
        >
          Talk to Support
        </button>
      </div>

      {activeTab === "operations" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SystemHealthCard
            data={health}
            loading={loadingHealth}
            error={healthError}
            onRefresh={() => {
              void loadHealth();
            }}
          />

          <ActiveUsersCard
            loading={loadingStats}
            activeSessionUsers={stats?.activeUsers.activeSessionUsers ?? 0}
            pushSubscriptionUsers={stats?.activeUsers.pushSubscriptionUsers ?? 0}
            calendarSyncUsers={stats?.activeUsers.calendarSyncUsers ?? 0}
          />

          <RecentAlertsCard alerts={stats?.recentAlerts ?? []} loading={loadingStats} />

          <BackgroundJobsCard
            runs={stats?.backgroundJobs.runs ?? []}
            dashboardUrl={stats?.backgroundJobs.dashboardUrl ?? "https://app.inngest.com/"}
            loading={loadingStats}
          />

          <div className="lg:col-span-2">
            <ApiUsageCard
              endpointRateLimitHits={stats?.apiUsage.endpointRateLimitHits ?? []}
              topActiveUsers={stats?.apiUsage.topActiveUsers ?? []}
              loading={loadingStats}
            />
            {statsError ? (
              <p className="mt-2 rounded-md border border-rose-400/40 bg-rose-500/10 px-2.5 py-2 text-xs text-rose-700 dark:text-rose-200">
                {statsError}
              </p>
            ) : null}
          </div>
        </div>
      ) : activeTab === "insights" ? (
        <InsightsCard insights={stats?.insights ?? null} loading={loadingStats} />
      ) : activeTab === "users" ? (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Users</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Organic, invite, and referral lifecycle overview.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadUsers();
              }}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          <div className="overflow-auto">
            <table className="min-w-[980px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-2 py-2">Email</th>
                  <th className="px-2 py-2">Signed up date</th>
                  <th className="px-2 py-2">Signed up via</th>
                  <th className="px-2 py-2">Code used</th>
                  <th className="px-2 py-2">Current plan</th>
                  <th className="px-2 py-2">Trial expiry</th>
                  <th className="px-2 py-2">Monthly revenue</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.userId} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-2">{user.email}</td>
                    <td className="px-2 py-2">{user.signedUpAt ? new Date(user.signedUpAt).toLocaleDateString() : "-"}</td>
                    <td className="px-2 py-2">{user.signedUpViaLabel}</td>
                    <td className="px-2 py-2">{user.codeUsed ?? "-"}</td>
                    <td className="px-2 py-2">{user.currentPlan}</td>
                    <td className="px-2 py-2">
                      {user.trialExpiresAt ? new Date(user.trialExpiresAt).toLocaleDateString() : "-"}
                    </td>
                    <td className="px-2 py-2">${user.monthlyRevenueUsd}</td>
                    <td className="px-2 py-2">{user.status}</td>
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        disabled={adminBusy || user.signedUpVia !== "invite-code" || user.inviteCodeStatus === "revoked"}
                        onClick={() => {
                          void handleRevokeInviteForUser(user.userId);
                        }}
                        className="rounded-md border border-rose-400/60 px-2 py-1 text-[11px] font-semibold text-rose-700 hover:bg-rose-500/10 disabled:cursor-not-allowed disabled:opacity-40 dark:text-rose-200"
                      >
                        Revoke code
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loadingUsers ? <p className="text-xs text-slate-500 dark:text-slate-400">Loading users...</p> : null}
          {usersError ? <p className="text-xs text-rose-600 dark:text-rose-300">{usersError}</p> : null}
          {adminMessage ? <p className="text-xs text-cyan-700 dark:text-cyan-300">{adminMessage}</p> : null}
        </section>
      ) : (
        <section className="space-y-3 rounded-2xl border border-slate-200 bg-white/90 p-4 dark:border-slate-700 dark:bg-slate-900/70">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Invite Codes</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Generate Invite Codes and review Referral Code usage in one table.
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                void loadInviteCodes();
              }}
              className="rounded-md border border-slate-300 px-3 py-1 text-xs font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Refresh
            </button>
          </div>
          {/* Email invite form */}
          <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-950/70">
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500 dark:text-slate-400">Send invite by email</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="recipient@email.com"
                className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
              <input
                type="text"
                value={inviteNote}
                onChange={(e) => setInviteNote(e.target.value)}
                placeholder="Optional note"
                className="w-40 rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm dark:border-slate-700 dark:bg-slate-900"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={adminBusy || !inviteEmail.includes("@")}
                onClick={() => { void handleSendInvite("lifetime"); }}
                className="rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                ✉ Send lifetime invite
              </button>
              <button
                type="button"
                disabled={adminBusy || !inviteEmail.includes("@")}
                onClick={() => { void handleSendInvite("trial-30"); }}
                className="rounded-lg border border-sky-600 px-4 py-2.5 text-xs font-bold text-sky-700 hover:bg-sky-600/10 disabled:cursor-not-allowed disabled:opacity-50 dark:text-sky-300"
              >
                ✉ Send 30-day trial invite
              </button>
              <button
                type="button"
                disabled={adminBusy}
                onClick={() => { void handleGenerateInviteCode("lifetime"); }}
                className="rounded-lg border border-slate-300 px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
              >
                Generate (no email)
              </button>
            </div>
            {adminBusy && (
              <p className="text-xs font-semibold text-sky-600 dark:text-sky-400 animate-pulse">Sending…</p>
            )}
            {adminMessage && !adminBusy && (
              <p className={`text-xs font-semibold ${adminMessage.startsWith("✅") ? "text-emerald-700 dark:text-emerald-300" : adminMessage.startsWith("⚠") ? "text-amber-700 dark:text-amber-300" : "text-rose-700 dark:text-rose-300"}`}>
                {adminMessage}
              </p>
            )}
            {inviteSendResult && (
              <div className="rounded-xl border border-sky-200 bg-sky-50 p-4 dark:border-sky-500/30 dark:bg-sky-500/10">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-sky-800 dark:text-sky-200">
                    {inviteSendResult.emailSent ? "✅ Email sent" : "🔗 Share this link"}
                  </p>
                </div>
                {/* Code row */}
                <div className="mt-2 flex items-center gap-2">
                  <p className="flex-1 font-mono text-sm font-bold tracking-widest text-sky-900 dark:text-sky-100">{inviteSendResult.code}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(inviteSendResult.code); setAdminMessage("Code copied!"); }}
                    className="rounded-md border border-sky-300 px-2 py-1 text-xs font-semibold text-sky-700 hover:bg-sky-100 dark:border-sky-600 dark:text-sky-300"
                  >
                    Copy code
                  </button>
                </div>
                {/* Link row */}
                <div className="mt-2 flex items-start gap-2">
                  <p className="flex-1 break-all text-xs text-sky-700 dark:text-sky-300">{inviteSendResult.redeemUrl}</p>
                  <button
                    type="button"
                    onClick={() => { void navigator.clipboard.writeText(inviteSendResult.redeemUrl); setAdminMessage("Link copied!"); }}
                    className="shrink-0 rounded-md bg-sky-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-500"
                  >
                    Copy link
                  </button>
                </div>
                {inviteSendResult.warning && (
                  <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{inviteSendResult.warning}</p>
                )}
              </div>
            )}
          </div>
          <div className="overflow-auto">
            <table className="min-w-[900px] text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="px-2 py-2">Code</th>
                  <th className="px-2 py-2">Type</th>
                  <th className="px-2 py-2">Note</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Used by</th>
                  <th className="px-2 py-2">Used at</th>
                  <th className="px-2 py-2">Created by</th>
                </tr>
              </thead>
              <tbody>
                {inviteCodes.map((code) => (
                  <tr key={code.code} className="border-b border-slate-100 dark:border-slate-800">
                    <td className="px-2 py-2 font-semibold">{code.code}</td>
                    <td className="px-2 py-2">{formatCodeTypeLabel(code.type)}</td>
                    <td className="px-2 py-2">{code.note ?? "-"}</td>
                    <td className="px-2 py-2">{code.status}</td>
                    <td className="px-2 py-2">{code.usedBy ?? "-"}</td>
                    <td className="px-2 py-2">{code.usedAt ? new Date(code.usedAt).toLocaleString() : "-"}</td>
                    <td className="px-2 py-2">{code.createdBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {loadingInviteCodes ? <p className="text-xs text-slate-500 dark:text-slate-400">Loading Invite Codes...</p> : null}
          {inviteCodesError ? <p className="text-xs text-rose-600 dark:text-rose-300">{inviteCodesError}</p> : null}
          {adminMessage ? <p className="text-xs text-cyan-700 dark:text-cyan-300">{adminMessage}</p> : null}
        </section>
      )}
    </div>
  );
}
