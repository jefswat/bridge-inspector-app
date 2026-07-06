const BUILD_STAMP = "2026-07-06 09:30:00";

// ── Photo tags (mirror of app.js) ─────────────────────────────────────────────
const TAG_CATEGORIES = [
  { key: "general",    label: "General" },
  { key: "structure",  label: "Structure in Photo" },
  { key: "issues",     label: "Issues" },
  { key: "directions", label: "Direction" },
];
function tagsSummaryHtml(tags) {
  if (!tags) return "";
  const parts = [];
  for (const cat of TAG_CATEGORIES) {
    const vals = tags[cat.key];
    if (Array.isArray(vals) && vals.length) {
      const chips = vals.map((v) => `<span class="tag-chip static cat-${cat.key}">${escapeHtml(v)}</span>`).join(" ");
      parts.push(`<div class="tag-summary-group"><span class="tag-summary-label">${cat.label}:</span> ${chips}</div>`);
    }
  }
  return parts.join("");
}

// ── Shared storage constants (must match app.js) ──────────────────────────────
const DB_NAME    = "photo-vault-pwa";
const STORE_NAME = "photos";
const META_STORE = "meta";
const BRIDGE_STORE = "bridges";
const DB_VERSION = 3;
const KML_META_KEY = "kmlOverlay";
const ACTIVE_BRIDGE_KEY = "active-bridge-id";

let db;
let summaryMap;
let markerById = new Map();     // record.id -> Leaflet marker
let selectedId = null;
let activeBridgeId = null;

const summaryStatus = document.getElementById("summaryStatus");
const photoDetail   = document.getElementById("photoDetail");
const detailImg     = document.getElementById("detailImg");
const detailMeta    = document.getElementById("detailMeta");
const detailClose   = document.getElementById("detailClose");

init().catch((e) => { summaryStatus.textContent = "Startup failed: " + e.message; console.error(e); });

async function init() {
  const bs = document.getElementById("buildStamp");
  if (bs) bs.textContent = "build " + BUILD_STAMP;

  summaryMap = L.map("summaryMap", { scrollWheelZoom: true, maxZoom: 22 });
  addEsriBasemap(summaryMap);
  summaryMap.setView([39.5, -98.35], 4); // continental US until we have points

  detailClose.addEventListener("click", closeDetail);
  summaryMap.on("click", () => closeDetail());
  registerServiceWorker();

  db = await openDatabase();
  activeBridgeId = localStorage.getItem(ACTIVE_BRIDGE_KEY) || null;
  const bridge = activeBridgeId ? await getBridgeRec(activeBridgeId) : null;
  if (bridge) {
    const bs2 = document.querySelector("h1");
    if (bs2 && !document.getElementById("bridgeMapName")) {
      const span = document.createElement("span");
      span.id = "bridgeMapName";
      span.style.cssText = "font-size:.9rem;font-weight:600;opacity:.85;margin-left:8px;";
      span.textContent = "· " + (bridge.title || "");
      bs2.appendChild(span);
    }
  }
  await restoreCadOverlay(bridge);
  // Default the map to the bridge's own location (e.g. imported from the NBI)
  // so it's centered there before any located photos exist.
  if (bridge && bridge.location && isFinite(bridge.location.lat) && isFinite(bridge.location.lng)) {
    summaryMap.setView([bridge.location.lat, bridge.location.lng], 17);
    L.marker([bridge.location.lat, bridge.location.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div class="bridge-loc-pin" title="${(bridge.title || "Bridge").replace(/"/g, "&quot;")}">🌉</div>`,
        iconSize: [30, 30], iconAnchor: [15, 30],
      }),
      zIndexOffset: 50,
    }).addTo(summaryMap);
  }
  await loadPhotos();
}

// ── Load located photos for the active bridge and drop clickable arrows ───────
async function loadPhotos() {
  let records = await runTransaction("readonly", (s) => s.getAll());
  if (activeBridgeId) records = records.filter((r) => r.bridgeId === activeBridgeId);
  records.sort((a, b) => a.createdAt.localeCompare(b.createdAt));

  const located = records.filter((r) => r.location && isFinite(r.location.lat) && isFinite(r.location.lng));
  if (!located.length) {
    summaryStatus.textContent = records.length
      ? `${records.length} photo(s), but none have a location to map.`
      : "No photos yet. Take some from the Gallery page.";
    return;
  }

  const latlngs = [];
  located.forEach((record, i) => {
    const ll = [record.location.lat, record.location.lng];
    latlngs.push(ll);
    const marker = L.marker(ll, {
      icon: makeArrowIcon(record.heading, i + 1),
      zIndexOffset: 100,
      riseOnHover: true,
    }).addTo(summaryMap);
    marker.on("click", (e) => { L.DomEvent.stopPropagation(e); selectPhoto(record); });
    markerById.set(record.id, marker);
  });

  summaryMap.fitBounds(L.latLngBounds(latlngs), { padding: [50, 50], maxZoom: 19 });
  summaryStatus.textContent = `${located.length} photo(s) on the map. Click an arrow to view the photo and its details.`;
}

// Numbered arrow (rotated by heading). Dimmed when heading is unknown.
function makeArrowIcon(headingDeg, label) {
  const deg = headingDeg ?? 0;
  const op  = headingDeg == null ? 0.5 : 1;
  return L.divIcon({
    className: "",
    html: `<div class="arrow-icon summary-arrow" style="transform:rotate(${deg}deg);opacity:${op}">
             <svg viewBox="0 0 40 40" width="42" height="42">
               <polygon points="20,3 32,34 20,27 8,34" fill="#38bdf8" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/>
             </svg>
             <span class="summary-arrow-num" style="transform:rotate(${-deg}deg)">${label}</span>
           </div>`,
    iconSize: [42, 42], iconAnchor: [21, 21],
  });
}

// ── Selection + details panel ─────────────────────────────────────────────────
function selectPhoto(record) {
  selectedId = record.id;

  // Highlight the active marker
  for (const [id, m] of markerById) {
    const el = m.getElement()?.querySelector(".arrow-icon");
    if (el) el.classList.toggle("summary-arrow-active", id === record.id);
  }

  // Image
  if (detailImg.dataset.url) { URL.revokeObjectURL(detailImg.dataset.url); }
  if (record.blob) {
    const url = URL.createObjectURL(record.blob);
    detailImg.src = url;
    detailImg.dataset.url = url;
    detailImg.hidden = false;
  } else {
    detailImg.hidden = true;
  }

  // Metadata
  detailMeta.innerHTML = "";
  addMeta("🕑 Taken", new Date(record.createdAt).toLocaleString());
  if (record.location) {
    const { lat, lng } = record.location;
    addMeta("📍 Location",
      `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>`, true);
  }
  if (record.heading != null) {
    addMeta("🧭 Direction", `${Math.round(record.heading)}° ${bearingLabel(record.heading)}` +
      (record.facing ? ` (${facingLabel(record.facing)} camera)` : ""));
  }
  addMeta("💬 Comment", record.comment ? escapeHtml(record.comment) : "<em style='opacity:.6'>No comment</em>", true);
  const tagsHtml = tagsSummaryHtml(record.tags);
  if (tagsHtml) addMeta("🏷 Tags", `<div class="tags-summary">${tagsHtml}</div>`, true);
  const extras = [];
  if (record.thermalBlob) extras.push("stereo");
  if (record.depthBlob)   extras.push("depth");
  if (record.plyText)     extras.push("PLY");
  if (extras.length) addMeta("🧩 Attachments", extras.join(", "));

  photoDetail.hidden = false;

  // Pan so the marker isn't hidden behind the panel
  const m = markerById.get(record.id);
  if (m) summaryMap.panTo(m.getLatLng(), { animate: true });
}

function addMeta(label, valueHtml, isHtml = false) {
  const row = document.createElement("div");
  row.className = "detail-meta-row";
  const l = document.createElement("div"); l.className = "detail-meta-label"; l.textContent = label;
  const v = document.createElement("div"); v.className = "detail-meta-value";
  if (isHtml) v.innerHTML = valueHtml; else v.textContent = valueHtml;
  row.append(l, v);
  detailMeta.append(row);
}

function closeDetail() {
  photoDetail.hidden = true;
  selectedId = null;
  for (const [, m] of markerById) {
    m.getElement()?.querySelector(".arrow-icon")?.classList.remove("summary-arrow-active");
  }
  if (detailImg.dataset.url) { URL.revokeObjectURL(detailImg.dataset.url); delete detailImg.dataset.url; }
}

// ── Bridge's CAD overlay (restored from the bridge record) ─────────────────────
async function restoreCadOverlay(bridge) {
  try {
    let saved = bridge ? bridge.kml : null;
    // Legacy fallback: older builds stored a single global overlay in the meta store.
    if (!saved) saved = await metaGet(KML_META_KEY);
    if (!saved) return;

    let opacity = parseFloat(localStorage.getItem("kml-opacity"));
    if (isNaN(opacity)) opacity = 1.0;

    // Image ground overlays (persisted as data URLs)
    const overlays = Array.isArray(saved.overlays) ? saved.overlays : [];
    for (const ov of overlays) {
      if (ov.imageUrl && ov.bounds) {
        L.imageOverlay(ov.imageUrl, ov.bounds, {
          opacity, interactive: false, zIndex: 5, className: "kmz-overlay-img"
        }).addTo(summaryMap);
      }
    }

    // Vector features
    if (saved.kmlText && window.toGeoJSON) {
      const kmlDoc = new DOMParser().parseFromString(saved.kmlText, "text/xml");
      for (const el of Array.from(kmlDoc.getElementsByTagName("GroundOverlay"))) {
        el.parentNode && el.parentNode.removeChild(el);
      }
      const gj = toGeoJSON.kml(kmlDoc);
      if (gj?.features?.length) {
        L.geoJSON(gj, {
          style: { color: "#ff6600", weight: 2.5, opacity: 0.9, fillOpacity: 0.2, fillColor: "#ff9900" },
          pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 5, fillColor: "#ff6600", color: "#cc4400", weight: 2, fillOpacity: 0.85 }),
        }).addTo(summaryMap);
      }
    }
  } catch (e) { console.warn("CAD overlay restore failed:", e); }
}

// ── Small helpers (mirrors of app.js) ─────────────────────────────────────────
function bearingLabel(deg) { return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8]; }
function facingLabel(mode) { return mode === "environment" ? "rear" : "front"; }
function escapeHtml(s) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function openDatabase() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.addEventListener("upgradeneeded", () => {
      const idb = req.result;
      if (!idb.objectStoreNames.contains(STORE_NAME)) idb.createObjectStore(STORE_NAME, { keyPath: "id" });
      if (!idb.objectStoreNames.contains(META_STORE)) idb.createObjectStore(META_STORE, { keyPath: "key" });
      if (!idb.objectStoreNames.contains(BRIDGE_STORE)) idb.createObjectStore(BRIDGE_STORE, { keyPath: "id" });
    });
    req.addEventListener("success", () => res(req.result));
    req.addEventListener("error",   () => rej(req.error));
  });
}
function getBridgeRec(id) {
  return new Promise((res, rej) => {
    const tx = db.transaction(BRIDGE_STORE, "readonly");
    const req = tx.objectStore(BRIDGE_STORE).get(id);
    req.addEventListener("success", () => res(req.result || null));
    req.addEventListener("error",   () => rej(req.error));
  });
}
function metaGet(key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(key);
    req.addEventListener("success", () => res(req.result ? req.result.value : null));
    req.addEventListener("error",   () => rej(req.error));
  });
}
function runTransaction(mode, action) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, mode), req = action(tx.objectStore(STORE_NAME));
    tx.addEventListener("complete", () => res(req && "result" in req ? req.result : undefined));
    tx.addEventListener("error",    () => rej(tx.error));
    tx.addEventListener("abort",    () => rej(tx.error ?? new Error("Transaction aborted.")));
  });
}
function registerServiceWorker() {
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}
