/**
 * Defines the structure for a Kepi Pass, a premium digital gift for application access.
 */
export interface KepiPass {
  // A unique, secure identifier for the pass, prefixed with `kp_`.
  id: string;

  // The type of the pass, determining the level of access granted.
  type: "GOLDEN" | "SILVER";

  // The current status of the pass lifecycle.
  status: "new" | "sent" | "redeemed";

  // The Clerk User ID of the admin who generated the pass.
  createdBy: string;

  // The timestamp when the pass was created.
  createdAt: string;

  // The email address of the intended recipient.
  // This is used to lock the pass to a specific user.
  intendedEmail: string;

  // Optional note from the sender.
  note?: string;

  // The Clerk User ID of the user who redeemed the pass.
  redeemedBy?: string;

  // The timestamp when the pass was redeemed.
  redeemedAt?: string;
}
