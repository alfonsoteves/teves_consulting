const AION_PWA_CACHE = "aion-pwa-static-v2026-07-26-1";

const AION_SHELL_URLS = [
  "/aion.html",
  "/es/aion.html",
  "/offline.html",
  "/manifest.webmanifest",
  "/favicon.ico",
  "/apple-touch-icon.png",
  "/android-chrome-192x192.png",
  "/android-chrome-512x512.png",
  "/assets/images/t-logo-white.png",
  "/assets/js/aion-pwa.js"
];

const AION_STATIC_PATHS = new Set(AION_SHELL_URLS);
const AION_NAVIGATION_PATHS = new Set(["/", "/aion.html", "/es/aion.html"]);

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(AION_PWA_CACHE).then((cache) => cache.addAll(AION_SHELL_URLS))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((cacheName) => cacheName.startsWith("aion-pwa-static-"))
          .filter((cacheName) => cacheName !== AION_PWA_CACHE)
          .map((cacheName) => caches.delete(cacheName))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "AION_SKIP_WAITING") {
    self.skipWaiting();
  }
});

function isAdminPath(pathname) {
  return pathname === "/admin.html" || pathname.startsWith("/admin/");
}

function isSafeStaticPath(pathname) {
  return (
    AION_STATIC_PATHS.has(pathname) ||
    pathname.startsWith("/assets/images/") ||
    pathname.startsWith("/assets/js/")
  );
}

async function fetchAndCache(request) {
  const response = await fetch(request);

  if (response && response.ok && response.type === "basic") {
    const cache = await caches.open(AION_PWA_CACHE);
    await cache.put(request, response.clone());
  }

  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin || isAdminPath(url.pathname)) {
    return;
  }

  if (request.mode === "navigate") {
    if (!AION_NAVIGATION_PATHS.has(url.pathname)) {
      return;
    }

    event.respondWith(
      fetchAndCache(request).catch(async () => {
        const cachedShell = await caches.match(
          url.pathname === "/es/aion.html" ? "/es/aion.html" : "/aion.html"
        );
        return cachedShell || caches.match("/offline.html");
      })
    );
    return;
  }

  if (!isSafeStaticPath(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        event.waitUntil(fetchAndCache(request).catch(() => undefined));
        return cachedResponse;
      }

      return fetchAndCache(request).catch(() => caches.match("/offline.html"));
    })
  );
});
