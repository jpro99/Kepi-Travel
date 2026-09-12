/** Kepi Help / Support chat shell — layer order and open/close events. */

export const SUPPORT_CHAT_OPEN_EVENT = "kepi:support-chat-open";
export const SUPPORT_CHAT_CLOSE_EVENT = "kepi:support-chat-close";

/** Portaled mobile tab bar (`MobileTabBar.tsx`). Help must render above it. */
export const MOBILE_TAB_BAR_Z_INDEX = 99999;

/** Full-screen help sheet — always above tab bar so the text field stays tappable. */
export const SUPPORT_CHAT_Z_INDEX = 100001;

export function dispatchSupportChatOpen(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPORT_CHAT_OPEN_EVENT));
}

export function dispatchSupportChatClose(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(SUPPORT_CHAT_CLOSE_EVENT));
}
