import "server-only";

import { NextResponse } from "next/server";
import { resolveAuthenticatedUserId } from "@/lib/admin/adminAccess";
import { logger } from "@/lib/logger";
import { enforceRateLimit } from "@/lib/rateLimit";
import { classifyBugReport } from "@/lib/support/bugClassifier";
import { createGitHubIssue } from "@/lib/support/githubIssue";
import { buildOwnerAlertSms, sendSms } from "@/lib/support/smsSender";
import { generateId } from "@/lib/utils/generateId";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Max screenshot size accepted from FormData (5 MB)
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024;

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id")?.trim() || generateId();
  const userId = await resolveAuthenticatedUserId();
  const routeLogger = logger.withContext({
    requestId,
    userId,
    route: "/api/support/bug-report",
  });

  if (!userId) {
    return NextResponse.json({ error: "Sign in required to submit a bug report." }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit({
    policyName: "bug-report",
    identifier: userId,
    route: "/api/support/bug-report",
    requestId,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many reports. Please wait a few minutes before trying again." },
      { status: 429, headers: rateLimit.headers },
    );
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const category = String(formData.get("category") ?? "other").trim().slice(0, 40);
  const whatHappened = String(formData.get("whatHappened") ?? "").trim().slice(0, 2000);
  const whatExpected = String(formData.get("whatExpected") ?? "").trim().slice(0, 1000);
  const reportedUrl = String(formData.get("url") ?? "").trim().slice(0, 500);
  const userAgent = String(formData.get("userAgent") ?? "").trim().slice(0, 300);

  if (!whatHappened) {
    return NextResponse.json({ error: "Please describe what happened." }, { status: 422 });
  }

  // Pull screenshot if attached
  let screenshotBase64: string | null = null;
  const screenshotEntry = formData.get("screenshot");
  if (screenshotEntry instanceof File && screenshotEntry.size > 0) {
    if (screenshotEntry.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: "Screenshot must be under 5 MB." }, { status: 413 });
    }
    const arrayBuffer = await screenshotEntry.arrayBuffer();
    screenshotBase64 = `data:${screenshotEntry.type};base64,${Buffer.from(arrayBuffer).toString("base64")}`;
  }

  const ticketId = generateId().toUpperCase().slice(0, 8);

  // AI triage
  const classification = await classifyBugReport({
    category,
    whatHappened,
    whatExpected,
    url: reportedUrl,
    userAgent,
    hasScreenshot: screenshotBase64 !== null,
  });

  routeLogger.info("Bug report classified.", {
    ticketId,
    userId,
    confidence: classification.confidence,
    isCodeBug: classification.isCodeBug,
    label: classification.suggestedLabel,
  });

  // Build GitHub issue body
  const issueBody = [
    `**Category:** ${category}`,
    `**Confidence:** ${classification.confidence}`,
    `**Suggested label:** ${classification.suggestedLabel}`,
    classification.suggestedFile ? `**Suggested file:** \`${classification.suggestedFile}\`` : null,
    "",
    "## What happened",
    whatHappened,
    "",
    "## What was expected",
    whatExpected || "(not provided)",
    "",
    "## Diagnostics",
    `- Ticket ID: ${ticketId}`,
    `- User ID hash: ${userId.slice(0, 8)}…`,
    `- URL: ${reportedUrl || "(unknown)"}`,
    `- User agent: ${userAgent.slice(0, 120) || "(unknown)"}`,
    `- Has screenshot: ${screenshotBase64 !== null}`,
    "",
    screenshotBase64
      ? `## Screenshot\n![Screenshot](${screenshotBase64.length > 50000 ? "(too large to embed — see attachment)" : screenshotBase64})`
      : "_No screenshot attached._",
    "",
    `---`,
    `_Auto-filed by Kepi bug report pipeline. Ticket #${ticketId}._`,
  ]
    .filter((line) => line !== null)
    .join("\n");

  // File GitHub issue (if configured)
  const githubLabels = [
    "user-bug",
    classification.suggestedLabel !== "bug" ? classification.suggestedLabel : null,
    classification.confidence === "high" ? "priority-high" : null,
  ].filter(Boolean) as string[];

  const issue = await createGitHubIssue({
    title: `[${classification.confidence.toUpperCase()}] ${classification.summary}`,
    body: issueBody,
    labels: githubLabels,
  });

  const githubConfigured = Boolean(
    process.env.GITHUB_TOKEN?.trim() || process.env.BUG_REPORT_GITHUB_TOKEN?.trim(),
  );
  const twilioConfigured = Boolean(
    process.env.TWILIO_ACCOUNT_SID?.trim() &&
      process.env.TWILIO_AUTH_TOKEN?.trim() &&
      process.env.TWILIO_FROM_NUMBER?.trim(),
  );

  // SMS Jeff if real code bug
  const ownerPhone = process.env.OWNER_PHONE_NUMBER?.trim() || process.env.JEFF_PHONE_NUMBER?.trim();
  let smsSent = false;
  if (classification.isCodeBug && ownerPhone) {
    const smsBody = buildOwnerAlertSms({
      ticketId,
      summary: classification.summary,
      confidence: classification.confidence,
      category,
      issueUrl: issue?.url ?? null,
    });
    smsSent = await sendSms({ to: ownerPhone, body: smsBody });
    routeLogger.info("Owner SMS sent.", { smsSent, issueNumber: issue?.number ?? null });
  } else {
    routeLogger.info("SMS skipped.", {
      isCodeBug: classification.isCodeBug,
      hasOwnerPhone: Boolean(ownerPhone),
    });
  }

  const filingWarnings: string[] = [];
  if (!githubConfigured) {
    filingWarnings.push(
      "GitHub issue filing is not configured — set GITHUB_TOKEN or BUG_REPORT_GITHUB_TOKEN on Vercel and in .env.local.",
    );
  } else if (!issue) {
    filingWarnings.push("GitHub issue filing failed — check token scope (issues:write on jpro99/Kepi-Travel).");
  }
  if (classification.isCodeBug && !ownerPhone) {
    filingWarnings.push(
      "Owner SMS phone is not configured — set OWNER_PHONE_NUMBER (or JEFF_PHONE_NUMBER) on Vercel and in .env.local.",
    );
  } else if (classification.isCodeBug && ownerPhone && !smsSent && !twilioConfigured) {
    filingWarnings.push(
      "Twilio SMS is not configured — set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    );
  }

  const userMessage = classification.isCodeBug
    ? smsSent
      ? "Thanks — we've filed a bug and Jeff is being notified. We'll have AI look at it right away."
      : issue
        ? "Thanks — your report has been filed. The team will review it shortly."
        : filingWarnings.length > 0
          ? "Thanks — we saved your report, but automatic filing is not fully configured yet."
          : "Thanks — your report has been filed. The team will review it shortly."
    : "Thanks for the report. It looks like this might not be a code error — our team will review and follow up if needed.";

  return NextResponse.json(
    {
      ticketId,
      message: userMessage,
      confidence: classification.confidence,
      isCodeBug: classification.isCodeBug,
      issueUrl: issue?.url ?? null,
      issueNumber: issue?.number ?? null,
      githubIssueCreated: Boolean(issue),
      smsSent,
      filingWarnings,
    },
    { headers: rateLimit.headers },
  );
}
