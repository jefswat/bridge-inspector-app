const CACHE_NAME = "photo-vault-v75";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./report.js",
  "./basemap.js",
  "./map.html",
  "./map.js",
  "./styles.css",
  "./manifest.webmanifest",
  "./icons/icon.svg",
  "./icons/icon-maskable.svg",
  "./vendor/leaflet.css",
  "./vendor/leaflet.js",
  "./vendor/piexif.min.js",
  "./vendor/jszip.min.js",
  "./vendor/togeojson.umd.min.js",
  "./vendor/docx.umd.js",
  "./vendor/qrcode.min.js",
  "./vendor/jsqr.min.js",
  "./vendor/cv.js",
  "./vendor/aruco.js",
  "./vendor/apriltag_36h11.js"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  const url = new URL(e.request.url);
  // NBI lookup data: network-only, never cache (files are large and static on disk)
  if (url.pathname.includes("/nbi/")) return;
  if (url.origin !== self.location.origin) {
    e.respondWith(
      fetch(e.request).then((r) => {
        const clone = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return r;
      }).catch(async () => {
        const cached = await caches.match(e.request, { ignoreSearch: true });
        return cached || Response.error();
      })
    );
    return;
  }
  // Local assets: cache-first
  e.respondWith(
    (async () => {
      // ignoreSearch lets styles.css?v=... resolve to cached ./styles.css
      const cached =
        (await caches.match(e.request, { ignoreSearch: true })) ||
        (await caches.match(url.pathname, { ignoreSearch: true })) ||
        (await caches.match("." + url.pathname, { ignoreSearch: true }));
      if (cached) return cached;
      try {
        const r = await fetch(e.request);
        caches.open(CACHE_NAME).then((c) => c.put(e.request, r.clone()));
        return r;
      } catch {
        if (e.request.mode === "navigate") {
          return (
            (await caches.match("./index.html", { ignoreSearch: true })) ||
            (await caches.match("./", { ignoreSearch: true })) ||
            Response.error()
          );
        }
        return new Response("", { status: 503, statusText: "Offline (asset not cached)" });
      }
    })()
  );
});
