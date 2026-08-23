import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import {
  isStaleBundleError,
  recoverStaleClientBundle,
  TDZ_RELOAD_KEY,
} from "./recoverStaleClientBundle";

test("I56: TDZ red-screen is a stale-bundle error", () => {
  assert.equal(
    isStaleBundleError({ message: "Cannot access 'M' before initialization" }),
    true,
  );
  assert.equal(
    isStaleBundleError({ message: "Cannot access 's1' before initialization" }),
    true,
  );
  assert.equal(isStaleBundleError({ message: "Network error" }), false);
});

test("I56: ChunkLoadError after deploy is a stale-bundle error", () => {
  assert.equal(
    isStaleBundleError({
      name: "ChunkLoadError",
      message:
        "Loading chunk 8300 failed.\n(error: https://kepitravel.com/_next/static/chunks/8300.1801a0595542a367.js)",
    }),
    true,
  );
  assert.equal(
    isStaleBundleError({ message: "Failed to fetch dynamically imported module: https://kepitravel.com/_next/static/chunks/foo.js" }),
    true,
  );
});

test("I56: first TDZ recover clears caches and reloads once", async () => {
  const storage = new Map<string, string>();
  const deleted: string[] = [];
  let reloads = 0;
  let unregistered = 0;
  let clearedMessage = false;

  const recovered = await recoverStaleClientBundle({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
    caches: {
      keys: async () => ["kepi-pwa-v37-static"],
      delete: async (key) => {
        deleted.push(String(key));
        return true;
      },
    },
    serviceWorker: {
      controller: {
        postMessage: (data: unknown) => {
          if (data === "CLEAR_ALL_CACHES") clearedMessage = true;
        },
      } as ServiceWorker,
      getRegistrations: async () => [
        {
          unregister: async () => {
            unregistered += 1;
            return true;
          },
        } as ServiceWorkerRegistration,
      ],
    },
    reload: () => {
      reloads += 1;
    },
  });

  assert.equal(recovered, true);
  assert.equal(storage.get(TDZ_RELOAD_KEY), "1");
  assert.equal(clearedMessage, true);
  assert.equal(unregistered, 1);
  assert.deepEqual(deleted, ["kepi-pwa-v37-static"]);
  assert.equal(reloads, 1);

  const second = await recoverStaleClientBundle({
    storage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => {
        storage.set(key, value);
      },
    },
    reload: () => {
      reloads += 1;
    },
  });
  assert.equal(second, false);
  assert.equal(reloads, 1);
});

test("I56: error page recovers a TDZ instead of remounting the same JS", () => {
  const src = readFileSync(join(process.cwd(), "src/app/error.tsx"), "utf8");
  assert.match(src, /isStaleBundleError\(error\)/);
  assert.match(src, /recoverStaleClientBundle/);
  const sw = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");
  assert.match(sw, /kepi-pwa-v39/);
  const layout = readFileSync(join(process.cwd(), "src/app/layout.tsx"), "utf8");
  assert.match(layout, /<DeployRefresh/);
  const page = readFileSync(join(process.cwd(), "src/app/travel-assistant/page.tsx"), "utf8");
  assert.match(page, /PlanTabErrorBoundary/);
});
