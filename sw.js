const CACHE_NAME = "photo-vault-v186";
const ASSETS = [
  "./",
  "./index.html",
  "./app.js",
  "./ifc-viewer.js",
  "./crs-us.js",
  "./ifc-export.js",
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
  "./vendor/apriltag_36h11.js",
  "./vendor/proj4.js",
  "./vendor/web-ifc-api.js",
  "./vendor/web-ifc.wasm"
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)));
  self.skipWaiting();
});

// On-demand county/regional CRS bundle: kept in its own cache that survives app
// updates, so a download made once (with signal) keeps working offline.
// Bump together with IFCViewer.EXTRA_CRS_VERSION when crs-us-extra.js changes
// (the page prefetches into "crs-extra-v" + that version).
const CRS_EXTRA_CACHE = "crs-extra-v1";

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME && k !== CRS_EXTRA_CACHE).map((k) => caches.delete(k)))
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
  if (url.pathname.endsWith("/crs-us-extra.js")) {
    e.respondWith(
      (async () => {
        const cache = await caches.open(CRS_EXTRA_CACHE);
        const cached = await cache.match(e.request, { ignoreSearch: true });
        if (cached) return cached;
        const r = await fetch(e.request);
        if (r.ok) cache.put(e.request, r.clone());
        return r;
      })()
    );
    return;
  }
  // HTML navigations: network-first to avoid stale page/app mismatches.
  if (e.request.mode === "navigate") {
    e.respondWith(
      (async () => {
        try {
          const r = await fetch(e.request);
          const clone = r.clone();
          caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
          return r;
        } catch {
          return (
            (await caches.match(e.request, { ignoreSearch: true })) ||
            (await caches.match("./index.html", { ignoreSearch: true })) ||
            (await caches.match("./", { ignoreSearch: true })) ||
            Response.error()
          );
        }
      })()
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
        const clone = r.clone();
        caches.open(CACHE_NAME).then((c) => c.put(e.request, clone));
        return r;
      } catch {
        return new Response("", { status: 503, statusText: "Offline (asset not cached)" });
      }
    })()
  );
});
