/**
 * Structured benefit playbooks — how to actually use a card benefit at the airport or hotel.
 * Names only; never store PAN or issuer app credentials.
 * Update lounge/airport playbooks via kepi-card-bot skill (same pipeline as cardEarnRules.ts).
 */

export type BenefitEntryMethod =
  | "amex_app_qr"
  | "priority_pass_app"
  | "physical_card"
  | "airline_status"
  | "enrollment_required"
  | "hotel_front_desk";

export interface BenefitPlaybook {
  id: string;
  title: string;
  entryMethod: BenefitEntryMethod;
  requirements: string[];
  steps: string[];
  deepLink?: { label: string; url: string };
  guestPolicy?: string;
}

export interface CardEnrollmentState {
  priorityPassEnrolled?: boolean;
  centurionDigitalReady?: boolean;
  /** Optional per-visit guest tracking for Centurion (0–2 on many U.S. visits). */
  centurionGuestPassesUsedThisVisit?: number;
  /** Optional Priority Pass membership number — never store full card PAN. */
  priorityPassNumber?: string;
}

export const BENEFIT_PLAYBOOKS: Record<string, BenefitPlaybook> = {
  "amex-centurion-lounge": {
    id: "amex-centurion-lounge",
    title: "Centurion Lounge",
    entryMethod: "amex_app_qr",
    requirements: [
      "Valid Amex Platinum or Centurion card on your account",
      "Same-day boarding pass for a departing flight",
      "Guest rules vary by location — confirm at the desk",
    ],
    steps: [
      "Open the Amex app on your phone",
      "Tap Account → Membership → Lounge Access (or search \"Centurion\")",
      "Generate your digital lounge pass / QR for today",
      "At the lounge entrance, show the QR and your same-day boarding pass",
      "If asked, show the physical Platinum card as backup",
    ],
    deepLink: {
      label: "Open Amex app",
      url: "https://apps.apple.com/us/app/amex/id362348516",
    },
    guestPolicy: "Platinum: typically 2 guests on many U.S. visits when flying eligible airlines — confirm at door.",
  },
  "amex-priority-pass": {
    id: "amex-priority-pass",
    title: "Priority Pass (via Amex Platinum)",
    entryMethod: "priority_pass_app",
    requirements: [
      "Enroll Priority Pass in your Amex online account (one-time)",
      "Same-day boarding pass usually required",
      "Select lounges only — not every club at every airport",
    ],
    steps: [
      "Enroll Priority Pass at americanexpress.com if you have not already",
      "Download the Priority Pass app and sign in with your membership number",
      "Search the airport code and pick the lounge you want",
      "Show the app QR code and boarding pass at the lounge front desk",
    ],
    deepLink: {
      label: "Priority Pass app",
      url: "https://www.prioritypass.com/apps",
    },
    guestPolicy: "Platinum includes 2 complimentary guests at many Priority Pass visits — policy varies by lounge.",
  },
  "delta-sky-club-amex": {
    id: "delta-sky-club-amex",
    title: "Delta Sky Club (Amex Platinum)",
    entryMethod: "amex_app_qr",
    requirements: [
      "Flying Delta same day on a qualifying ticket",
      "Amex Platinum — guest access rules tightened in 2025; check current policy",
    ],
    steps: [
      "Confirm you are on a same-day Delta departure",
      "Open Amex app → Lounge Access and select Delta Sky Club if offered",
      "Show digital pass + boarding pass at Sky Club entrance",
    ],
    guestPolicy: "Guest access for Platinum changed — verify current Delta/Amex rules before bringing companions.",
  },
  "hyatt-elite-checkin": {
    id: "hyatt-elite-checkin",
    title: "World of Hyatt elite check-in",
    entryMethod: "hotel_front_desk",
    requirements: ["World of Hyatt status from your card or stays", "Reservation linked to your Hyatt number"],
    steps: [
      "Look for World of Hyatt / elite member signage at check-in",
      "Give your name and say you are Discoverist / Explorist / Globalist",
      "Ask about room type upgrades if your tier includes them",
    ],
  },
  "alaska-priority-lanes": {
    id: "alaska-priority-lanes",
    title: "Alaska priority check-in & boarding",
    entryMethod: "airline_status",
    requirements: ["MVP, MVP Gold, or higher on Alaska Mileage Plan"],
    steps: [
      "Use the Alaska priority / first class check-in counter",
      "Board when your priority group is called on the gate display",
    ],
  },
  "ita-executive-lounge-fco": {
    id: "ita-executive-lounge-fco",
    title: "ITA Airways Executive Lounge (FCO)",
    entryMethod: "airline_status",
    requirements: [
      "Same-day ITA Airways or SkyTeam departure from FCO",
      "Volare Executive / Premium Plus status, or business/first on qualifying fare",
    ],
    steps: [
      "Confirm you are flying ITA or SkyTeam same day from Terminal 1",
      "After security, follow signs to ITA Airways Executive Lounge",
      "Show boarding pass and Volare card or status proof at the entrance",
      "Guest access depends on your Volare tier — confirm at the desk",
    ],
    guestPolicy: "Guest rules vary by Volare tier and fare — ask at the lounge entrance.",
  },
};

export function getBenefitPlaybook(id: string): BenefitPlaybook | null {
  return BENEFIT_PLAYBOOKS[id] ?? null;
}

export function playbooksForCard(cardId: string): BenefitPlaybook[] {
  switch (cardId) {
    case "amex-platinum":
      return [
        BENEFIT_PLAYBOOKS["amex-centurion-lounge"],
        BENEFIT_PLAYBOOKS["amex-priority-pass"],
        BENEFIT_PLAYBOOKS["delta-sky-club-amex"],
      ].filter((entry): entry is BenefitPlaybook => Boolean(entry));
    case "hyatt-card":
      return [BENEFIT_PLAYBOOKS["hyatt-elite-checkin"]].filter((entry): entry is BenefitPlaybook =>
        Boolean(entry),
      );
    default:
      return [];
  }
}

/** Filter playbooks when user has not completed issuer enrollment steps. */
export function filterPlaybooksByEnrollment(
  playbooks: BenefitPlaybook[],
  enrollment: CardEnrollmentState | undefined,
): BenefitPlaybook[] {
  return playbooks.filter((playbook) => {
    if (playbook.id === "amex-priority-pass" && enrollment?.priorityPassEnrolled === false) {
      return false;
    }
    if (playbook.entryMethod === "amex_app_qr" && enrollment?.centurionDigitalReady === false) {
      return false;
    }
    return true;
  });
}

export function enrollmentHintsForCard(cardId: string): Array<{ key: keyof CardEnrollmentState; label: string }> {
  if (cardId === "amex-platinum") {
    return [
      {
        key: "priorityPassEnrolled",
        label: "Priority Pass enrolled on this card (one-time at Amex.com)",
      },
      {
        key: "centurionDigitalReady",
        label: "Amex app set up — I can generate lounge QR codes",
      },
      {
        key: "centurionGuestPassesUsedThisVisit",
        label: "Centurion guest passes used this visit (optional counter)",
      },
      {
        key: "priorityPassNumber",
        label: "Priority Pass membership number (optional — not your card number)",
      },
    ];
  }
  return [];
}

export function entryMethodLabel(method: BenefitEntryMethod): string {
  switch (method) {
    case "amex_app_qr":
      return "Show QR in Amex app";
    case "priority_pass_app":
      return "Show QR in Priority Pass app";
    case "physical_card":
      return "Show physical card";
    case "airline_status":
      return "Use elite status lanes";
    case "enrollment_required":
      return "Enroll first";
    case "hotel_front_desk":
      return "At hotel check-in";
    default:
      return "At venue";
  }
}

const ENROLLMENT_STEPS: Record<string, string[]> = {
  "amex-priority-pass": [
    "Enroll Priority Pass once at americanexpress.com → your Platinum card benefits",
    "Download the Priority Pass app and sign in with your membership number",
    "Mark \"Priority Pass enrolled\" in Card wallet — Kepi will show lounge QR steps next time",
  ],
  "amex-centurion-lounge": [
    "Install the Amex app and sign in with your Platinum account",
    "Open Account → Membership → Lounge Access and confirm you can generate a QR pass",
    "Mark \"Amex app set up\" in Card wallet — we will show Centurion entry steps at the airport",
  ],
  "delta-sky-club-amex": [
    "Install the Amex app before your Delta departure",
    "Confirm Delta Sky Club access appears under Lounge Access for today's flight",
  ],
};

export interface LoungePlaybookApplication {
  entryMethod?: BenefitEntryMethod;
  entrySteps?: string[];
  deepLink?: { label: string; url: string };
  guestPolicy?: string;
  enrollmentRequired?: boolean;
  enrollmentReason?: string;
}

/** Adjust lounge entry steps when issuer enrollment is incomplete. */
export function applyEnrollmentToPlaybook(
  playbook: BenefitPlaybook | null,
  enrollment: CardEnrollmentState | undefined,
): LoungePlaybookApplication {
  if (!playbook) return {};

  if (playbook.id === "amex-priority-pass" && enrollment?.priorityPassEnrolled !== true) {
    return {
      entryMethod: "enrollment_required",
      entrySteps: ENROLLMENT_STEPS["amex-priority-pass"],
      deepLink: playbook.deepLink,
      guestPolicy: playbook.guestPolicy,
      enrollmentRequired: true,
      enrollmentReason: "Enroll Priority Pass on your Amex account first",
    };
  }

  if (playbook.entryMethod === "amex_app_qr" && enrollment?.centurionDigitalReady !== true) {
    return {
      entryMethod: "enrollment_required",
      entrySteps: ENROLLMENT_STEPS[playbook.id] ?? ENROLLMENT_STEPS["amex-centurion-lounge"],
      deepLink: playbook.deepLink,
      guestPolicy: playbook.guestPolicy,
      enrollmentRequired: true,
      enrollmentReason: "Set up the Amex app to generate your lounge QR",
    };
  }

  let guestPolicy = playbook.guestPolicy;
  if (
    playbook.id === "amex-centurion-lounge" &&
    typeof enrollment?.centurionGuestPassesUsedThisVisit === "number" &&
    enrollment.centurionGuestPassesUsedThisVisit >= 2
  ) {
    guestPolicy = "You marked 2 guest passes used this visit — additional guests may pay a fee at the desk.";
  }

  return {
    entryMethod: playbook.entryMethod,
    entrySteps: playbook.steps,
    deepLink: playbook.deepLink,
    guestPolicy,
    enrollmentRequired: false,
  };
}

/** Merge enrollment state from all owned cards that map to a playbook's card benefits. */
export function mergeEnrollmentForPlaybook(
  playbookId: string | undefined,
  cardEnrollments: Record<string, CardEnrollmentState> | undefined,
): CardEnrollmentState | undefined {
  if (!playbookId || !cardEnrollments) return undefined;

  const cardIds =
    playbookId === "amex-priority-pass" || playbookId === "amex-centurion-lounge" || playbookId === "delta-sky-club-amex"
      ? ["amex-platinum"]
      : [];

  if (cardIds.length === 0) return undefined;

  const merged: CardEnrollmentState = {};
  for (const cardId of cardIds) {
    const entry = cardEnrollments[cardId];
    if (!entry) continue;
    if (entry.priorityPassEnrolled === true) merged.priorityPassEnrolled = true;
    if (entry.centurionDigitalReady === true) merged.centurionDigitalReady = true;
    if (typeof entry.centurionGuestPassesUsedThisVisit === "number") {
      merged.centurionGuestPassesUsedThisVisit = entry.centurionGuestPassesUsedThisVisit;
    }
    if (entry.priorityPassNumber?.trim()) merged.priorityPassNumber = entry.priorityPassNumber.trim();
  }
  return Object.keys(merged).length > 0 ? merged : undefined;
}
