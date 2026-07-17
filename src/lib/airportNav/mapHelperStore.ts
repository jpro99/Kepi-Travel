/**
 * Admin-gated map helpers — opt-in users who one-tap confirm doors/amenities
 * while walking the airport. Reports never auto-publish into layouts (M38).
 */

import { kvStoreGet, kvStoreSet } from "@/lib/travelAssistant/kvStore";
import { generateId } from "@/lib/utils/generateId";

const NS = "__map-helper-system__";
const ENABLED_PREFIX = "map-helper-enabled/";
const ENABLED_INDEX = "map-helper-enabled:index";
const REPORT_PREFIX = "map-helper-report:v1/";
const REPORT_INDEX = "map-helper-report:v1:index";
const MAX_INDEX = 2000;

export interface MapHelperUserFlag {
  userId: string;
  enabled: boolean;
  enabledBy: string;
  enabledAt: string;
  note?: string;
}

export type MapHelperReportKind = "confirm_poi" | "confirm_door";
export type MapHelperReportStatus = "pending" | "accepted" | "dismissed";

export interface MapHelperReport {
  id: string;
  kind: MapHelperReportKind;
  status: MapHelperReportStatus;
  iata: string;
  userId: string;
  /** Layout POI id when confirming a pin (Starbucks, Alaska check-in, …). */
  poiId?: string;
  poiName?: string;
  poiCategory?: string;
  doorLabel?: string;
  nodeId?: string;
  /** Helper's position at confirm time [lng, lat]. */
  pos: [number, number];
  accuracyM?: number | null;
  layoutVersion?: string;
  createdAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNote?: string;
}

function enabledKey(userId: string): string {
  return `${ENABLED_PREFIX}${userId}`;
}

function reportKey(id: string): string {
  return `${REPORT_PREFIX}${id}`;
}

export async function isMapHelperEnabled(userId: string): Promise<boolean> {
  if (!userId.trim()) return false;
  const flag = await kvStoreGet<MapHelperUserFlag>(enabledKey(userId), { userId: NS });
  return Boolean(flag?.enabled);
}

export async function setMapHelperEnabled(input: {
  userId: string;
  enabled: boolean;
  enabledBy: string;
  note?: string;
}): Promise<MapHelperUserFlag> {
  const userId = input.userId.trim();
  if (!userId) throw new Error("userId required");
  const now = new Date().toISOString();
  const flag: MapHelperUserFlag = {
    userId,
    enabled: input.enabled,
    enabledBy: input.enabledBy,
    enabledAt: now,
    note: input.note?.trim() || undefined,
  };
  await kvStoreSet(enabledKey(userId), flag, { userId: NS });

  const index = (await kvStoreGet<string[]>(ENABLED_INDEX, { userId: NS })) ?? [];
  const next = input.enabled
    ? [userId, ...index.filter((id) => id !== userId)].slice(0, 500)
    : index.filter((id) => id !== userId);
  await kvStoreSet(ENABLED_INDEX, next, { userId: NS });
  return flag;
}

export async function listMapHelperEnabledUserIds(): Promise<string[]> {
  return (await kvStoreGet<string[]>(ENABLED_INDEX, { userId: NS })) ?? [];
}

export async function getMapHelperFlagsForUsers(
  userIds: string[],
): Promise<Record<string, boolean>> {
  const out: Record<string, boolean> = {};
  await Promise.all(
    userIds.map(async (id) => {
      out[id] = await isMapHelperEnabled(id);
    }),
  );
  return out;
}

export async function submitMapHelperReport(
  input: Omit<MapHelperReport, "id" | "status" | "createdAt">,
): Promise<MapHelperReport> {
  const iata = input.iata.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(iata)) throw new Error("Invalid IATA");
  if (!input.userId.trim()) throw new Error("userId required");
  if (!Array.isArray(input.pos) || input.pos.length !== 2) throw new Error("pos required");

  const report: MapHelperReport = {
    ...input,
    id: generateId(),
    iata,
    status: "pending",
    createdAt: new Date().toISOString(),
  };

  await kvStoreSet(reportKey(report.id), report, { userId: NS });
  const index = (await kvStoreGet<string[]>(REPORT_INDEX, { userId: NS })) ?? [];
  await kvStoreSet(REPORT_INDEX, [report.id, ...index].slice(0, MAX_INDEX), { userId: NS });
  return report;
}

export async function listMapHelperReports(options?: {
  iata?: string;
  status?: MapHelperReportStatus;
  limit?: number;
}): Promise<MapHelperReport[]> {
  const index = (await kvStoreGet<string[]>(REPORT_INDEX, { userId: NS })) ?? [];
  const limit = Math.min(Math.max(options?.limit ?? 100, 1), 300);
  const reports: MapHelperReport[] = [];
  for (const id of index) {
    if (reports.length >= limit) break;
    const report = await kvStoreGet<MapHelperReport>(reportKey(id), { userId: NS });
    if (!report) continue;
    if (options?.iata && report.iata !== options.iata.toUpperCase()) continue;
    if (options?.status && report.status !== options.status) continue;
    reports.push(report);
  }
  return reports;
}

export async function updateMapHelperReportStatus(input: {
  reportId: string;
  status: "accepted" | "dismissed";
  reviewedBy: string;
  adminNote?: string;
}): Promise<MapHelperReport | null> {
  const report = await kvStoreGet<MapHelperReport>(reportKey(input.reportId), { userId: NS });
  if (!report) return null;
  const next: MapHelperReport = {
    ...report,
    status: input.status,
    reviewedAt: new Date().toISOString(),
    reviewedBy: input.reviewedBy,
    adminNote: input.adminNote?.trim() || report.adminNote,
  };
  await kvStoreSet(reportKey(report.id), next, { userId: NS });
  return next;
}
