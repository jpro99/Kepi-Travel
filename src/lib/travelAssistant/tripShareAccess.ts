import "server-only";

import { auth } from "@clerk/nextjs/server";
import { getShareRecord } from "@/lib/travelAssistant/tripShareStore";

export type ShareViewerGate =
  | { status: "ok"; userId: string | null }
  | { status: "sign-in-required"; intendedEmail: string }
  | { status: "email-mismatch"; intendedEmail: string }
  | { status: "invalid" };

function isExpired(expiresAt: string): boolean {
  const expiresAtMs = Date.parse(expiresAt);
  return Number.isNaN(expiresAtMs) || expiresAtMs < Date.now();
}

export async function getClerkUserEmails(userId: string): Promise<string[]> {
  try {
    const { clerkClient } = await import("@clerk/nextjs/server");
    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    return user.emailAddresses.map((entry) => entry.emailAddress.toLowerCase());
  } catch {
    return [];
  }
}

export function maskEmail(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf("@");
  if (at <= 0) return "your invited email";
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}${local.length > 1 ? "•••" : ""}@${domain}`;
}

export async function resolveShareViewerGate(token: string): Promise<ShareViewerGate> {
  const normalizedToken = token.trim();
  const record = await getShareRecord(normalizedToken);
  if (!record || record.revokedAt || isExpired(record.expiresAt)) {
    return { status: "invalid" };
  }

  const intendedEmail = record.intendedEmail?.trim().toLowerCase() ?? null;
  const { userId } = await auth();

  if (!intendedEmail) {
    return { status: "ok", userId: userId ?? null };
  }

  if (!userId) {
    return { status: "sign-in-required", intendedEmail };
  }

  const userEmails = await getClerkUserEmails(userId);
  if (!userEmails.includes(intendedEmail)) {
    return { status: "email-mismatch", intendedEmail };
  }

  return { status: "ok", userId };
}

export async function assertShareViewerEmailAccess(
  token: string,
  requesterUserId: string | null | undefined,
): Promise<boolean> {
  const record = await getShareRecord(token.trim());
  if (!record || record.revokedAt || isExpired(record.expiresAt)) {
    return false;
  }

  const intendedEmail = record.intendedEmail?.trim().toLowerCase() ?? null;
  if (!intendedEmail) {
    return true;
  }

  if (!requesterUserId) {
    return false;
  }

  const userEmails = await getClerkUserEmails(requesterUserId);
  return userEmails.includes(intendedEmail);
}
