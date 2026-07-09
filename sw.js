const CACHE_NAME = "photo-vault-v60";
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
  "./vendor/qrcode.min.js"
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
      }).catch(() => caches.match(e.request))
    );
    return;
  }
  // Local assets: cache-first
  e.respondWith(
    caches.match(e.request).then((cached) =>
      cached ?? fetch(e.request).then((r) => {
        caches.open(CACHE_NAME).then((c) => c.put(e.request, r.clone()));
        return r;
      })
    )
  );
});
