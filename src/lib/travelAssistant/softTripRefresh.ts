/**
 * Apple-style trip sync: initial hydrate may show a skeleton; background polls
 * must never block Home or wipe scroll/focus/sheets.
 */

export interface SoftTripRefreshState {
  /** True only while the first trip list hydrate is in flight. */
  tripsInitialLoading: boolean;
  /** True once any successful trip snapshot has been applied. */
  tripsHydrated: boolean;
}

export function shouldShowTripShellSkeleton(state: SoftTripRefreshState): boolean {
  return state.tripsInitialLoading && !state.tripsHydrated;
}

export function resolveSnapshotApplyOptions(input: {
  background?: boolean;
  tripsHydrated: boolean;
}): { silent: boolean; markHydrated: boolean } {
  const silent = Boolean(input.background && input.tripsHydrated);
  return {
    silent,
    markHydrated: !input.tripsHydrated,
  };
}

/** iPhone-first: skip background work when tab is hidden or offline. */
export function shouldRunForegroundSoftRefresh(now?: {
  online?: boolean;
  visibilityState?: DocumentVisibilityState;
}): boolean {
  const online = now?.online ?? (typeof navigator !== "undefined" ? navigator.onLine : true);
  const visibility =
    now?.visibilityState ??
    (typeof document !== "undefined" ? document.visibilityState : "visible");
  return online && visibility === "visible";
}
