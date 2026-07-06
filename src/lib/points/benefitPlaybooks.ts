/**
 * Structured benefit playbooks — how to actually use a card benefit at the airport or hotel.
 * Names only; never store PAN or issuer app credentials.
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
      url: "https://www.americanexpress.com/us/customer-service/digital/amex-mobile-app.html",
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
