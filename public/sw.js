const CACHE_NAME = "abandon-pwa-v2";
const APP_SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./favicon.ico",
  "./apple-touch-icon.png",
];

function isSameOrigin(request) {
  return new URL(request.url).origin === self.location.origin;
}

function shouldCacheAsset(request) {
  const { pathname } = new URL(request.url);
  return (
    request.mode === "navigate" ||
    /\.(?:html|js|css|json|webmanifest|ico|png|svg|woff2?)$/i.test(pathname)
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const response = await fetch(request);
    if (response && response.ok) {
      cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cached = await cache.match(request);
    if (cached) {
      return cached;
    }

    if (request.mode === "navigate") {
      return cache.match("./index.html");
    }

    throw error;
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key))
      )
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || !isSameOrigin(event.request)) {
    return;
  }

  if (!shouldCacheAsset(event.request)) {
    return;
  }

  event.respondWith(networkFirst(event.request));
});
