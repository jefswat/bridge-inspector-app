// ── Bridge Inspection Word Report generator ───────────────────────────────────
// Client-side .docx generation using the `docx` UMD library (window.docx).
//
// SWAP-IN-A-TEMPLATE NOTE:
//   Everything specific to *how the report looks/reads* lives in REPORT_TEMPLATE
//   and the caption helpers below. When you later have a real .docx template
//   (letterhead, title block, fonts), the cleanest path is to switch to
//   docxtemplater and feed it the same `buildReportModel()` output — that
//   function already does all the photo sorting + caption text, independent of
//   the rendering library.

const REPORT_TEMPLATE = {
  docTitle:      "Bridge Inspection Report",
  frontHeading:  "General Views",
  defectHeading: "Observed Defects",
  otherHeading:  "Additional Photographs",
  // Base phrasing for the front-section general views.
  generalPhrases: {
    Elevation: "Bridge Elevation View",
    Approach:  "Approach View",
    Isometric: "Isometric View",
  },
  generalPriority: ["Elevation", "Approach", "Isometric"],
  // Page layout (US Letter, 1" margins → ~6.5" usable text width).
  maxImgWidthPx:  480,
  maxImgHeightPx: 600,
  font:           "Calibri",
  // Location-map thumbnails (satellite tile + heading arrow).
  mapZoom:        18,
  mapWidthPx:     340,
  mapHeightPx:    240,
  mapTileUrl:     "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  // Transparent Esri reference overlays composited on top of the imagery so the
  // printed location map shows roads and place names (matches the interactive maps).
  mapOverlayUrls: [
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}",
    "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}",
  ],
};

const DIRECTION_WORDS = {
  N: "North", S: "South", E: "East", W: "West",
  NE: "Northeast", SE: "Southeast", SW: "Southwest", NW: "Northwest",
};

const DIRECTION_DEGREES = {
  N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315,
};

function headingToWord(deg) {
  const labels = ["North", "Northeast", "East", "Southeast", "South", "Southwest", "West", "Northwest"];
  return labels[Math.round(deg / 45) % 8];
}

// Derive the "looking <Direction>" suffix from a Direction tag, else the compass heading.
function directionWord(record) {
  const dirs = record.tags?.directions;
  if (Array.isArray(dirs) && dirs.length) return DIRECTION_WORDS[dirs[0]] || null;
  if (record.heading != null && isFinite(record.heading)) return headingToWord(record.heading);
  return null;
}

// Bearing in degrees for the map arrow. Matches directionWord priority: a Direction
// tag wins (so the arrow agrees with the caption), else the numeric compass heading.
function directionDegrees(record) {
  const dirs = record.tags?.directions;
  if (Array.isArray(dirs) && dirs.length && DIRECTION_DEGREES[dirs[0]] != null) {
    return DIRECTION_DEGREES[dirs[0]];
  }
  if (record.heading != null && isFinite(record.heading)) return record.heading;
  return null;
}

// Highest-priority general tag present on a record (Elevation > Approach > Isometric).
function primaryGeneral(record) {
  const g = record.tags?.general || [];
  for (const t of REPORT_TEMPLATE.generalPriority) if (g.includes(t)) return t;
  return g[0] || null;
}

function frontCaption(record) {
  const g = primaryGeneral(record);
  const base = (g && REPORT_TEMPLATE.generalPhrases[g]) || "General View";
  const dir = directionWord(record);
  return dir ? `${base} looking ${dir}` : base;
}

function defectCaption(record) {
  const c = (record.comment || "").trim();
  if (c) return c;
  const issues = record.tags?.issues || [];
  return issues.length ? `Defect: ${issues.join(", ")}` : "Observed defect";
}

function otherCaption(record) {
  const c = (record.comment || "").trim();
  if (c) return c;
  const dir = directionWord(record);
  return dir ? `View looking ${dir}` : "Site photograph";
}

// Split records into the three report sections. Each photo appears once.
// Priority: front (general views) → defects → other.
function buildReportModel(records) {
  const withPhoto = records.filter((r) => r.blob);
  withPhoto.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));

  const hasGeneral = (r) => (r.tags?.general || []).length > 0;
  const hasIssues  = (r) => (r.tags?.issues  || []).length > 0;

  const front = withPhoto.filter(hasGeneral);
  // Order front by Elevation → Approach → Isometric, then by time.
  front.sort((a, b) => {
    const pa = REPORT_TEMPLATE.generalPriority.indexOf(primaryGeneral(a));
    const pb = REPORT_TEMPLATE.generalPriority.indexOf(primaryGeneral(b));
    if (pa !== pb) return pa - pb;
    return (a.createdAt || "").localeCompare(b.createdAt || "");
  });

  const frontIds = new Set(front.map((r) => r.id));
  const defects  = withPhoto.filter((r) => !frontIds.has(r.id) && hasIssues(r));
  const defectIds = new Set(defects.map((r) => r.id));
  const other    = withPhoto.filter((r) => !frontIds.has(r.id) && !defectIds.has(r.id));

  return { front, defects, other };
}

// ── Plan (ordered, editable) ──────────────────────────────────────────────────
// The plan is what the preview modal edits and what the renderer consumes. It is
// deliberately decoupled from record objects: it only stores recordId + imageKind
// + section order, so captions stay derived from the record + section it lands in.

const SECTION_DEFS = [
  { key: "front",   heading: REPORT_TEMPLATE.frontHeading },
  { key: "defects", heading: REPORT_TEMPLATE.defectHeading },
  { key: "other",   heading: REPORT_TEMPLATE.otherHeading },
];

// Caption depends on the section a photo lands in, so moving it re-captions it.
function captionForSection(record, sectionKey) {
  if (sectionKey === "front")   return frontCaption(record);
  if (sectionKey === "defects") return defectCaption(record);
  return otherCaption(record);
}

// Which stored images exist on a record, for the image-source picker.
function availableImageKinds(record) {
  const kinds = [{ key: "primary", label: "Primary photo" }];
  if (record.thermalBlob) kinds.push({ key: "secondary", label: "Secondary (stereo)" });
  if (record.depthBlob)   kinds.push({ key: "depth", label: "Depth map" });
  return kinds;
}

// Resolve an item's chosen image to an actual Blob (falls back to primary).
function imageBlobFor(record, kind) {
  if (kind === "secondary" && record.thermalBlob) return record.thermalBlob;
  if (kind === "depth" && record.depthBlob)       return record.depthBlob;
  return record.blob;
}

// Build the default, auto-sorted plan from records (all using the primary image).
function buildReportPlan(records) {
  const model = buildReportModel(records);
  const toItems = (arr) => arr.map((r) => ({ recordId: r.id, imageKind: "primary" }));
  return {
    sections: [
      { key: "front",   heading: REPORT_TEMPLATE.frontHeading,   items: toItems(model.front) },
      { key: "defects", heading: REPORT_TEMPLATE.defectHeading,  items: toItems(model.defects) },
      { key: "other",   heading: REPORT_TEMPLATE.otherHeading,   items: toItems(model.other) },
    ],
    excluded: [],
  };
}

// ── Location map thumbnail (satellite tile + heading arrow) ────────────────────
// Renders a small north-up satellite image centered on the photo's GPS location,
// with an arrow showing the camera bearing. Uses the same ArcGIS tiles as the map
// page. Returns a JPEG Blob, or null if the record has no location. If tiles fail
// to load (e.g. offline) it still returns a schematic arrow on a dark background.
function lonLatToPixel(lat, lng, z) {
  const scale = Math.pow(2, z) * 256;
  const x = (lng + 180) / 360 * scale;
  const latRad = lat * Math.PI / 180;
  const y = (1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2 * scale;
  return { x, y };
}

function loadMapTile(z, tx, ty, url) {
  return new Promise((resolve) => {
    const n = Math.pow(2, z);
    if (ty < 0 || ty >= n) { resolve(null); return; }
    const wx = ((tx % n) + n) % n;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = (url || REPORT_TEMPLATE.mapTileUrl)
      .replace("{z}", z).replace("{y}", ty).replace("{x}", wx);
  });
}

async function buildLocationMap(record, opts = {}) {
  const loc = record.location;
  if (!loc || loc.lat == null || loc.lng == null || !isFinite(loc.lat) || !isFinite(loc.lng)) return null;

  const W = opts.width  || REPORT_TEMPLATE.mapWidthPx;
  const H = opts.height || REPORT_TEMPLATE.mapHeightPx;
  const z = opts.zoom   || REPORT_TEMPLATE.mapZoom;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#1e293b";
  ctx.fillRect(0, 0, W, H);

  const center = lonLatToPixel(loc.lat, loc.lng, z);
  const left = center.x - W / 2, top = center.y - H / 2;
  const tx0 = Math.floor(left / 256), tx1 = Math.floor((left + W) / 256);
  const ty0 = Math.floor(top / 256),  ty1 = Math.floor((top + H) / 256);

  const jobs = [];
  for (let tx = tx0; tx <= tx1; tx++) {
    for (let ty = ty0; ty <= ty1; ty++) {
      jobs.push(loadMapTile(z, tx, ty).then((img) => {
        if (img) ctx.drawImage(img, Math.round(tx * 256 - left), Math.round(ty * 256 - top));
      }));
    }
  }
  await Promise.all(jobs);

  // Composite the transparent reference overlays (roads, place names) on top,
  // one layer at a time so they stack in order over the imagery.
  for (const overlayUrl of (REPORT_TEMPLATE.mapOverlayUrls || [])) {
    const ovJobs = [];
    for (let tx = tx0; tx <= tx1; tx++) {
      for (let ty = ty0; ty <= ty1; ty++) {
        ovJobs.push(loadMapTile(z, tx, ty, overlayUrl).then((img) => {
          if (img) ctx.drawImage(img, Math.round(tx * 256 - left), Math.round(ty * 256 - top));
        }));
      }
    }
    await Promise.all(ovJobs);
  }

  const cx = W / 2, cy = H / 2;
  const bearing = directionDegrees(record);

  if (bearing != null && isFinite(bearing)) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(bearing * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -28); ctx.lineTo(13, 13); ctx.lineTo(0, 5); ctx.lineTo(-13, 13); ctx.closePath();
    ctx.fillStyle = "#38bdf8"; ctx.strokeStyle = "#0c4a6e"; ctx.lineWidth = 2.5; ctx.lineJoin = "round";
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, 4.5, 0, 2 * Math.PI);
  ctx.fillStyle = "#f8fafc"; ctx.strokeStyle = "#0c4a6e"; ctx.lineWidth = 2;
  ctx.fill(); ctx.stroke();

  // North indicator (top-left) — tiles are north-up.
  ctx.fillStyle = "rgba(15,23,42,0.72)";
  ctx.fillRect(6, 6, 26, 30);
  ctx.beginPath();
  ctx.moveTo(19, 10); ctx.lineTo(15, 18); ctx.lineTo(23, 18); ctx.closePath();
  ctx.fillStyle = "#ef4444"; ctx.fill();
  ctx.fillStyle = "#fff"; ctx.font = "bold 12px Arial"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.fillText("N", 19, 27);

  ctx.strokeStyle = "#0c4a6e"; ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);

  // Synchronous dataURL → Blob (avoids canvas.toBlob hanging under headless virtual-time).
  const du = canvas.toDataURL("image/jpeg", 0.85);
  const bin = atob(du.split(",")[1]);
  const u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return new Blob([u8], { type: "image/jpeg" });
}

// ── docx rendering ────────────────────────────────────────────────────────────
function loadImageSize(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve({ w: img.naturalWidth || 480, h: img.naturalHeight || 360 }); };
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ w: 480, h: 360 }); };
    img.src = url;
  });
}

function fitDimensions(w, h) {
  const maxW = REPORT_TEMPLATE.maxImgWidthPx, maxH = REPORT_TEMPLATE.maxImgHeightPx;
  let scale = Math.min(maxW / w, maxH / h, 1);
  if (!isFinite(scale) || scale <= 0) scale = maxW / w;
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

async function makePhotoBlock(blob, captionText, index) {
  const d = window.docx;
  const buf = await blob.arrayBuffer();
  const size = await loadImageSize(blob);
  const dim  = fitDimensions(size.w, size.h);

  const children = [
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { before: 120, after: 40 },
      children: [ new d.ImageRun({ data: new Uint8Array(buf), transformation: dim }) ],
    }),
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [ new d.TextRun({ text: `Figure ${index}. ${captionText}`, italics: true, size: 20 }) ],
    }),
  ];
  return children;
}

// Optional location-map block, placed under a photo. Returns [] if no location.
async function makeMapBlock(record) {
  const blob = await buildLocationMap(record);
  if (!blob) return [];
  const d = window.docx;
  const buf = await blob.arrayBuffer();
  const dim = { width: REPORT_TEMPLATE.mapWidthPx, height: REPORT_TEMPLATE.mapHeightPx };
  const dir = directionWord(record);
  let note = dir ? `Location and camera direction (looking ${dir})` : "Photo location";
  if (record.attitude != null && isFinite(record.attitude)) {
    const a = record.attitude;
    const att = a > 2 ? `${a}\u00b0 up` : a < -2 ? `${Math.abs(a)}\u00b0 down` : "level";
    note += ` \u2014 camera ${att}`;
  }
  return [
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { before: 0, after: 20 },
      children: [ new d.ImageRun({ data: new Uint8Array(buf), transformation: dim }) ],
    }),
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 240 },
      children: [ new d.TextRun({ text: note, italics: true, size: 18, color: "666666" }) ],
    }),
  ];
}

function sectionHeading(text) {
  const d = window.docx;
  return new d.Paragraph({
    heading: d.HeadingLevel.HEADING_1,
    spacing: { before: 240, after: 120 },
    children: [ new d.TextRun({ text }) ],
  });
}

function titleBlock(meta) {
  const d = window.docx;
  const paras = [
    new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 120 },
      children: [ new d.TextRun({ text: REPORT_TEMPLATE.docTitle, bold: true, size: 40 }) ],
    }),
  ];
  if (meta.bridgeName) {
    paras.push(new d.Paragraph({
      alignment: d.AlignmentType.CENTER,
      spacing: { after: 80 },
      children: [ new d.TextRun({ text: meta.bridgeName, bold: true, size: 28 }) ],
    }));
  }
  paras.push(new d.Paragraph({
    alignment: d.AlignmentType.CENTER,
    spacing: { after: 240 },
    children: [ new d.TextRun({ text: `Report generated ${new Date().toLocaleString()}`, size: 20, color: "666666" }) ],
  }));
  return paras;
}

// Public entry point: build a .docx Blob from photo records.
// Optionally pass meta.plan (from buildReportPlan, possibly edited in the UI) to
// control section membership, order, and which image each photo exports.
async function buildReportDoc(records, meta = {}) {
  if (!window.docx) throw new Error("docx library not loaded");
  const d = window.docx;
  const byId = new Map(records.map((r) => [r.id, r]));
  const plan = meta.plan || buildReportPlan(records);

  const body = [];
  body.push(...titleBlock(meta));

  let fig = 1;
  let firstSection = true;

  for (const sec of plan.sections) {
    // Keep only items whose record + chosen image resolve to a real Blob.
    const items = (sec.items || []).filter((it) => {
      const r = byId.get(it.recordId);
      return r && imageBlobFor(r, it.imageKind);
    });
    if (!items.length) continue;

    if (!firstSection) body.push(new d.Paragraph({ children: [ new d.PageBreak() ] }));
    firstSection = false;

    body.push(sectionHeading(sec.heading));
    for (const it of items) {
      const r = byId.get(it.recordId);
      const blob = imageBlobFor(r, it.imageKind);
      const caption = captionForSection(r, sec.key);
      body.push(...await makePhotoBlock(blob, caption, fig++));
      if (it.includeMap) body.push(...await makeMapBlock(r));
    }
  }

  if (fig === 1) throw new Error("No photos with images to include in the report.");

  const doc = new d.Document({
    styles: { default: { document: { run: { font: REPORT_TEMPLATE.font } } } },
    sections: [{
      properties: {},
      children: body,
    }],
  });

  return d.Packer.toBlob(doc);
}

// Expose to app.js (non-module scripts share the global scope, but be explicit).
window.buildReportDoc = buildReportDoc;
window.buildReportModel = buildReportModel;
window.buildReportPlan = buildReportPlan;
window.reportCaptions = { frontCaption, defectCaption, otherCaption, captionForSection };
window.reportHelpers = { SECTION_DEFS, availableImageKinds, imageBlobFor, buildLocationMap,
  hasLocation: (r) => !!(r && r.location && r.location.lat != null && r.location.lng != null &&
    isFinite(r.location.lat) && isFinite(r.location.lng)) };
