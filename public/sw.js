const CACHE_VERSION = "kepi-pwa-v1";
const APP_SHELL_CACHE = `${CACHE_VERSION}-app-shell`;
const API_CACHE = `${CACHE_VERSION}-api`;
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const APP_SHELL_ROUTES = ["/", "/travel-assistant"];
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];
const PRECACHE_URLS = PRECACHE_MANIFEST
  .map((entry) => (typeof entry === "string" ? entry : entry?.url))
  .filter((url) => typeof url === "string");

function isApiRequest(url) {
  return url.pathname.startsWith("/api/");
}

function isStaticAsset(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.json" ||
    /\.(?:css|js|png|jpg|jpeg|gif|svg|webp|avif|ico|woff|woff2|ttf)$/u.test(url.pathname)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const shellCache = await caches.open(APP_SHELL_CACHE);
      await shellCache.addAll(APP_SHELL_ROUTES);
      if (PRECACHE_URLS.length > 0) {
        const staticCache = await caches.open(STATIC_CACHE);
        await staticCache.addAll(PRECACHE_URLS);
      }
      self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const expectedCaches = new Set([APP_SHELL_CACHE, API_CACHE, STATIC_CACHE]);
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames.map((cacheName) => {
          if (!expectedCaches.has(cacheName)) {
            return caches.delete(cacheName);
          }
          return Promise.resolve();
        }),
      );
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) {
    return;
  }

  if (isApiRequest(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(API_CACHE);
        try {
          const networkResponse = await fetch(request);
          cache.put(request, networkResponse.clone());
          return networkResponse;
        } catch {
          const cached = await cache.match(request);
          if (cached) {
            return cached;
          }
          return new Response(JSON.stringify({ error: "Offline and no cached API response available." }), {
            status: 503,
            headers: { "Content-Type": "application/json" },
          });
        }
      })(),
    );
    return;
  }

  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const shellCache = await caches.open(APP_SHELL_CACHE);
          shellCache.put(request, response.clone());
          return response;
        } catch {
          const shellCache = await caches.open(APP_SHELL_CACHE);
          return (
            (await shellCache.match(request)) ||
            (await shellCache.match("/travel-assistant")) ||
            (await shellCache.match("/")) ||
            Response.error()
          );
        }
      })(),
    );
    return;
  }

  if (isStaticAsset(url)) {
    event.respondWith(
      (async () => {
        const cache = await caches.open(STATIC_CACHE);
        const cached = await cache.match(request);
        if (cached) {
          return cached;
        }
        const response = await fetch(request);
        cache.put(request, response.clone());
        return response;
      })(),
    );
  }
});

self.addEventListener("push", (event) => {
  let payload = {
    title: "Kepi travel update",
    body: "You have a new travel alert.",
    url: "/travel-assistant",
  };

  if (event.data) {
    try {
      const parsed = event.data.json();
      payload = {
        ...payload,
        ...parsed,
      };
    } catch {
      // Ignore malformed payloads and use defaults.
    }
  }

  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url || "/travel-assistant" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/travel-assistant";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      const existingClient = clientList.find((client) => "focus" in client);
      if (existingClient) {
        existingClient.navigate(url);
        return existingClient.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
