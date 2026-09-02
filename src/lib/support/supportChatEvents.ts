/** Support chat → travel shell: import a scanned ticket onto the active trip. */
export const SUPPORT_TICKET_SCAN_EVENT = "kepi:support-ticket-scan";

export function dispatchSupportTicketScan(file: File): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(SUPPORT_TICKET_SCAN_EVENT, { detail: { file } }));
}
