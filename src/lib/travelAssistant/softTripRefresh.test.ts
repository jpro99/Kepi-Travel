import assert from "node:assert/strict";
import test from "node:test";
import {
  resolveSnapshotApplyOptions,
  shouldShowTripShellSkeleton,
} from "@/lib/travelAssistant/softTripRefresh";

test("shouldShowTripShellSkeleton is true only before first hydrate", () => {
  assert.equal(
    shouldShowTripShellSkeleton({ tripsInitialLoading: true, tripsHydrated: false }),
    true,
  );
  assert.equal(
    shouldShowTripShellSkeleton({ tripsInitialLoading: true, tripsHydrated: true }),
    false,
  );
  assert.equal(
    shouldShowTripShellSkeleton({ tripsInitialLoading: false, tripsHydrated: true }),
    false,
  );
});

test("background poll after hydrate applies snapshot silently", () => {
  const options = resolveSnapshotApplyOptions({ background: true, tripsHydrated: true });
  assert.equal(options.silent, true);
  assert.equal(options.markHydrated, false);
});

test("initial load is not silent and marks hydrated", () => {
  const options = resolveSnapshotApplyOptions({ background: false, tripsHydrated: false });
  assert.equal(options.silent, false);
  assert.equal(options.markHydrated, true);
});
