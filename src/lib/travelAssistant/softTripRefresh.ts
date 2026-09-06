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
