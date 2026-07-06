// Shared high-resolution Esri satellite basemap for all Leaflet maps.
//
// Esri "World Imagery" is sub-meter resolution across most of the US. On its own
// it has no labels, which makes it hard to orient. We add two transparent Esri
// reference overlays — World Transportation (roads) and World Boundaries & Places
// (place names / boundaries) — so the satellite view is genuinely readable.
//
// Tile services (all Esri ArcGIS Online, free for basemap use):
//   Imagery:        Reference/World_Imagery
//   Roads:          Reference/World_Transportation
//   Places/labels:  Reference/World_Boundaries_and_Places
const ESRI_IMAGERY_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_TRANSPORT_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}";
const ESRI_PLACES_URL =
  "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTRIBUTION =
  "Imagery &copy; Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, and the GIS User Community";

// Add the Esri satellite basemap (+ optional reference labels) to a Leaflet map.
// Returns the imagery layer so callers can manage it if needed.
function addEsriBasemap(map, opts) {
  opts = opts || {};
  const withLabels = opts.labels !== false; // default on
  const maxNativeZoom = opts.maxNativeZoom || 19;
  const maxZoom = opts.maxZoom || 22;

  const imagery = L.tileLayer(ESRI_IMAGERY_URL, {
    attribution: ESRI_ATTRIBUTION, maxNativeZoom, maxZoom,
  }).addTo(map);

  if (withLabels) {
    L.tileLayer(ESRI_TRANSPORT_URL, {
      maxNativeZoom, maxZoom, opacity: 0.9, pane: "overlayPane",
    }).addTo(map);
    L.tileLayer(ESRI_PLACES_URL, {
      maxNativeZoom, maxZoom, opacity: 0.9, pane: "overlayPane",
    }).addTo(map);
  }
  return imagery;
}
