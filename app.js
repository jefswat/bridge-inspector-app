const BUILD_STAMP = "2026-07-08 14:22:00";
// ── Constants ─────────────────────────────────────────────────────────────────
const DB_NAME    = "photo-vault-pwa";
const STORE_NAME = "photos";
const META_STORE = "meta";
const BRIDGE_STORE = "bridges";
const DB_VERSION = 3;
const KML_META_KEY = "kmlOverlay";
const ACTIVE_BRIDGE_KEY = "active-bridge-id";
const FEET_300_M = 91.44; // 300 feet in metres

// ── Photo tags ────────────────────────────────────────────────────────────────
// Multi-select tag categories. "directions" pairs with the General tags.
const TAG_CATEGORIES = [
  { key: "general",    label: "General",            options: ["Elevation", "Approach", "Isometric"] },
  { key: "structure",  label: "Structure in Photo", options: ["Substructure", "Superstructure", "Deck", "Barrier", "Joints", "Guardrail", "Approach Slab", "Drainage"] },
  { key: "issues",     label: "Issues",             options: ["General Defect", "Spalling", "Cracking", "Delamination", "Joint damage", "Impact"] },
  { key: "directions", label: "Direction",          options: ["N", "S", "E", "W", "NE", "SE", "SW", "NW"] },
];

function emptyTags() { return { general: [], structure: [], issues: [], directions: [] }; }
function normalizeTags(tags) {
  const t = emptyTags();
  if (tags && typeof tags === "object") {
    for (const cat of TAG_CATEGORIES) if (Array.isArray(tags[cat.key])) t[cat.key] = tags[cat.key].slice();
  }
  return t;
}
function tagsAreEmpty(tags) { return !tags || TAG_CATEGORIES.every((c) => !(tags[c.key] && tags[c.key].length)); }
function tagsToFlatString(tags) {
  if (!tags) return "";
  return TAG_CATEGORIES.filter((c) => tags[c.key] && tags[c.key].length)
    .map((c) => `${c.label}: ${tags[c.key].join(", ")}`).join(" | ");
}
// Interactive multi-select chip picker that mutates `tags` in place.
function buildTagPicker(tags) {
  const wrap = document.createElement("div");
  wrap.className = "tags-picker";
  for (const cat of TAG_CATEGORIES) {
    const group = document.createElement("div"); group.className = "tag-group";
    const lbl = document.createElement("div"); lbl.className = "tag-group-label"; lbl.textContent = cat.label;
    const chips = document.createElement("div"); chips.className = "tag-chip-row";
    for (const opt of cat.options) {
      const chip = document.createElement("button");
      chip.type = "button"; chip.className = "tag-chip cat-" + cat.key; chip.textContent = opt;
      if (tags[cat.key].includes(opt)) chip.classList.add("selected");
      chip.setAttribute("aria-pressed", tags[cat.key].includes(opt) ? "true" : "false");
      chip.addEventListener("click", () => {
        const arr = tags[cat.key], i = arr.indexOf(opt);
        if (i >= 0) { arr.splice(i, 1); chip.classList.remove("selected"); chip.setAttribute("aria-pressed", "false"); }
        else { arr.push(opt); chip.classList.add("selected"); chip.setAttribute("aria-pressed", "true"); }
      });
      chips.append(chip);
    }
    group.append(lbl, chips); wrap.append(group);
  }
  return wrap;
}
// Read-only grouped chip summary.
function buildTagSummary(tags) {
  const wrap = document.createElement("div"); wrap.className = "tags-summary";
  for (const cat of TAG_CATEGORIES) {
    const vals = tags?.[cat.key];
    if (!vals || !vals.length) continue;
    const group = document.createElement("div"); group.className = "tag-summary-group";
    const lbl = document.createElement("span"); lbl.className = "tag-summary-label"; lbl.textContent = cat.label + ":";
    group.append(lbl);
    for (const v of vals) {
      const chip = document.createElement("span"); chip.className = "tag-chip static cat-" + cat.key; chip.textContent = v;
      group.append(chip);
    }
    wrap.append(group);
  }
  return wrap;
}

// ── DOM refs ──────────────────────────────────────────────────────────────────
const cameraPreview      = document.getElementById("cameraPreview");
const cameraFallback     = document.getElementById("cameraFallback");
const snapshotCanvas     = document.getElementById("snapshotCanvas");
const statusMessage      = document.getElementById("statusMessage");
const installButton      = document.getElementById("installButton");
const startCameraButton  = document.getElementById("startCameraButton");
const captureButton      = document.getElementById("captureButton");
const switchCameraButton = document.getElementById("switchCameraButton");
const sketchButton       = document.getElementById("sketchButton");
const filePicker         = document.getElementById("filePicker");
const clearAllButton     = document.getElementById("clearAllButton");
const wordReportButton   = document.getElementById("wordReportButton");
const emptyState         = document.getElementById("emptyState");
const photoGrid          = document.getElementById("photoGrid");
const photoCardTemplate  = document.getElementById("photoCardTemplate");
const commentInput       = document.getElementById("commentInput");
const captureTagsEl      = document.getElementById("captureTags");
const captureTagsButton  = document.getElementById("captureTagsButton");
const captureTagsSummary = document.getElementById("captureTagsSummary");
const acquireGeoButton   = document.getElementById("acquireGeoButton");
const geoText            = document.getElementById("geoText");
const headingText        = document.getElementById("headingText");
const thermalFrame       = document.getElementById("thermalFrame");
const thermalPreview     = document.getElementById("thermalPreview");
const cameraSelector     = document.getElementById("cameraSelector");
const mainCameraSelector = document.getElementById("mainCameraSelector");
const mainCameraSelect   = document.getElementById("mainCameraSelect");
const thermalCameraSelect= document.getElementById("thermalCameraSelect");
const startThermalButton = document.getElementById("startThermalButton");
const stopThermalButton  = document.getElementById("stopThermalButton");
const depthModeRow       = document.getElementById("depthModeRow");
const depthModeCheck     = document.getElementById("depthModeCheck");
const calibrateDepthBtn  = document.getElementById("calibrateDepthBtn");
const refineRow          = document.getElementById("refineRow");
const refineStrength     = document.getElementById("refineStrength");
const refineStrengthVal  = document.getElementById("refineStrengthVal");
const cutoffRow          = document.getElementById("cutoffRow");
const depthCutoff        = document.getElementById("depthCutoff");
const depthCutoffVal     = document.getElementById("depthCutoffVal");
const calibPanel         = document.getElementById("calibPanel");
const calibCloseBtn      = document.getElementById("calibCloseBtn");
const saveCalibBtn       = document.getElementById("saveCalibBtn");
const autoCalibBtn       = document.getElementById("autoCalibBtn");
const calibStatus        = document.getElementById("calibStatus");
const kmlFilePicker      = document.getElementById("kmlFilePicker");
const clearKmlButton     = document.getElementById("clearKmlButton");
const kmlStatus          = document.getElementById("kmlStatus");
const kmlOpacityRow      = document.getElementById("kmlOpacityRow");
const kmlOpacitySlider   = document.getElementById("kmlOpacity");
const kmlOpacityVal      = document.getElementById("kmlOpacityVal");
const kmlFileName        = document.getElementById("kmlFileName");
const scanPanel          = document.getElementById("scanPanel");
const scanLabel          = document.getElementById("scanLabel");
const scanToggleBtn      = document.getElementById("scanToggleBtn");
const scanHud            = document.getElementById("scanHud");
const scanGuide          = document.getElementById("scanGuide");
const scanOverlapBar     = document.getElementById("scanOverlapBar");
const scanCountEl        = document.getElementById("scanCount");
const scanFocusEl        = document.getElementById("scanFocus");
const scanOverlapPctEl   = document.getElementById("scanOverlapPct");
const scanShotBtn        = document.getElementById("scanShotBtn");
const scanFinishBtn      = document.getElementById("scanFinishBtn");
const scanSessionsCard   = document.getElementById("scanSessionsCard");
const scanSessionsList   = document.getElementById("scanSessionsList");
const openPeerTransferViewBtn = document.getElementById("openPeerTransferView");
const openPeerTransferViewTopBtn = document.getElementById("openPeerTransferViewTop");
const closePeerTransferViewBtn = document.getElementById("closePeerTransferView");
const peerTransferCard   = document.getElementById("peerTransferCard");
const peerRoleSelect     = document.getElementById("peerRoleSelect");
const peerCreateOfferBtn = document.getElementById("peerCreateOfferBtn");
const peerApplyOfferBtn  = document.getElementById("peerApplyOfferBtn");
const peerApplyAnswerBtn = document.getElementById("peerApplyAnswerBtn");
const peerCopyLocalSdpBtn= document.getElementById("peerCopyLocalSdpBtn");
const peerShowQrBtn      = document.getElementById("peerShowQrBtn");
const peerScanQrBtn      = document.getElementById("peerScanQrBtn");
const peerClearSessionBtn= document.getElementById("peerClearSessionBtn");
const peerLocalSdp       = document.getElementById("peerLocalSdp");
const peerRemoteSdp      = document.getElementById("peerRemoteSdp");
const peerQrBox          = document.getElementById("peerQrBox");
const peerQrCode         = document.getElementById("peerQrCode");
const peerQrScannerModal = document.getElementById("peerQrScannerModal");
const peerQrScannerVideo = document.getElementById("peerQrScannerVideo");
const peerQrScannerStatus= document.getElementById("peerQrScannerStatus");
const peerQrScannerClose = document.getElementById("peerQrScannerClose");
const peerSendRow        = document.getElementById("peerSendRow");
const peerPickSavedBtn   = document.getElementById("peerPickSavedBtn");
const peerFileInput      = document.getElementById("peerFileInput");
const peerSendFilesBtn   = document.getElementById("peerSendFilesBtn");
const peerAutoSendCheck  = document.getElementById("peerAutoSendCheck");
const peerConnState      = document.getElementById("peerConnState");
const peerTransferLog    = document.getElementById("peerTransferLog");

// ── State ─────────────────────────────────────────────────────────────────────
let db;
let stream, thermalStream;
let facingMode            = "environment";
let mainCameraId          = localStorage.getItem("mainCameraId") || null; // preferred main device
let deferredInstallPrompt = null;
let currentLocation       = null;
let currentHeading        = null;
let currentAttitude       = null; // camera angle from horizontal (deg): + up, - down
let kmlGeoJSON            = null;
let kmlGroundOverlays      = []; // [{bounds,imageUrl}]
let kmlOverlayOpacity      = 1.0; // 0..1, user-adjustable via slider
let depthModeEnabled       = false;
let depthWs                = null;
let captureTags            = emptyTags(); // tags selected in the capture card
let bridges                = [];   // all bridge records (cached)
let activeBridgeId         = null; // currently opened bridge, or null on overview
let peerState              = { role: "base", pc: null, dc: null, incoming: null, sending: false, autoSend: true };
let peerSendQueue          = Promise.resolve();
let peerQrDetector         = null;
let peerQrScanStream       = null;
let peerQrScanLoopId       = null;

// ── Guided scan (photogrammetry burst) state ──────────────────────────────────
let scanActive     = false;
let scanSession    = null;   // { id, bridgeId, label, camera, createdAt, mode }
let scanSeq        = 0;      // frames captured in the active session
let scanLoopId     = null;   // requestAnimationFrame handle
let scanPrevSmall  = null;   // last-analyzed grayscale frame (Uint8) for motion est.
let scanAccumDx    = 0;      // accumulated horizontal motion since last capture (small px)
let scanAccumDy    = 0;      // accumulated vertical motion
let scanLastTickTs = 0;      // throttle timestamp
let scanCooldownTs = 0;      // suppress captures right after one fires
let scanBusy       = false;  // a capture is in flight
const SCAN_SMALL_W = 96, SCAN_SMALL_H = 72;      // motion-analysis resolution
const SCAN_MED_W   = 240, SCAN_MED_H = 180;      // focus/exposure resolution
const SCAN_TARGET_OVERLAP = 0.75;                // aim for ~75% overlap between frames
const SCAN_MOVE_FRAC = 1 - SCAN_TARGET_OVERLAP;  // fraction of frame to move before a shot
const SCAN_SEARCH    = 10;                        // per-tick motion search radius (small px)
const SCAN_FOCUS_MIN = 60;                        // min variance-of-Laplacian (sharpness)
const SCAN_FAST_PX   = 13;                        // per-tick shift above this = "too fast"
const SCAN_TICK_MS   = 90;                         // ~11 Hz analysis
const SCAN_COOLDOWN_MS = 500;                      // gap after an accepted frame
const _scanSmallCanvas = document.createElement("canvas");
const _scanMedCanvas   = document.createElement("canvas");

function renderCaptureTags() {
  if (captureTagsSummary) {
    const flat = tagsToFlatString(captureTags);
    captureTagsSummary.textContent = flat || "No tags selected";
  }
}

function openCaptureTagsModal() {
  let overlay = document.getElementById("captureTagsModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "captureTagsModal";
    overlay.className = "sketch-modal";
    overlay.innerHTML = `
      <div class="sketch-dialog capture-tags-dialog">
        <div class="sketch-header">
          <span class="sketch-title">🏷 Select tags</span>
          <button class="capture-tags-close secondary" type="button">✕</button>
        </div>
        <div class="sketch-canvas-wrap" style="display:block;max-height:60vh;overflow:auto;padding:12px;">
          <div id="captureTagsPickerHost"></div>
        </div>
        <div class="sketch-footer">
          <span class="sketch-hint">These tags will be applied to the next capture/import/sketch.</span>
          <div class="sketch-footer-btns">
            <button type="button" class="capture-tags-clear danger">Clear</button>
            <button type="button" class="capture-tags-cancel secondary">Cancel</button>
            <button type="button" class="capture-tags-save">Save</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
    overlay.querySelector(".capture-tags-close").addEventListener("click", () => { overlay.style.display = "none"; });
    overlay.querySelector(".capture-tags-cancel").addEventListener("click", () => { overlay.style.display = "none"; });
  }
  const working = normalizeTags(captureTags);
  const host = overlay.querySelector("#captureTagsPickerHost");
  host.replaceChildren(buildTagPicker(working));
  overlay.querySelector(".capture-tags-clear").onclick = () => {
    captureTags = emptyTags();
    renderCaptureTags();
    overlay.style.display = "none";
  };
  overlay.querySelector(".capture-tags-save").onclick = () => {
    captureTags = working;
    renderCaptureTags();
    overlay.style.display = "none";
  };
  overlay.style.display = "flex";
}

// id -> { lmap, arrowMarker, handleMarker, kmlLayer }
const leafletInstances = new Map();

captureButton.disabled      = true;
switchCameraButton.disabled = true;
clearAllButton.disabled     = true;
if (wordReportButton) wordReportButton.disabled = true;

init().catch((err) => setStatus(`Startup failed: ${err.message}`));

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  const bs = document.getElementById('buildStamp');
  if (bs) bs.textContent = 'build ' + BUILD_STAMP;
  console.log('Photo Vault build', BUILD_STAMP);
  renderCaptureTags();
  updatePeerTransferUi();
  db = await openDatabase();
  await ensureBridges();
  registerEvents();
  await registerServiceWorker();

  const last = localStorage.getItem(ACTIVE_BRIDGE_KEY);
  if (last && bridges.some((b) => b.id === last)) {
    await openBridge(last);
  } else {
    showBridgesOverview();
  }
  setStatus("Ready.");
}

// Load bridges; migrate any pre-existing photos/overlay into a default bridge.
async function ensureBridges() {
  bridges = (await getAllBridges()) || [];
  const allPhotos = await runTransaction("readonly", (store) => store.getAll());
  const orphans = allPhotos.filter((p) => !p.bridgeId);
  if (orphans.length && !bridges.length) {
    // First run with legacy data: create a default bridge and adopt everything.
    const legacyKml = await metaGet(KML_META_KEY).catch(() => null);
    const def = {
      id: createId(),
      title: "My First Bridge",
      description: "Photos and overlay from before bridges were added.",
      createdAt: new Date().toISOString(),
      kml: legacyKml || null,
      reportConfig: null,
    };
    await putBridgeRec(def);
    for (const p of orphans) { p.bridgeId = def.id; await runTransaction("readwrite", (s) => s.put(p)); }
    bridges = [def];
  } else if (orphans.length && bridges.length) {
    // Adopt stragglers into the first bridge so nothing is lost.
    const target = bridges[0];
    for (const p of orphans) { p.bridgeId = target.id; await runTransaction("readwrite", (s) => s.put(p)); }
  }
}

function activeBridge() { return bridges.find((b) => b.id === activeBridgeId) || null; }

// ── Events ────────────────────────────────────────────────────────────────────
function registerEvents() {
  startCameraButton.addEventListener("click",  () => startMainCamera());
  captureButton.addEventListener("click",      () => capturePhoto());
  switchCameraButton.addEventListener("click", () => {
    facingMode = facingMode === "environment" ? "user" : "environment";
    // Flip means "use front/rear facing" — clear any explicit device pick so
    // facingMode drives selection again.
    mainCameraId = null; localStorage.removeItem("mainCameraId");
    startMainCamera();
  });
  thermalCameraSelect.addEventListener("change", () => {
    startThermalButton.hidden = !thermalCameraSelect.value;
  });
  if (mainCameraSelect) mainCameraSelect.addEventListener("change", () => {
    mainCameraId = mainCameraSelect.value || null;
    if (mainCameraId) localStorage.setItem("mainCameraId", mainCameraId);
    else localStorage.removeItem("mainCameraId");
    startMainCamera();
  });
  startThermalButton.addEventListener("click", () => startThermalCamera());
  stopThermalButton.addEventListener("click",  () => stopThermalCamera());
  depthModeCheck.addEventListener("change", () => {
    depthModeEnabled = depthModeCheck.checked;
    if (depthModeEnabled) startDepthMode();
    else stopDepthMode();
  });
  calibrateDepthBtn.addEventListener("click", () => {
    calibPanel.hidden = false; loadCalibration();
  });
  calibCloseBtn.addEventListener("click",   () => { calibPanel.hidden = true; });
  // Depth refine strength slider: 0 = crisp (like preview) .. 1 = filled surface.
  // The value auto-adapts per scene on the server; this scales it. Persisted.
  if (refineStrength) {
    const saved = parseFloat(localStorage.getItem("depthRefineStrength"));
    if (!Number.isNaN(saved)) refineStrength.value = String(Math.round(saved * 100));
    updateRefineLabel();
    refineStrength.addEventListener("input", () => {
      updateRefineLabel();
      const v = refineStrength.value / 100;
      localStorage.setItem("depthRefineStrength", String(v));
      sendRefineStrength();
    });
  }
  // Depth cutoff slider: cull anything farther than this distance (0.25..4 m).
  // Affects both the live depth map and the exported mesh. Persisted.
  if (depthCutoff) {
    const savedC = parseFloat(localStorage.getItem("depthCutoffM"));
    if (!Number.isNaN(savedC)) depthCutoff.value = String(Math.min(4, Math.max(0.25, savedC)));
    updateCutoffLabel();
    depthCutoff.addEventListener("input", () => {
      updateCutoffLabel();
      localStorage.setItem("depthCutoffM", depthCutoff.value);
      sendDepthCutoff();
    });
  }
  saveCalibBtn.addEventListener("click",    () => saveCalibration());
  autoCalibBtn.addEventListener("click",    () => requestAutoCalibration());
  filePicker.addEventListener("change", async (e) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length) await saveFiles(files);
    filePicker.value = "";
  });
  if (captureTagsButton) captureTagsButton.addEventListener("click", () => openCaptureTagsModal());
  clearAllButton.addEventListener("click",   () => clearAllPhotos());
  if (sketchButton) sketchButton.addEventListener("click", () => openSketchModal());
  const newBridgeBtn = document.getElementById("newBridgeButton");
  if (newBridgeBtn) newBridgeBtn.addEventListener("click", () => openBridgeEditor(null));
  const importNbiBtn = document.getElementById("importNbiButton");
  if (importNbiBtn) importNbiBtn.addEventListener("click", () => openNbiImport());
  const backBtn = document.getElementById("backToBridges");
  if (backBtn) backBtn.addEventListener("click", () => { closePeerTransferView(); showBridgesOverview(); });
  const zipBtn = document.getElementById("downloadBridgeZip");
  if (zipBtn) zipBtn.addEventListener("click", () => { if (activeBridgeId) downloadBridgeZip(activeBridgeId); });
  const editBridgeBtn = document.getElementById("editBridgeButton");
  if (editBridgeBtn) editBridgeBtn.addEventListener("click", () => { const b = activeBridge(); if (b) openBridgeEditor(b); });
  if (wordReportButton) wordReportButton.addEventListener("click", () => generateWordReport());
  acquireGeoButton.addEventListener("click", () => acquireGeoAndHeading());
  if (scanToggleBtn) scanToggleBtn.addEventListener("click", () => scanActive ? finishScanSession() : startScanSession());
  if (scanFinishBtn) scanFinishBtn.addEventListener("click", () => finishScanSession());
  if (scanShotBtn)   scanShotBtn.addEventListener("click", () => { if (scanActive) captureScanFrame("manual"); });
  kmlFilePicker.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await loadKmlFile(file);
    kmlFilePicker.value = "";
  });
  clearKmlButton.addEventListener("click", () => clearKmlOverlay());
  try {
    const savedOp = parseFloat(localStorage.getItem("kml-opacity"));
    if (!isNaN(savedOp)) { kmlOverlayOpacity = savedOp; }
  } catch (e) {
    if (peerQrScannerStatus) peerQrScannerStatus.textContent = "Scanning…";
  }
  if (kmlOpacitySlider) {
    kmlOpacitySlider.value = Math.round(kmlOverlayOpacity * 100);
    if (kmlOpacityVal) kmlOpacityVal.textContent = Math.round(kmlOverlayOpacity * 100);
    kmlOpacitySlider.addEventListener("input", (e) => setKmlOverlayOpacity(parseInt(e.target.value, 10) / 100));
  }
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); deferredInstallPrompt = e; installButton.hidden = false;
  });
  installButton.addEventListener("click", async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null; installButton.hidden = true;
  });
  window.addEventListener("appinstalled", () => { installButton.hidden = true; setStatus("App installed."); });
  if (peerRoleSelect) peerRoleSelect.addEventListener("change", () => {
    peerState.role = peerRoleSelect.value === "rover" ? "rover" : "base";
    updatePeerTransferUi();
  });
  if (openPeerTransferViewBtn) openPeerTransferViewBtn.addEventListener("click", () => openPeerTransferView());
  if (openPeerTransferViewTopBtn) openPeerTransferViewTopBtn.addEventListener("click", () => openPeerTransferView());
  if (closePeerTransferViewBtn) closePeerTransferViewBtn.addEventListener("click", () => closePeerTransferView());
  if (peerTransferCard) peerTransferCard.addEventListener("click", (e) => {
    if (e.target === peerTransferCard) closePeerTransferView();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && peerTransferCard && !peerTransferCard.hidden) closePeerTransferView();
  });
  if (peerCreateOfferBtn) peerCreateOfferBtn.addEventListener("click", () => peerCreateOffer());
  if (peerApplyOfferBtn) peerApplyOfferBtn.addEventListener("click", () => peerApplyOffer());
  if (peerApplyAnswerBtn) peerApplyAnswerBtn.addEventListener("click", () => peerApplyAnswer());
  if (peerCopyLocalSdpBtn) peerCopyLocalSdpBtn.addEventListener("click", () => copyLocalSdp());
  if (peerShowQrBtn) peerShowQrBtn.addEventListener("click", () => renderPeerLocalQr());
  if (peerScanQrBtn) peerScanQrBtn.addEventListener("click", () => { void startPeerQrScan(); });
  if (peerClearSessionBtn) peerClearSessionBtn.addEventListener("click", () => resetPeerSession(false));
  if (peerQrScannerClose) peerQrScannerClose.addEventListener("click", () => stopPeerQrScan("QR scan closed."));
  if (peerQrScannerModal) peerQrScannerModal.addEventListener("click", (e) => {
    if (e.target === peerQrScannerModal) stopPeerQrScan("QR scan closed.");
  });
  if (peerPickSavedBtn) peerPickSavedBtn.addEventListener("click", () => { void openPeerSavedPickerModal(); });
  if (peerSendFilesBtn) peerSendFilesBtn.addEventListener("click", () => peerSendSelectedFiles());
  if (peerAutoSendCheck) peerAutoSendCheck.addEventListener("change", () => {
    peerState.autoSend = !!peerAutoSendCheck.checked;
    localStorage.setItem("peer-auto-send-captures", peerState.autoSend ? "1" : "0");
  });
}

function updatePeerTransferUi() {
  peerState.autoSend = localStorage.getItem("peer-auto-send-captures") !== "0";
  peerState.role = (peerRoleSelect && peerRoleSelect.value === "rover") ? "rover" : "base";
  if (peerSendRow) peerSendRow.hidden = peerState.role !== "rover";
  if (peerCreateOfferBtn) peerCreateOfferBtn.disabled = peerState.role !== "base";
  if (peerApplyOfferBtn) peerApplyOfferBtn.disabled = peerState.role !== "rover";
  if (peerApplyAnswerBtn) peerApplyAnswerBtn.disabled = peerState.role !== "base";
  if (peerPickSavedBtn) peerPickSavedBtn.disabled = peerState.role !== "rover";
  if (peerSendFilesBtn) peerSendFilesBtn.disabled = peerState.role !== "rover";
  if (peerAutoSendCheck) {
    peerAutoSendCheck.checked = peerState.autoSend;
    peerAutoSendCheck.disabled = peerState.role !== "rover";
  }
  setPeerConnState("Transfer link: idle");
}

function openPeerTransferView() {
  if (!peerTransferCard) return;
  peerTransferCard.hidden = false;
}

function closePeerTransferView() {
  stopPeerQrScan();
  if (!peerTransferCard) return;
  peerTransferCard.hidden = true;
}

function appendPeerLog(line) {
  if (!peerTransferLog) return;
  const ts = new Date().toLocaleTimeString();
  const next = `[${ts}] ${line}`;
  const cur = String(peerTransferLog.textContent || "").trim();
  peerTransferLog.textContent = cur ? `${cur}\n${next}` : next;
  peerTransferLog.scrollTop = peerTransferLog.scrollHeight;
}

function setPeerConnState(text) {
  if (peerConnState) peerConnState.textContent = text;
}

function resetPeerSession(keepSdp = false) {
  if (peerState.dc) {
    try { peerState.dc.onopen = null; peerState.dc.onclose = null; peerState.dc.onmessage = null; peerState.dc.close(); } catch (e) { console.warn("peer dc close:", e); }
  }
  if (peerState.pc) {
    try { peerState.pc.onconnectionstatechange = null; peerState.pc.oniceconnectionstatechange = null; peerState.pc.ondatachannel = null; peerState.pc.close(); } catch (e) { console.warn("peer pc close:", e); }
  }
  peerState.pc = null;
  peerState.dc = null;
  peerState.incoming = null;
  peerState.sending = false;
  if (!keepSdp) {
    if (peerLocalSdp) peerLocalSdp.value = "";
    if (peerRemoteSdp) peerRemoteSdp.value = "";
  }
  clearPeerQr();
  updatePeerTransferUi();
}

function createPeerConnection(role) {
  resetPeerSession(true);
  peerState.role = role;
  if (peerRoleSelect) peerRoleSelect.value = role;
  const pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
  peerState.pc = pc;
  pc.onconnectionstatechange = () => {
    setPeerConnState(`Transfer link: ${pc.connectionState}`);
    appendPeerLog(`Peer connection state: ${pc.connectionState}`);
  };
  pc.oniceconnectionstatechange = () => appendPeerLog(`ICE: ${pc.iceConnectionState}`);
  if (role === "base") {
    attachPeerDataChannel(pc.createDataChannel("photo-transfer", { ordered: true }));
  } else {
    pc.ondatachannel = (evt) => attachPeerDataChannel(evt.channel);
  }
  return pc;
}

function waitForIceGatheringComplete(pc) {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const onState = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", onState);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", onState);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", onState);
      resolve();
    }, 8000);
  });
}

function parseRemoteSdp() {
  const raw = (peerRemoteSdp?.value || "").trim();
  if (!raw) throw new Error("Paste the remote SDP first.");
  const obj = JSON.parse(raw);
  if (!obj || typeof obj.type !== "string" || typeof obj.sdp !== "string") throw new Error("Remote SDP is invalid.");
  return obj;
}

async function peerCreateOffer() {
  if (peerState.role !== "base") { setStatus("Switch to Base role before creating an offer."); return; }
  try {
    const pc = createPeerConnection("base");
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGatheringComplete(pc);
    if (peerLocalSdp) peerLocalSdp.value = JSON.stringify(pc.localDescription);
    clearPeerQr();
    setPeerConnState("Transfer link: waiting for answer");
    appendPeerLog("Offer created. Share Local SDP to Rover.");
    setStatus("Offer created. Copy Local SDP into the Rover browser.");
  } catch (e) {
    setStatus("WebRTC offer failed: " + e.message);
  }
}

async function peerApplyOffer() {
  if (peerState.role !== "rover") { setStatus("Switch to Rover role before applying an offer."); return; }
  try {
    const remote = parseRemoteSdp();
    if (remote.type !== "offer") throw new Error("Remote SDP must be an offer.");
    const pc = createPeerConnection("rover");
    await pc.setRemoteDescription(remote);
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);
    await waitForIceGatheringComplete(pc);
    if (peerLocalSdp) peerLocalSdp.value = JSON.stringify(pc.localDescription);
    clearPeerQr();
    appendPeerLog("Offer applied. Share Local SDP answer back to Base.");
    setStatus("Answer created. Copy Local SDP into the Base browser.");
  } catch (e) {
    setStatus("Apply offer failed: " + e.message);
  }
}

async function peerApplyAnswer() {
  if (peerState.role !== "base") { setStatus("Switch to Base role before applying an answer."); return; }
  try {
    if (!peerState.pc) throw new Error("Create an offer first.");
    const remote = parseRemoteSdp();
    if (remote.type !== "answer") throw new Error("Remote SDP must be an answer.");
    await peerState.pc.setRemoteDescription(remote);
    appendPeerLog("Answer applied. Waiting for data channel to open.");
    setStatus("Answer applied. Waiting for link to connect…");
  } catch (e) {
    setStatus("Apply answer failed: " + e.message);
  }
}

async function copyLocalSdp() {
  const text = (peerLocalSdp?.value || "").trim();
  if (!text) { setStatus("No Local SDP yet."); return; }
  if (!navigator.clipboard?.writeText) { setStatus("Clipboard API unavailable in this browser context."); return; }
  try {
    await navigator.clipboard.writeText(text);
    setStatus("Local SDP copied.");
  } catch (e) {
    setStatus("Clipboard copy failed: " + e.message);
  }
}

function clearPeerQr() {
  if (peerQrCode) peerQrCode.innerHTML = "";
  if (peerQrBox) peerQrBox.hidden = true;
}

function renderPeerLocalQr() {
  const text = (peerLocalSdp?.value || "").trim();
  if (!text) { setStatus("No Local SDP yet."); return; }
  if (typeof QRCode !== "function") { setStatus("QR generator not loaded."); return; }
  if (!peerQrCode || !peerQrBox) return;
  try {
    peerQrCode.innerHTML = "";
    new QRCode(peerQrCode, {
      text,
      width: 240,
      height: 240,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.M
    });
    peerQrBox.hidden = false;
    appendPeerLog("Rendered local SDP as QR.");
    setStatus("QR ready. Scan it on the other device.");
  } catch (e) {
    setStatus("QR generation failed: " + e.message);
  }
}

async function startPeerQrScan() {
  if (!peerQrScannerModal || !peerQrScannerVideo || !peerRemoteSdp) return;
  if (!("BarcodeDetector" in window)) {
    setStatus("QR scan needs BarcodeDetector support. Paste SDP manually.");
    return;
  }
  try {
    if (!peerQrDetector) peerQrDetector = new BarcodeDetector({ formats: ["qr_code"] });
    peerQrScanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    peerQrScannerVideo.srcObject = peerQrScanStream;
    await peerQrScannerVideo.play();
    peerQrScannerModal.hidden = false;
    if (peerQrScannerStatus) peerQrScannerStatus.textContent = "Point camera at the QR code.";
    runPeerQrScanLoop();
  } catch (e) {
    stopPeerQrScan();
    setStatus("QR scan start failed: " + e.message);
  }
}

function runPeerQrScanLoop() {
  if (!peerQrScannerVideo || !peerQrDetector) return;
  const tick = async () => {
    if (!peerQrScanStream || !peerQrDetector) return;
    try {
      const barcodes = await peerQrDetector.detect(peerQrScannerVideo);
      const hit = barcodes && barcodes[0] && typeof barcodes[0].rawValue === "string" ? barcodes[0].rawValue.trim() : "";
      if (hit) {
        if (peerRemoteSdp) peerRemoteSdp.value = hit;
        stopPeerQrScan();
        appendPeerLog("Scanned QR into Remote SDP.");
        setStatus("QR scanned. Apply offer/answer now.");
        return;
      }
    } catch (e) {
      if (peerQrScannerStatus) peerQrScannerStatus.textContent = "Scanning…";
      console.warn("QR detect frame error:", e);
    }
    peerQrScanLoopId = requestAnimationFrame(tick);
  };
  peerQrScanLoopId = requestAnimationFrame(tick);
}

function stopPeerQrScan(statusText) {
  if (peerQrScanLoopId) {
    cancelAnimationFrame(peerQrScanLoopId);
    peerQrScanLoopId = null;
  }
  if (peerQrScannerVideo) {
    try { peerQrScannerVideo.pause(); } catch (e) { console.warn("QR video pause:", e); }
    peerQrScannerVideo.srcObject = null;
  }
  if (peerQrScanStream) {
    for (const t of peerQrScanStream.getTracks()) t.stop();
    peerQrScanStream = null;
  }
  if (peerQrScannerModal) peerQrScannerModal.hidden = true;
  if (statusText) setStatus(statusText);
}

function attachPeerDataChannel(dc) {
  peerState.dc = dc;
  dc.binaryType = "arraybuffer";
  dc.onopen = () => {
    setPeerConnState(`Transfer link: connected (${peerState.role})`);
    appendPeerLog("Data channel open.");
    if (peerSendFilesBtn) peerSendFilesBtn.disabled = peerState.role !== "rover";
    setStatus("Transfer link connected.");
  };
  dc.onclose = () => {
    appendPeerLog("Data channel closed.");
    setPeerConnState("Transfer link: closed");
    if (peerSendFilesBtn) peerSendFilesBtn.disabled = true;
  };
  dc.onmessage = (evt) => { void handlePeerMessage(evt.data); };
}

async function handlePeerMessage(data) {
  if (typeof data === "string") {
    let msg;
    try { msg = JSON.parse(data); } catch (e) { console.warn("peer msg parse:", e); return; }
    if (msg.t === "file-start") {
      peerState.incoming = {
        id: msg.id,
        name: msg.name || "photo.jpg",
        mime: msg.mime || "image/jpeg",
        hash: msg.hash || null,
        size: Number(msg.size) || 0,
        createdAt: msg.createdAt || new Date().toISOString(),
        chunks: [],
        received: 0
      };
      appendPeerLog(`Receiving ${peerState.incoming.name} (${peerState.incoming.size} bytes)…`);
      return;
    }
    if (msg.t === "file-end") {
      await finalizeIncomingFile(msg.id);
      return;
    }
    return;
  }
  if (!peerState.incoming) return;
  const chunkBuffer = data instanceof ArrayBuffer ? data : await data.arrayBuffer();
  peerState.incoming.chunks.push(chunkBuffer);
  peerState.incoming.received += chunkBuffer.byteLength;
  if (peerState.incoming.size) {
    const pct = Math.min(100, Math.round(peerState.incoming.received * 100 / peerState.incoming.size));
    setPeerConnState(`Transfer link: receiving ${peerState.incoming.name} (${pct}%)`);
  }
}

async function finalizeIncomingFile(fileId) {
  const incoming = peerState.incoming;
  if (!incoming || incoming.id !== fileId) return;
  const blob = new Blob(incoming.chunks, { type: incoming.mime || "image/jpeg" });
  let targetBridgeId = activeBridgeId || (bridges[0]?.id || null);
  if (!targetBridgeId) {
    const b = {
      id: createId(),
      title: "Transferred Photos",
      description: "Auto-created by the WebRTC transfer tool.",
      createdAt: new Date().toISOString(),
      kml: null,
      reportConfig: null,
    };
    await putBridgeRec(b);
    bridges.push(b);
    targetBridgeId = b.id;
  }
  let incomingHash = incoming.hash || null;
  if (!incomingHash) {
    try { incomingHash = await sha256HexFromBlob(blob); } catch (e) { console.warn("incoming hash:", e); }
  }
  const existing = await runTransaction("readonly", (store) => store.getAll());
  const dup = incomingHash
    ? existing.find((r) => r && !r.isScanFrame && !r.isScanSession && r.bridgeId === targetBridgeId && r.transferHash === incomingHash)
    : null;
  if (dup) {
    appendPeerLog(`Skipped duplicate transfer for ${incoming.name}.`);
    setStatus(`Received photo already exists: ${incoming.name}`);
  } else {
    const record = {
      id: createId(),
      bridgeId: targetBridgeId,
      createdAt: incoming.createdAt,
      comment: `Transferred from rover: ${incoming.name}`,
      location: null,
      heading: null,
      facing: null,
      blob,
      thermalBlob: null,
      depthBlob: null,
      plyText: null,
      tags: emptyTags(),
      transferredVia: "webrtc-local",
      transferHash: incomingHash,
    };
    await runTransaction("readwrite", (store) => store.put(record));
    if (activeBridgeId === targetBridgeId) await renderSavedPhotos();
    appendPeerLog(`Saved ${incoming.name} to this device.`);
    setStatus(`Received photo: ${incoming.name}`);
  }
  setPeerConnState("Transfer link: connected");
  peerState.incoming = null;
}

async function waitForDcDrain(dc, maxBuffered = 4 * 1024 * 1024, target = 512 * 1024, timeoutMs = 8000) {
  if (dc.bufferedAmount <= maxBuffered) return;
  const started = Date.now();
  while (dc.bufferedAmount > target) {
    if (Date.now() - started > timeoutMs) throw new Error("Sender backpressure timeout.");
    await new Promise((r) => setTimeout(r, 30));
  }
}

async function peerSendSelectedFiles() {
  if (peerState.role !== "rover") { setStatus("Switch to Rover role to send files."); return; }
  const dc = peerState.dc;
  if (!dc || dc.readyState !== "open") { setStatus("Connect the transfer link first."); return; }
  const files = Array.from(peerFileInput?.files || []);
  if (!files.length) { setStatus("Select one or more photos first."); return; }
  if (peerState.sending) { setStatus("A transfer is already in progress."); return; }
  peerState.sending = true;
  if (peerSendFilesBtn) peerSendFilesBtn.disabled = true;
  try {
    for (const f of files) await sendBlobOverDataChannel(f, f.name || "photo.jpg", f.type || "image/jpeg", dc);
    appendPeerLog(`Sent ${files.length} file(s).`);
    setStatus(`Sent ${files.length} photo${files.length === 1 ? "" : "s"}.`);
    if (peerFileInput) peerFileInput.value = "";
  } catch (e) {
    setStatus("Send failed: " + e.message);
  } finally {
    peerState.sending = false;
    if (peerSendFilesBtn) peerSendFilesBtn.disabled = false;
  }
}

async function sendBlobOverDataChannel(blob, name, mime, dc) {
  const id = createId();
  const CHUNK = 64 * 1024;
  const hash = await sha256HexFromBlob(blob);
  dc.send(JSON.stringify({ t: "file-start", id, name: name || "photo.jpg", mime: mime || "image/jpeg", size: blob.size, hash, createdAt: new Date().toISOString() }));
  const buf = await blob.arrayBuffer();
  let sent = 0;
  while (sent < buf.byteLength) {
    const end = Math.min(sent + CHUNK, buf.byteLength);
    dc.send(buf.slice(sent, end));
    sent = end;
    await waitForDcDrain(dc);
  }
  dc.send(JSON.stringify({ t: "file-end", id }));
  appendPeerLog(`Sent ${name || "photo.jpg"} (${blob.size} bytes).`);
}

function queueAutoSendCapture(blob) {
  if (peerState.role !== "rover" || !peerState.autoSend) return;
  const dc = peerState.dc;
  if (!dc || dc.readyState !== "open") return;
  peerSendQueue = peerSendQueue.then(async () => {
    if (peerState.sending) return;
    peerState.sending = true;
    try {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      await sendBlobOverDataChannel(blob, `capture-${stamp}.jpg`, "image/jpeg", dc);
      setStatus("Photo saved and auto-sent.");
    } catch (e) {
      setStatus("Photo saved, but auto-send failed: " + e.message);
    } finally {
      peerState.sending = false;
    }

    async function sha256HexFromBlob(blob) {
      if (!crypto?.subtle) throw new Error("WebCrypto not available.");
      const buf = await blob.arrayBuffer();
      const hashBuf = await crypto.subtle.digest("SHA-256", buf);
      const arr = Array.from(new Uint8Array(hashBuf));
      return arr.map((b) => b.toString(16).padStart(2, "0")).join("");
    }
  }).catch((e) => console.warn("auto-send queue:", e));
}

async function openPeerSavedPickerModal() {
  if (peerState.role !== "rover") { setStatus("Switch to Rover role to send saved photos."); return; }
  const dc = peerState.dc;
  if (!dc || dc.readyState !== "open") { setStatus("Connect the transfer link first."); return; }
  const records = await getActivePhotos();
  const sendable = records.filter((r) => r?.blob instanceof Blob);
  if (!sendable.length) { setStatus("No saved photos in this bridge yet."); return; }
  let overlay = document.getElementById("peerSavedPickerModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "peerSavedPickerModal";
    overlay.className = "sketch-modal";
    overlay.innerHTML = `
      <div class="sketch-dialog capture-tags-dialog" style="max-width:860px;">
        <div class="sketch-header">
          <span class="sketch-title">🖼 Send saved app photos</span>
          <button class="peer-saved-close secondary" type="button">✕</button>
        </div>
        <div class="sketch-canvas-wrap" style="display:block;max-height:62vh;overflow:auto;padding:10px 12px;">
          <div class="peer-saved-toprow">
            <span id="peerSavedCount" class="peer-saved-count">0 selected</span>
            <div style="display:flex;gap:8px;">
              <button id="peerSavedSelectAll" type="button" class="secondary">Select all</button>
              <button id="peerSavedClearAll" type="button" class="secondary">Clear</button>
            </div>
          </div>
          <div id="peerSavedGrid" class="peer-saved-grid"></div>
        </div>
        <div class="sketch-footer">
          <span class="sketch-hint">Photos come from the current bridge gallery in this app.</span>
          <div class="sketch-footer-btns">
            <button type="button" class="peer-saved-cancel secondary">Cancel</button>
            <button type="button" class="peer-saved-send">📤 Send selected</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.style.display = "none"; });
    overlay.querySelector(".peer-saved-close").addEventListener("click", () => { overlay.style.display = "none"; });
    overlay.querySelector(".peer-saved-cancel").addEventListener("click", () => { overlay.style.display = "none"; });
  }

  const grid = overlay.querySelector("#peerSavedGrid");
  const countEl = overlay.querySelector("#peerSavedCount");
  const selected = new Set();
  const byId = new Map(sendable.map((r) => [r.id, r]));
  const thumbUrls = [];
  const refreshCount = () => { countEl.textContent = `${selected.size} selected`; };
  const revokeThumbs = () => { while (thumbUrls.length) URL.revokeObjectURL(thumbUrls.pop()); };
  const closeModal = () => { overlay.style.display = "none"; revokeThumbs(); };
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };
  overlay.querySelector(".peer-saved-close").onclick = closeModal;
  overlay.querySelector(".peer-saved-cancel").onclick = closeModal;

  grid.replaceChildren();
  sendable.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  for (const rec of sendable) {
    const item = document.createElement("div");
    item.className = "peer-saved-item";
    const url = URL.createObjectURL(rec.blob);
    thumbUrls.push(url);
    const ts = rec.createdAt ? new Date(rec.createdAt).toLocaleString() : "";
    item.innerHTML = `
      <img alt="Saved photo" src="${url}">
      <label class="peer-saved-check"><input type="checkbox" data-id="${rec.id}">Select</label>
      <div class="peer-saved-meta">${ts}</div>`;
    const box = item.querySelector("input[type=checkbox]");
    box.addEventListener("change", () => {
      if (box.checked) selected.add(rec.id);
      else selected.delete(rec.id);
      refreshCount();
    });
    grid.append(item);
  }
  refreshCount();

  overlay.querySelector("#peerSavedSelectAll").onclick = () => {
    for (const cb of grid.querySelectorAll("input[type=checkbox]")) { cb.checked = true; selected.add(cb.dataset.id); }
    refreshCount();
  };
  overlay.querySelector("#peerSavedClearAll").onclick = () => {
    for (const cb of grid.querySelectorAll("input[type=checkbox]")) cb.checked = false;
    selected.clear();
    refreshCount();
  };
  overlay.querySelector(".peer-saved-send").onclick = async () => {
    if (!selected.size) { setStatus("Select at least one saved photo."); return; }
    const dcNow = peerState.dc;
    if (!dcNow || dcNow.readyState !== "open") { setStatus("Transfer link disconnected. Reconnect first."); return; }
    if (peerState.sending) { setStatus("A transfer is already in progress."); return; }
    peerState.sending = true;
    if (peerSendFilesBtn) peerSendFilesBtn.disabled = true;
    if (peerPickSavedBtn) peerPickSavedBtn.disabled = true;
    try {
      let sent = 0;
      for (const id of selected) {
        const rec = byId.get(id);
        if (!rec || !(rec.blob instanceof Blob)) continue;
        const stamp = String(rec.createdAt || new Date().toISOString()).replace(/[:.]/g, "-");
        await sendBlobOverDataChannel(rec.blob, `saved-${stamp}-${rec.id.slice(0, 8)}.jpg`, "image/jpeg", dcNow);
        sent++;
      }
      appendPeerLog(`Sent ${sent} saved app photo(s).`);
      setStatus(`Sent ${sent} saved app photo${sent === 1 ? "" : "s"}.`);
      closeModal();
    } catch (e) {
      setStatus("Send saved photos failed: " + e.message);
    } finally {
      peerState.sending = false;
      if (peerSendFilesBtn) peerSendFilesBtn.disabled = false;
      if (peerPickSavedBtn) peerPickSavedBtn.disabled = false;
    }
  };

  overlay.style.display = "flex";
}

// ── Camera ────────────────────────────────────────────────────────────────────
async function startMainCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { revealFallback("Camera not supported. Import photos instead."); return; }
  stopMainCamera();
  try {
    // Prefer an explicitly chosen device; otherwise fall back to facingMode.
    const video = mainCameraId
      ? { deviceId: { exact: mainCameraId }, width: { ideal: 1600 }, height: { ideal: 1200 } }
      : { facingMode: { ideal: facingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } };
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video, audio: false });
    } catch (e) {
      // Chosen device may be unavailable (unplugged/blocked) — fall back gracefully.
      if (mainCameraId) {
        console.warn("[camera] chosen device failed, falling back:", e);
        mainCameraId = null; localStorage.removeItem("mainCameraId");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facingMode }, width: { ideal: 1600 }, height: { ideal: 1200 } }, audio: false,
        });
      } else { throw e; }
    }
    cameraPreview.srcObject = stream;
    cameraFallback.hidden = true;
    captureButton.disabled = false;
    switchCameraButton.disabled = false;
    if (scanToggleBtn) scanToggleBtn.disabled = false;
    // Sync the active device id (in case facingMode/fallback picked it).
    const activeId = stream.getVideoTracks()?.[0]?.getSettings()?.deviceId;
    if (activeId) mainCameraId = activeId;
    setStatus(`Camera ready (${facingLabel(facingMode)} lens).`);
    await populateMainSelector();
    await populateThermalSelector();
  } catch (err) { revealFallback(`Camera access failed: ${err.message}`); }
}

async function populateMainSelector() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((d) => d.kind === "videoinput");
    const activeId = stream?.getVideoTracks()?.[0]?.getSettings()?.deviceId;
    mainCameraSelect.innerHTML = "";
    cameras.forEach((cam, i) => {
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${i + 1}`;
      if (cam.deviceId === (mainCameraId || activeId)) opt.selected = true;
      mainCameraSelect.append(opt);
    });
    // Only useful to choose when there's more than one camera.
    mainCameraSelector.hidden = cameras.length < 2;
  } catch (e) { console.warn("Main camera enumeration:", e); }
}

async function populateThermalSelector() {
  try {
    const devices  = await navigator.mediaDevices.enumerateDevices();
    const cameras  = devices.filter(d => d.kind === "videoinput");
    const current  = stream?.getVideoTracks()?.[0]?.getSettings()?.deviceId;
    thermalCameraSelect.innerHTML = '<option value="">None</option>';
    cameras.forEach((cam, i) => {
      if (cam.deviceId === current) return;
      const opt = document.createElement("option");
      opt.value = cam.deviceId;
      opt.textContent = cam.label || `Camera ${i + 1}`;
      thermalCameraSelect.append(opt);
    });
    cameraSelector.hidden = cameras.length < 2;
    depthModeRow.hidden   = cameras.length < 2;
    updateDepthUiVisibility(cameras.length >= 2);
  } catch (e) { console.warn("Camera enumeration:", e); }
}

function updateDepthUiVisibility(hasStereoCamera = !!thermalStream) {
  const canShowToggle = !!hasStereoCamera;
  if (depthModeRow) depthModeRow.hidden = !canShowToggle;
  if (refineRow) refineRow.hidden = !canShowToggle || !depthModeEnabled;
  if (cutoffRow) cutoffRow.hidden = !canShowToggle || !depthModeEnabled;
  if (calibrateDepthBtn) calibrateDepthBtn.hidden = !canShowToggle || !depthModeEnabled;
}

async function startThermalCamera() {
  const deviceId = thermalCameraSelect.value;
  if (!deviceId) return;
  stopThermalCamera();
  try {
    // Stereo cameras (e.g. IMP02G) output a WIDE side-by-side frame (this unit is
    // 2560x960 native). Chromium's getUserMedia snaps to the mode with the best
    // "fitness distance" to the requested ideal, and a plain high ideal often
    // lands on a small 640x480 mode. Strategy:
    //   1) open a probe stream to read the camera's advertised capabilities,
    //   2) reopen requesting the EXACT advertised max width/height,
    //   3) if that's rejected, fall back to max width + max as ideals,
    //   4) surface the real numbers (caps + actual) so we can diagnose.
    let track;
    let capsInfo = "";

    // 1) Probe.
    const probe = await navigator.mediaDevices.getUserMedia({
      video: { deviceId: { exact: deviceId } }, audio: false,
    });
    const probeTrack = probe.getVideoTracks()[0];
    const caps = probeTrack.getCapabilities ? probeTrack.getCapabilities() : null;
    const wMax = caps && caps.width  ? caps.width.max  : null;
    const hMax = caps && caps.height ? caps.height.max : null;
    capsInfo = (wMax && hMax) ? `caps max ${wMax}\u00d7${hMax}` : "caps unknown";
    // Stop the probe so we can reopen at full res (some drivers won't switch
    // format on a live track).
    for (const t of probe.getTracks()) t.stop();

    // 2) Reopen at the advertised max, exact first.
    async function openAt(vconstr) {
      return navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId }, ...vconstr }, audio: false,
      });
    }
    if (wMax && hMax) {
      try {
        thermalStream = await openAt({ width: { exact: wMax }, height: { exact: hMax } });
      } catch (e1) {
        console.warn("exact max failed, trying ideal max:", e1);
        thermalStream = await openAt({ width: { ideal: wMax }, height: { ideal: hMax } });
      }
    } else {
      // No capability info: ask for a very wide, very tall ideal.
      thermalStream = await openAt({ width: { ideal: 4096 }, height: { ideal: 2160 } });
    }
    track = thermalStream.getVideoTracks()[0];

    thermalPreview.srcObject = thermalStream;
    thermalFrame.hidden = false;
    startThermalButton.hidden = true;
    stopThermalButton.hidden = false;
    updateDepthUiVisibility(true);

    const s = track.getSettings();
    setStatus(`Stereo camera: actual ${s.width}\u00d7${s.height} \u00b7 ${capsInfo}`);
    console.log("Stereo camera capabilities:", caps);
    console.log("Stereo camera settings:", s);
  } catch (err) { setStatus(`Thermal camera failed: ${err.message}`); }
}

function stopThermalCamera() {
  if (!thermalStream) return;
  depthModeEnabled = false;
  if (depthModeCheck) depthModeCheck.checked = false;
  stopDepthMode();
  for (const t of thermalStream.getTracks()) t.stop();
  thermalStream = undefined;
  thermalPreview.srcObject = null;
  thermalFrame.hidden = true;
  startThermalButton.hidden = false;
  stopThermalButton.hidden = true;
  updateDepthUiVisibility(false);
}

function stopMainCamera() {
  if (scanActive) finishScanSession();
  if (scanToggleBtn) scanToggleBtn.disabled = true;
  if (!stream) return;
  for (const t of stream.getTracks()) t.stop();
  stream = undefined;
  cameraPreview.srcObject = null;
}

// ── Location + Heading + Attitude ─────────────────────────────────────────────
function acquireGeoAndHeading() {
  geoText.textContent = "Location: acquiring\u2026";
  headingText.textContent = "Direction: acquiring\u2026";
  acquireLocationNow(
    (loc) => { currentLocation = loc; geoText.textContent = `Location: ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)} (\u00b1${loc.accuracy}m)`; },
    (err) => { geoText.textContent = `Location: failed \u2014 ${err.message}`; }
  );
  acquireOrientationOnce(
    (o) => {
      if (o.heading != null) currentHeading = o.heading;
      if (o.attitude != null) currentAttitude = o.attitude;
      headingText.textContent = orientationSummary();
    },
    (msg) => { headingText.textContent = `Direction: ${msg}`; }
  );
}

function orientationSummary() {
  const dir = currentHeading != null
    ? `Direction: ${currentHeading}\u00b0 ${bearingLabel(currentHeading)} \u00b7 ${facingLabel(facingMode)} camera`
    : "Direction: unknown";
  const att = currentAttitude != null ? ` \u00b7 Attitude: ${attitudeLabel(currentAttitude)}` : "";
  return dir + att;
}

function acquireLocationNow(onSuccess, onError) {
  if (!navigator.geolocation) { onError(new Error("Not supported")); return; }
  navigator.geolocation.getCurrentPosition(
    (p) => onSuccess({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
    onError, { enableHighAccuracy: true, timeout: 10000 }
  );
}

// Promise-based fresh GPS fix (forces a new reading; no cached position).
// Resolves null on failure/timeout so callers can fall back gracefully.
function getFreshLocation(timeoutMs = 8000) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) { resolve(null); return; }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy) }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

// One-shot device orientation read. Returns { heading, attitude }:
//   heading  = compass bearing 0\u2013360 (webkitCompassHeading, else alpha)
//   attitude = camera angle from horizontal in degrees, derived from beta:
//              beta 90 (phone upright) \u2192 0\u00b0 (level), beta 0 (flat, screen up)
//              \u2192 -90\u00b0 (pointing down), beta 180 (screen down) \u2192 +90\u00b0 (up).
function acquireOrientationOnce(onSuccess, onFail) {
  if (typeof DeviceOrientationEvent === "undefined") { onFail("not supported"); return; }
  function handler(e) {
    const h = e.webkitCompassHeading ?? e.alpha;
    const beta = e.beta;
    if (h == null && beta == null) { onFail("sensor not available"); return; }
    window.removeEventListener("deviceorientation", handler, true);
    onSuccess({
      heading:  h == null ? null : Math.round(h),
      attitude: beta == null ? null : Math.round(beta - 90),
    });
  }
  if (typeof DeviceOrientationEvent.requestPermission === "function") {
    DeviceOrientationEvent.requestPermission()
      .then((s) => s === "granted" ? window.addEventListener("deviceorientation", handler, true) : onFail("permission denied"))
      .catch(() => onFail("permission request failed"));
  } else {
    window.addEventListener("deviceorientation", handler, true);
  }
}

// Promise wrapper that resolves { heading, attitude } (or null) with a short
// timeout, for grabbing a fresh reading at the instant of capture.
function getFreshOrientation(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    acquireOrientationOnce((o) => finish(o), () => finish(null));
    setTimeout(() => finish(null), timeoutMs);
  });
}

// Backward-compatible heading-only helper used by the editor re-acquire button.
function acquireHeadingOnce(onSuccess, onFail) {
  acquireOrientationOnce(
    (o) => { if (o.heading != null) onSuccess(o.heading); else onFail("sensor not available"); },
    onFail
  );
}

function bearingLabel(deg) { return ["N","NE","E","SE","S","SW","W","NW"][Math.round(deg / 45) % 8]; }
function facingLabel(mode) { return mode === "environment" ? "rear" : "front"; }
function attitudeLabel(a) {
  if (a == null) return "unknown";
  if (a > 2)  return `${a}\u00b0 up`;
  if (a < -2) return `${Math.abs(a)}\u00b0 down`;
  return "level (0\u00b0)";
}

function bearingBetween(from, to) {
  const r = (d) => (d * Math.PI) / 180;
  const y = Math.sin(r(to.lng - from.lng)) * Math.cos(r(to.lat));
  const x = Math.cos(r(from.lat)) * Math.sin(r(to.lat)) - Math.sin(r(from.lat)) * Math.cos(r(to.lat)) * Math.cos(r(to.lng - from.lng));
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

// ── Capture ───────────────────────────────────────────────────────────────────
async function capturePhoto() {
  if (!stream) { setStatus("Start the camera first."); return; }
  const w = cameraPreview.videoWidth, h = cameraPreview.videoHeight;
  if (!w || !h) { setStatus("Camera warming up \u2014 try again."); return; }
  snapshotCanvas.width = w; snapshotCanvas.height = h;
  snapshotCanvas.getContext("2d").drawImage(cameraPreview, 0, 0, w, h);
  const mainBlob = await canvasToBlob(snapshotCanvas);

  let thermalBlob = null;
  if (thermalStream) {
    const tw = thermalPreview.videoWidth, th = thermalPreview.videoHeight;
    if (tw && th) {
      const tc = document.createElement("canvas");
      tc.width = tw; tc.height = th;
      tc.getContext("2d").drawImage(thermalPreview, 0, 0, tw, th);
      thermalBlob = await canvasToBlob(tc);
    }
  }

  let depthBlob = null, plyText = null;
  const wsState = depthWs ? depthWs.readyState : "no-ws";
  console.log("[capture] depthModeEnabled=", depthModeEnabled, "wsState=", wsState);
  if (depthModeEnabled && depthWs && depthWs.readyState === WebSocket.OPEN) {
    setStatus("Capturing depth map + 3D point cloud…");
    try {
      const res = await captureDepthFrame();
      depthBlob = res.depthBlob;
      plyText   = res.plyText;
      console.log("[capture] depth OK, points=", res.count, "depthBlob=", depthBlob && depthBlob.size, "ply chars=", plyText && plyText.length);
      setStatus(`Depth captured: ${res.count} pts. Saving…`);
    } catch (e) {
      console.warn("[capture] depth FAILED:", e);
      setStatus("⚠ Depth capture failed: " + e.message);
    }
  } else if (depthModeEnabled) {
    setStatus("⚠ Depth mode on but server not connected (state: " + wsState + "). Photo saved without depth.");
  }

  try {
    // Refresh location + orientation at the instant of capture so each photo
    // gets its own fresh GPS fix and camera angle.
    const freshLoc = await getFreshLocation();
    if (freshLoc) {
      currentLocation = freshLoc;
      geoText.textContent = `Location: ${freshLoc.lat.toFixed(5)}, ${freshLoc.lng.toFixed(5)} (\u00b1${freshLoc.accuracy}m)`;
    }
    const captureLoc = currentLocation || activeBridgeLocation();
    const freshOri = await getFreshOrientation();
    if (freshOri) {
      if (freshOri.heading  != null) currentHeading  = freshOri.heading;
      if (freshOri.attitude != null) currentAttitude = freshOri.attitude;
      headingText.textContent = orientationSummary();
    }
    await savePhoto(mainBlob, thermalBlob, commentInput.value.trim(), captureLoc, currentHeading, facingMode, depthBlob, plyText, normalizeTags(captureTags), { attitude: currentAttitude });
    queueAutoSendCapture(mainBlob);
  } catch (e) {
    console.error("[capture] savePhoto FAILED:", e);
    setStatus("⚠ Save failed: " + e.message + (plyText ? " (PLY too large for storage?)" : ""));
    return;
  }
  commentInput.value = "";
  captureTags = emptyTags();
  renderCaptureTags();
  if (depthModeEnabled && !depthBlob) {
    setStatus(`⚠ Photo saved (+ stereo) but DEPTH FAILED — depth server not connected. Run start_servers.bat, then re-check Depth mode.`);
  } else {
    setStatus(`Photo saved${thermalBlob ? " (+ stereo)" : ""}${depthBlob ? " (+ depth + PLY)" : ""}.`);
  }
}

async function saveFiles(files) {
  const manualComment = commentInput.value.trim();
  const importTags = normalizeTags(captureTags);
  let saved = 0;
  for (const f of files) {
    if (!f.type.startsWith("image/")) continue;
    const exifData = await readExifFromBlob(f);
    // EXIF GPS takes priority over current location; fall back to current
    // location, then to the active bridge's own location (e.g. NBI import).
    const location = exifData.location ?? currentLocation ?? activeBridgeLocation();
    const heading  = exifData.heading  ?? currentHeading;
    // Manual comment wins; otherwise use EXIF description
    const comment  = manualComment || exifData.comment || "";
    await savePhoto(f, null, comment, location, heading, null, null, null, importTags);
    saved++;
  }
  commentInput.value = "";
  captureTags = emptyTags();
  renderCaptureTags();
  setStatus(`${saved} photo${saved === 1 ? "" : "s"} imported.`);
}

// Read GPS, heading, and description from JPEG EXIF
async function readExifFromBlob(blob) {
  if (!window.piexif) return {};
  try {
    const buf    = await blob.arrayBuffer();
    const binary = bufferToBinaryString(buf);
    const exif   = piexif.load(binary);
    const result = {};

    // GPS coordinates
    const gps    = exif["GPS"] || {};
    const latArr = gps[piexif.GPSIFD.GPSLatitude];
    const latRef = gps[piexif.GPSIFD.GPSLatitudeRef];
    const lngArr = gps[piexif.GPSIFD.GPSLongitude];
    const lngRef = gps[piexif.GPSIFD.GPSLongitudeRef];
    if (latArr && lngArr) {
      let lat = dmsRationalToDecimal(latArr);
      let lng = dmsRationalToDecimal(lngArr);
      if (latRef === "S") lat = -lat;
      if (lngRef === "W") lng = -lng;
      result.location = { lat: parseFloat(lat.toFixed(7)), lng: parseFloat(lng.toFixed(7)), accuracy: 0 };
    }

    // Camera direction
    const dirArr = gps[piexif.GPSIFD.GPSImgDirection];
    if (dirArr && dirArr[1]) result.heading = Math.round(dirArr[0] / dirArr[1]);

    // Image description / user comment
    const zeroth   = exif["0th"]  || {};
    const exifIFD  = exif["Exif"] || {};
    const desc     = zeroth[piexif.ImageIFD.ImageDescription];
    const ucRaw    = exifIFD[piexif.ExifIFD.UserComment];
    if (desc && typeof desc === "string" && desc.trim()) {
      result.comment = desc.trim();
    } else if (ucRaw) {
      try {
        const uc   = typeof ucRaw === "string" ? ucRaw : String.fromCharCode(...new Uint8Array(ucRaw));
        // Strip 8-byte encoding prefix (ASCII\0\0\0, UNICODE\0, etc.)
        const text = uc.replace(/^[\s\S]{8}/, "").replace(/\0/g, "").trim();
        if (text) result.comment = text;
      } catch {}
    }
    return result;
  } catch (e) { console.warn("EXIF read failed:", e); return {}; }
}

function dmsRationalToDecimal(dms) {
  return dms[0][0] / dms[0][1]
       + dms[1][0] / dms[1][1] / 60
       + dms[2][0] / dms[2][1] / 3600;
}

// ── Storage ───────────────────────────────────────────────────────────────────
async function savePhoto(blob, thermalBlob = null, comment = "", location = null, heading = null, facing = null, depthBlob = null, plyText = null, tags = null, extra = null) {
  const record = { id: createId(), bridgeId: activeBridgeId, createdAt: new Date().toISOString(), comment, location, heading, facing, blob, thermalBlob, depthBlob, plyText, tags: normalizeTags(tags), ...(extra || {}) };
  await runTransaction("readwrite", (store) => store.put(record));
  await renderSavedPhotos();
}

// ── Guided pier scan (photogrammetry burst) ───────────────────────────────────
// Captures a series of sharp, well-overlapped frames with locked camera settings
// so the set reconstructs reliably in COLMAP / OpenMVG. The analysis loop tracks
// frame-to-frame motion to fire a capture at a target overlap, and rejects blurry
// or badly-exposed frames (quality gate).

// Freeze zoom / focus / exposure / white-balance so every frame shares intrinsics.
async function lockCameraForScan() {
  const track = stream?.getVideoTracks?.()[0];
  if (!track || !track.getCapabilities) return { locked: false, note: "MediaTrack capability API unavailable" };
  const caps = track.getCapabilities();
  const applied = [];
  const apply = async (c) => { try { await track.applyConstraints({ advanced: [c] }); applied.push(Object.keys(c).join("+")); return true; } catch (e) { console.warn("[scan] lock", c, e); return false; } };
  // 0) Push scan capture to max available camera mode (prefer exact max, then ideal).
  if (caps.width?.max && caps.height?.max) {
    const wMax = caps.width.max, hMax = caps.height.max;
    const exactOk = await apply({ width: wMax, height: hMax });
    if (!exactOk) await apply({ width: { ideal: wMax }, height: { ideal: hMax } });
    // Give the camera pipeline a moment to switch modes before we lock AF/AE.
    await new Promise((r) => setTimeout(r, 250));
  }
  // 1) Zoom → 1.0 (never digital-zoom; keeps focal length stable).
  if (caps.zoom) { const z = Math.min(Math.max(1, caps.zoom.min), caps.zoom.max); await apply({ zoom: z }); }
  // 2) Let AF/AE settle, then freeze at whatever it chose.
  await new Promise((r) => setTimeout(r, 500));
  const s0 = track.getSettings();
  if (caps.focusMode?.includes("manual")) await apply({ focusMode: "manual", ...(s0.focusDistance != null ? { focusDistance: s0.focusDistance } : {}) });
  else if (caps.focusMode?.includes("single-shot")) await apply({ focusMode: "single-shot" });
  else if (caps.focusMode?.includes("continuous")) await apply({ focusMode: "continuous" });
  if (caps.exposureMode?.includes("manual")) await apply({ exposureMode: "manual", ...(s0.exposureTime != null ? { exposureTime: s0.exposureTime } : {}), ...(s0.iso != null ? { iso: s0.iso } : {}) });
  else if (caps.exposureMode?.includes("single-shot")) await apply({ exposureMode: "single-shot" });
  if (caps.whiteBalanceMode?.includes("manual")) await apply({ whiteBalanceMode: "manual", ...(s0.colorTemperature != null ? { colorTemperature: s0.colorTemperature } : {}) });
  const s = track.getSettings();
  return {
    locked: applied.length > 0, applied,
    make: "Web", model: (navigator.userAgent || "unknown").slice(0, 120),
    imgW: s.width || null, imgH: s.height || null,
    zoom: s.zoom ?? null, focusMode: s.focusMode ?? null, focusDistance: s.focusDistance ?? null,
    exposureMode: s.exposureMode ?? null, whiteBalanceMode: s.whiteBalanceMode ?? null,
  };
}

async function startScanSession() {
  if (!stream) { setStatus("Start the camera before scanning."); return; }
  if (scanActive) return;
  setStatus("Locking camera settings for scan…");
  const camera = await lockCameraForScan();
  scanSession = {
    id: createId(), bridgeId: activeBridgeId, isScanSession: true,
    label: (scanLabel.value || "").trim() || "Pier scan",
    createdAt: new Date().toISOString(), mode: "burst", camera,
  };
  await runTransaction("readwrite", (store) => store.put(scanSession));
  scanActive = true; scanSeq = 0;
  scanPrevSmall = null; scanAccumDx = 0; scanAccumDy = 0;
  scanCooldownTs = performance.now();
  scanHud.hidden = false;
  scanToggleBtn.textContent = "■ Finish scan";
  captureButton.disabled = true; switchCameraButton.disabled = true;
  updateScanHud(0, 0, false, "Move slowly across the surface…", "");
  setStatus(camera.locked ? `Scan started — camera locked (${camera.imgW}×${camera.imgH}).` : "Scan started — camera lock not supported on this device; proceeding.");
  scanLoopId = requestAnimationFrame(scanTick);
}

async function finishScanSession() {
  if (!scanActive) return;
  scanActive = false;
  if (scanLoopId) { cancelAnimationFrame(scanLoopId); scanLoopId = null; }
  scanHud.hidden = true;
  scanToggleBtn.textContent = "▶ Start scan";
  captureButton.disabled = false; switchCameraButton.disabled = false;
  const n = scanSeq;
  if (n === 0 && scanSession) {
    // Nothing captured — discard the empty session record.
    await runTransaction("readwrite", (store) => store.delete(scanSession.id));
  }
  scanSession = null;
  setStatus(n ? `Scan finished — ${n} frame${n === 1 ? "" : "s"} saved.` : "Scan cancelled (no frames).");
  await renderSavedPhotos();
}

// Draw the live preview into a small grayscale buffer for analysis.
function grabGray(canvas, w, h) {
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(cameraPreview, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const g = new Uint8ClampedArray(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
  return g;
}

// Estimate small-scale translation (dx,dy) of `cur` vs `prev` via coarse SAD
// block-matching within ±SCAN_SEARCH px. Returns best offset + its cost.
function estimateShift(prev, cur, w, h) {
  const m = 16; // border margin excluded from comparison
  let best = { dx: 0, dy: 0, cost: Infinity };
  for (let dy = -SCAN_SEARCH; dy <= SCAN_SEARCH; dy += 2) {
    for (let dx = -SCAN_SEARCH; dx <= SCAN_SEARCH; dx += 2) {
      let sum = 0, cnt = 0;
      for (let y = m; y < h - m; y += 2) {
        const sy = y + dy; if (sy < 0 || sy >= h) continue;
        for (let x = m; x < w - m; x += 2) {
          const sx = x + dx; if (sx < 0 || sx >= w) continue;
          sum += Math.abs(cur[y * w + x] - prev[sy * w + sx]); cnt++;
        }
      }
      if (cnt) { const cost = sum / cnt; if (cost < best.cost) best = { dx, dy, cost }; }
    }
  }
  return best;
}

// Sharpness (variance of Laplacian) + mean luminance on the medium buffer.
function focusAndExposure() {
  const w = SCAN_MED_W, h = SCAN_MED_H;
  const g = grabGray(_scanMedCanvas, w, h);
  let mean = 0; for (let i = 0; i < g.length; i++) mean += g[i]; mean /= g.length;
  let s = 0, s2 = 0, n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w];
      s += lap; s2 += lap * lap; n++;
    }
  }
  const varLap = n ? (s2 / n - (s / n) * (s / n)) : 0;
  return { focus: varLap, luma: mean };
}

function updateScanHud(overlapFrac, focus, ready, msg, cls) {
  const pct = Math.max(0, Math.min(100, Math.round(overlapFrac * 100)));
  scanOverlapBar.style.width = pct + "%";
  scanOverlapBar.classList.toggle("ready", ready);
  scanCountEl.textContent = `${scanSeq} frame${scanSeq === 1 ? "" : "s"}`;
  scanFocusEl.textContent = `Sharpness: ${focus == null ? "–" : Math.round(focus)}`;
  scanOverlapPctEl.textContent = `Move: ${pct}%`;
  scanGuide.textContent = msg;
  scanGuide.className = "scan-guide" + (cls ? " " + cls : "");
}

function scanTick(ts) {
  if (!scanActive) return;
  scanLoopId = requestAnimationFrame(scanTick);
  if (ts - scanLastTickTs < SCAN_TICK_MS) return;
  scanLastTickTs = ts;
  const vw = cameraPreview.videoWidth, vh = cameraPreview.videoHeight;
  if (!vw || !vh || scanBusy) return;

  const cur = grabGray(_scanSmallCanvas, SCAN_SMALL_W, SCAN_SMALL_H);
  const { focus, luma } = focusAndExposure();
  const sharp = focus >= SCAN_FOCUS_MIN;
  const exposed = luma > 25 && luma < 232;

  if (!scanPrevSmall) { scanPrevSmall = cur; updateScanHud(0, focus, false, "Move slowly across the surface…", ""); return; }
  const { dx, dy } = estimateShift(scanPrevSmall, cur, SCAN_SMALL_W, SCAN_SMALL_H);
  scanPrevSmall = cur;
  scanAccumDx += dx; scanAccumDy += dy;
  const tickMag = Math.hypot(dx, dy);
  const moveFrac = Math.max(Math.abs(scanAccumDx) / SCAN_SMALL_W, Math.abs(scanAccumDy) / SCAN_SMALL_H);
  const progress = moveFrac / SCAN_MOVE_FRAC; // 1.0 = target overlap reached
  const cool = ts < scanCooldownTs;

  if (tickMag > SCAN_FAST_PX) { updateScanHud(progress, focus, false, "⚠ Slow down — moving too fast", "warn"); return; }
  if (!exposed)               { updateScanHud(progress, focus, false, luma <= 25 ? "⚠ Too dark" : "⚠ Too bright", "warn"); return; }
  if (!sharp)                 { updateScanHud(progress, focus, false, "⚠ Hold steady — image not sharp", "warn"); return; }
  if (cool)                   { updateScanHud(progress, focus, false, "Frame saved ✓ — keep panning…", "good"); return; }

  if (progress >= 1) {
    updateScanHud(1, focus, true, "📸 Capturing frame…", "good");
    captureScanFrame("auto", focus);
  } else {
    updateScanHud(progress, focus, false, `Keep moving — ${Math.round(progress * 100)}% to next frame`, "");
  }
}

async function captureScanFrame(reason, focusVal) {
  if (!scanActive || scanBusy || !scanSession) return;
  scanBusy = true;
  try {
    const w = cameraPreview.videoWidth, h = cameraPreview.videoHeight;
    if (!w || !h) return;
    snapshotCanvas.width = w; snapshotCanvas.height = h;
    snapshotCanvas.getContext("2d").drawImage(cameraPreview, 0, 0, w, h);
    let blob = await canvasToBlob(snapshotCanvas);

    const loc = currentLocation || activeBridgeLocation();
    // Clean image with EXIF GPS only — no burned-in caption (SfM needs raw pixels).
    if (loc) { try { blob = await injectGpsExif(blob, loc, currentHeading); } catch (e) { console.warn("[scan] exif", e); } }

    scanSeq += 1;
    const frame = {
      id: createId(), bridgeId: scanSession.bridgeId, isScanFrame: true,
      scanSessionId: scanSession.id, scanSeq, createdAt: new Date().toISOString(),
      blob, location: loc || null, heading: currentHeading, attitude: currentAttitude,
      focusScore: focusVal != null ? Math.round(focusVal) : null, reason,
    };
    await runTransaction("readwrite", (store) => store.put(frame));
    scanAccumDx = 0; scanAccumDy = 0;
    scanCooldownTs = performance.now() + SCAN_COOLDOWN_MS;
    scanCountEl.textContent = `${scanSeq} frame${scanSeq === 1 ? "" : "s"}`;
  } catch (e) {
    console.error("[scan] frame save failed:", e);
    setStatus("⚠ Scan frame save failed: " + e.message);
  } finally {
    scanBusy = false;
  }
}

// Inject GPS (and optional heading) EXIF into a JPEG blob without touching pixels.
async function injectGpsExif(blob, location, heading) {
  if (!window.piexif) return blob;
  const binary = bufferToBinaryString(await blob.arrayBuffer());
  let exifObj;
  try { exifObj = piexif.load(binary); } catch { exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} }; }
  const lat = location.lat, lng = location.lng;
  exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? "N" : "S";
  exifObj["GPS"][piexif.GPSIFD.GPSLatitude]     = decimalToDmsRational(Math.abs(lat));
  exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
  exifObj["GPS"][piexif.GPSIFD.GPSLongitude]    = decimalToDmsRational(Math.abs(lng));
  if (heading != null) {
    exifObj["GPS"][piexif.GPSIFD.GPSImgDirectionRef] = "T";
    exifObj["GPS"][piexif.GPSIFD.GPSImgDirection]    = [Math.round(heading * 100), 100];
  }
  const inserted = piexif.insert(piexif.dump(exifObj), binary);
  const bytes = new Uint8Array(inserted.length);
  for (let i = 0; i < inserted.length; i++) bytes[i] = inserted.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

async function getActiveScanSessions() {
  const records = await runTransaction("readonly", (store) => store.getAll());
  return records.filter((r) => r.isScanSession && r.bridgeId === activeBridgeId);
}
async function getScanFrames(sessionId) {
  const records = await runTransaction("readonly", (store) => store.getAll());
  return records.filter((r) => r.isScanFrame && r.scanSessionId === sessionId)
                .sort((a, b) => (a.scanSeq || 0) - (b.scanSeq || 0));
}

async function renderScanSessions() {
  if (!scanSessionsCard) return;
  const allSessions = await getActiveScanSessions();
  const scanNoById = buildScanNumberMap(allSessions);
  const sessions = allSessions.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  scanSessionsList.replaceChildren();
  if (!sessions.length) { scanSessionsCard.hidden = true; return; }
  scanSessionsCard.hidden = false;

  for (const s of sessions) {
    const scanNo = scanNoById.get(s.id) || "scan";
    const frames = await getScanFrames(s.id);
    const wrap = document.createElement("div"); wrap.className = "scan-session";
    const head = document.createElement("div"); head.className = "scan-session-head";
    const title = document.createElement("div"); title.className = "scan-session-title"; title.textContent = `🎞 ${scanNo} · ${s.label}`;
    const meta = document.createElement("div"); meta.className = "scan-session-meta";
    const cam = s.camera || {};
    meta.textContent = `${frames.length} frame${frames.length === 1 ? "" : "s"} · ${new Date(s.createdAt).toLocaleString()}${cam.imgW ? ` · ${cam.imgW}×${cam.imgH}` : ""}${cam.locked ? " · locked" : ""}`;
    head.append(title, meta); wrap.append(head);

    const thumbs = document.createElement("div"); thumbs.className = "scan-thumbs";
    for (const f of frames.slice(0, 24)) {
      if (!f.blob) continue;
      const img = document.createElement("img");
      img.src = URL.createObjectURL(f.blob);
      img.onload = () => URL.revokeObjectURL(img.src);
      thumbs.append(img);
    }
    wrap.append(thumbs);

    const actions = document.createElement("div"); actions.className = "scan-session-actions";
    const dl = makeButton("⬇ Download COLMAP set", "");
    dl.addEventListener("click", () => downloadScanSet(s.id, scanNo));
    const del = makeButton("🗑 Delete scan", "danger");
    del.addEventListener("click", () => deleteScanSession(s.id, s.label));
    actions.append(dl, del); wrap.append(actions);
    scanSessionsList.append(wrap);
  }
}

async function deleteScanSession(sessionId, label) {
  if (!confirm(`Delete scan “${label}” and all its frames? This cannot be undone.`)) return;
  const frames = await getScanFrames(sessionId);
  for (const f of frames) await runTransaction("readwrite", (store) => store.delete(f.id));
  await runTransaction("readwrite", (store) => store.delete(sessionId));
  setStatus(`Deleted scan “${label}”.`);
  await renderScanSessions();
}

// Export a scan as a COLMAP/OpenMVG-ready folder inside a ZIP.
async function downloadScanSet(sessionId, scanNoHint = null) {
  if (!window.JSZip) { setStatus("⚠ JSZip not loaded."); return; }
  const sessions = await getActiveScanSessions();
  const s = sessions.find((x) => x.id === sessionId);
  if (!s) { setStatus("Scan not found."); return; }
  const scanNo = scanNoHint || buildScanNumberMap(sessions).get(sessionId) || "scan";
  const frames = await getScanFrames(sessionId);
  if (!frames.length) { setStatus("Scan has no frames."); return; }

  setStatus(`Building COLMAP set for “${s.label}” (${frames.length} frames)…`);
  const zip = new JSZip();
  const safe = (str) => (str || "scan").replace(/[^\w\-]+/g, "_").slice(0, 50);
  const root = zip.folder(`${safe(scanNo)}_${safe(s.label)}`);
  const images = root.folder("images");

  const cam = s.camera || {};
  const manifest = {
    label: s.label, createdAt: s.createdAt, exportedAt: new Date().toISOString(),
    mode: s.mode, frameCount: frames.length, camera: cam, frames: [],
  };
  const poses = ["# name  lat  lon  heading_deg  attitude_deg"];

  let seq = 0;
  for (const f of frames) {
    seq += 1;
    const name = String(seq).padStart(4, "0") + ".jpg";
    if (f.blob) images.file(name, f.blob);
    manifest.frames.push({
      seq, name, capturedAt: f.createdAt,
      location: f.location || null, heading: f.heading ?? null,
      attitude: f.attitude ?? null, focusScore: f.focusScore ?? null, trigger: f.reason || null,
    });
    if (f.location) poses.push(`${name}  ${f.location.lat}  ${f.location.lng}  ${f.heading ?? ""}  ${f.attitude ?? ""}`);
  }

  root.file("metadata.json", JSON.stringify(manifest, null, 2));
  root.file("poses_prior.txt", poses.join("\n"));
  root.file("README.txt", scanReadme(s, frames.length));

  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe(scanNo)}.zip`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  setStatus(`COLMAP set “${s.label}” downloaded (${frames.length} frames).`);
}

function scanReadme(s, n) {
  const cam = s.camera || {};
  return [
    `Guided pier scan: ${s.label}`,
    `Captured: ${s.createdAt}`,
    `Frames: ${n}  (images/0001.jpg …)`,
    ``,
    `Camera lock at capture:`,
    `  resolution : ${cam.imgW || "?"} x ${cam.imgH || "?"}`,
    `  zoom       : ${cam.zoom ?? "n/a"}`,
    `  focusMode  : ${cam.focusMode ?? "n/a"}`,
    `  exposure   : ${cam.exposureMode ?? "n/a"}`,
    `  whiteBal   : ${cam.whiteBalanceMode ?? "n/a"}`,
    `  device     : ${cam.model || "unknown"}`,
    ``,
    `All frames were shot with locked zoom/focus so they share one set of`,
    `intrinsics. Reconstruct with a SINGLE shared camera model.`,
    ``,
    `--- COLMAP (GUI or CLI) ---`,
    `  colmap feature_extractor --database_path db.db --image_path images \\`,
    `        --ImageReader.single_camera 1`,
    `  colmap exhaustive_matcher --database_path db.db`,
    `  colmap mapper --database_path db.db --image_path images --output_path sparse`,
    `  # Dense (needs CUDA / NVIDIA GPU):`,
    `  colmap image_undistorter --image_path images --input_path sparse/0 --output_path dense`,
    `  colmap patch_match_stereo --workspace_path dense`,
    `  colmap stereo_fusion --workspace_path dense --output_path dense/fused.ply`,
    ``,
    `--- pycolmap (Python, sparse) ---`,
    `  import pycolmap`,
    `  pycolmap.extract_features("db.db", "images")`,
    `  pycolmap.match_exhaustive("db.db")`,
    `  maps = pycolmap.incremental_mapping("db.db", "images", "sparse")`,
    ``,
    `--- OpenMVG + OpenMVS (CPU dense, no GPU) ---`,
    `  openMVG_main_SfMInit_ImageListing -i images -o mvg -d sensor_db.txt`,
    `  openMVG_main_ComputeFeatures  -i mvg/sfm_data.json -o mvg`,
    `  openMVG_main_ComputeMatches   -i mvg/sfm_data.json -o mvg`,
    `  openMVG_main_IncrementalSfM   -i mvg/sfm_data.json -m mvg -o mvg/out`,
    `  # then convert to OpenMVS (openMVG_main_openMVG2openMVS) and run`,
    `  # DensifyPointCloud / ReconstructMesh / TextureMesh.`,
    ``,
    `poses_prior.txt holds per-image GPS + heading/attitude for georeferencing/scale.`,
  ].join("\n");
}


async function getActivePhotos() {
  const records = await runTransaction("readonly", (store) => store.getAll());
  return records.filter((r) => r.bridgeId === activeBridgeId && !r.isScanFrame && !r.isScanSession);
}

function sortOldestFirst(records) {
  return [...records].sort((a, b) =>
    String(a.createdAt || "").localeCompare(String(b.createdAt || "")) ||
    String(a.id || "").localeCompare(String(b.id || ""))
  );
}

function buildPhotoNumberMap(records) {
  const out = new Map();
  const oldest = sortOldestFirst(records);
  oldest.forEach((r, idx) => {
    const n = idx + 1;
    const dual = !!r.thermalBlob;
    const isSketch = !!r.isSketch;
    const main = isSketch ? `${n}-sketch` : (dual ? `${n}-a` : `${n}`);
    const thermal = dual ? `${n}-b` : null;
    const overlay = isSketch ? `${n}-sketch-overlay` : (dual ? `${n}-a-overlay` : `${n}-overlay`);
    out.set(r.id, { index: n, main, thermal, overlay, depth: `${n}-depth`, ply: `${n}-ply` });
  });
  return out;
}

function buildScanNumberMap(sessions) {
  const out = new Map();
  const oldest = sortOldestFirst(sessions);
  oldest.forEach((s, idx) => out.set(s.id, `${idx + 1}-scan`));
  return out;
}

function safeStem(text) {
  return String(text || "photo").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "photo";
}

async function renderSavedPhotos() {
  for (const [, inst] of leafletInstances) inst.lmap.remove();
  leafletInstances.clear();

  const records = (await getActivePhotos());
  const photoNoById = buildPhotoNumberMap(records);
  records.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  photoGrid.replaceChildren();

  if (!records.length) {
    emptyState.hidden = false; photoGrid.hidden = true; clearAllButton.disabled = true;
    if (wordReportButton) wordReportButton.disabled = true;
    await renderScanSessions();
    return;
  }
  clearAllButton.disabled = false; emptyState.hidden = true; photoGrid.hidden = false;
  if (wordReportButton) wordReportButton.disabled = false;

  for (const record of records) {
    const card = buildCard(record, photoNoById.get(record.id));
    photoGrid.append(card);
    const mapContainer = card.querySelector(".photo-map-container");
    if (record.location) {
      const inst = initMap(mapContainer, record);
      leafletInstances.set(record.id, inst);
      if (kmlGeoJSON) applyKmlToMap(inst);
    } else {
      mapContainer.hidden = true;
      const hint = card.querySelector(".map-hint");
      if (hint) hint.hidden = true;
    }
  }
  await renderScanSessions();
}

async function clearAllPhotos() {
  const mine = await getActivePhotos();
  if (!mine.length) {
    setStatus("No photos to delete in this bridge.");
    return;
  }
  const confirmed = window.confirm(`Delete all ${mine.length} photo(s) in this bridge? This cannot be undone.`);
  if (!confirmed) {
    setStatus("Delete all canceled.");
    return;
  }
  for (const p of mine) await runTransaction("readwrite", (store) => store.delete(p.id));
  await renderSavedPhotos();
  setStatus("All photos in this bridge deleted.");
}

// ── Word report ───────────────────────────────────────────────────────────────
async function generateWordReport() {
  if (typeof buildReportDoc !== "function" || !window.docx) {
    setStatus("⚠ Report library not loaded — check your connection and reload.");
    return;
  }
  const records = await getActivePhotos();
  const withPhoto = records.filter((r) => r.blob);
  if (!withPhoto.length) { setStatus("No photos to include in a report."); return; }

  openReportModal(withPhoto);
}

// ── Word report preview / ordering modal ────────────────────────────────────────
let reportState = null; // { records, byId, plan, thumbUrls[] }

function openReportModal(records) {
  // Reuse a previously saved layout for this bridge when its photos still match.
  const b = activeBridge();
  const saved = b && b.reportConfig ? b.reportConfig : null;
  let plan;
  if (saved && saved.plan && reportPlanMatchesRecords(saved.plan, records)) {
    plan = JSON.parse(JSON.stringify(saved.plan));
  } else {
    plan = window.buildReportPlan(records);
  }
  const byId = new Map(records.map((r) => [r.id, r]));
  reportState = { records, byId, plan, thumbUrls: [] };

  let overlay = document.getElementById("reportModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "reportModal";
    overlay.className = "report-modal-overlay";
    overlay.innerHTML = `
      <div class="report-modal" role="dialog" aria-modal="true" aria-label="Report preview and ordering">
        <div class="report-modal-head">
          <h2>📄 Report Preview &amp; Ordering</h2>
          <button type="button" class="report-close" aria-label="Close">✕</button>
        </div>
        <div class="report-modal-sub">
          <label>Bridge name / subtitle (optional):
            <input type="text" id="reportBridgeName" placeholder="e.g. Main St over River" />
          </label>
          <label class="report-maps-toggle">
            <input type="checkbox" id="reportIncludeMaps" />
            Include a location map (satellite + camera direction) under each photo
          </label>
          <p class="report-hint">Use ↑ ↓ to reorder within a section, the section menu to move a photo, the image menu to choose which capture is exported, and ✕ to leave a photo out. Captions update automatically based on the section. Maps require an internet connection and a GPS location on the photo.</p>
        </div>
        <div class="report-modal-body" id="reportSections"></div>
        <div class="report-modal-foot">
          <button type="button" class="secondary-btn report-cancel">Cancel</button>
          <button type="button" class="secondary-btn report-save-layout">💾 Save layout</button>
          <button type="button" class="report-generate">Generate .docx</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.querySelector(".report-close").addEventListener("click", closeReportModal);
    overlay.querySelector(".report-cancel").addEventListener("click", closeReportModal);
    overlay.querySelector(".report-save-layout").addEventListener("click", saveReportLayout);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeReportModal(); });
    overlay.querySelector(".report-generate").addEventListener("click", confirmReportModal);
    overlay.querySelector("#reportIncludeMaps").addEventListener("change", (e) => setAllIncludeMaps(e.target.checked));
  }

  const b2 = activeBridge();
  const saved2 = b2 && b2.reportConfig ? b2.reportConfig : null;
  overlay.querySelector("#reportBridgeName").value = (saved2 && saved2.bridgeName) || (b2 ? b2.title : "") || "";
  const anyMap = reportState.plan.sections.some((s) => s.items.some((it) => it.includeMap));
  overlay.querySelector("#reportIncludeMaps").checked = anyMap;
  overlay.style.display = "flex";
  renderReportSections();
}

// True when every recordId referenced by the saved plan still exists in records.
function reportPlanMatchesRecords(plan, records) {
  const ids = new Set(records.map((r) => r.id));
  const planIds = [];
  (plan.sections || []).forEach((s) => (s.items || []).forEach((it) => planIds.push(it.recordId)));
  (plan.excluded || []).forEach((it) => planIds.push(it.recordId));
  // Match if the saved plan covers exactly the current set of records.
  return planIds.length === ids.size && planIds.every((id) => ids.has(id));
}

// Toggle location maps on/off for every item (sections + excluded).
function setAllIncludeMaps(on) {
  if (!reportState) return;
  const { plan } = reportState;
  plan.sections.forEach((s) => s.items.forEach((it) => { it.includeMap = on; }));
  (plan.excluded || []).forEach((it) => { it.includeMap = on; });
  renderReportSections();
}

function closeReportModal() {
  const overlay = document.getElementById("reportModal");
  if (overlay) overlay.style.display = "none";
  if (reportState) {
    reportState.thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    reportState = null;
  }
}

function renderReportSections() {
  if (!reportState) return;
  const { plan, byId } = reportState;
  const host = document.getElementById("reportSections");
  reportState.thumbUrls.forEach((u) => URL.revokeObjectURL(u));
  reportState.thumbUrls = [];
  host.innerHTML = "";

  const totalItems = plan.sections.reduce((n, s) => n + s.items.length, 0);

  plan.sections.forEach((sec, secIdx) => {
    const secEl = document.createElement("div");
    secEl.className = "report-section";
    const head = document.createElement("div");
    head.className = "report-section-head";
    head.innerHTML = `<span class="report-section-title">${sec.heading}</span><span class="report-section-count">${sec.items.length}</span>`;
    secEl.appendChild(head);

    if (!sec.items.length) {
      const empty = document.createElement("div");
      empty.className = "report-empty";
      empty.textContent = "No photos in this section.";
      secEl.appendChild(empty);
    }

    sec.items.forEach((item, idx) => {
      const rec = byId.get(item.recordId);
      if (!rec) return;
      const blob = window.reportHelpers.imageBlobFor(rec, item.imageKind);
      const url = URL.createObjectURL(blob);
      reportState.thumbUrls.push(url);
      const caption = window.reportCaptions.captionForSection(rec, sec.key);
      const kinds = window.reportHelpers.availableImageKinds(rec);

      const row = document.createElement("div");
      row.className = "report-item";

      const imgOptions = kinds
        .map((k) => `<option value="${k.key}"${k.key === item.imageKind ? " selected" : ""}>${k.label}</option>`)
        .join("");
      const secOptions = plan.sections
        .map((s) => `<option value="${s.key}"${s.key === sec.key ? " selected" : ""}>${s.heading}</option>`)
        .join("");
      const hasLoc = window.reportHelpers.hasLocation(rec);
      const mapCtl = hasLoc
        ? `<label class="report-ctl report-map-ctl"><span>Map</span>
             <span class="report-map-check"><input type="checkbox" class="report-map-toggle"${item.includeMap ? " checked" : ""} /> location</span>
           </label>`
        : `<label class="report-ctl report-map-ctl report-map-none" title="No GPS location on this photo"><span>Map</span><span class="report-map-check">no location</span></label>`;

      row.innerHTML = `
        <img class="report-thumb" src="${url}" alt="" />
        <div class="report-item-main">
          <div class="report-caption">Figure ${idx + 1}. ${escapeHtml(caption)}</div>
          <div class="report-item-controls">
            <label class="report-ctl">Image
              <select class="report-image-select">${imgOptions}</select>
            </label>
            <label class="report-ctl">Section
              <select class="report-section-select">${secOptions}</select>
            </label>
            ${mapCtl}
          </div>
        </div>
        <div class="report-item-order">
          <button type="button" class="report-up" title="Move up" ${idx === 0 ? "disabled" : ""}>↑</button>
          <button type="button" class="report-down" title="Move down" ${idx === sec.items.length - 1 ? "disabled" : ""}>↓</button>
          <button type="button" class="report-exclude" title="Exclude from report">✕</button>
        </div>`;

      row.querySelector(".report-image-select").addEventListener("change", (e) => {
        item.imageKind = e.target.value;
        renderReportSections();
      });
      row.querySelector(".report-section-select").addEventListener("change", (e) => {
        moveItemToSection(secIdx, idx, e.target.value);
      });
      const mapToggle = row.querySelector(".report-map-toggle");
      if (mapToggle) mapToggle.addEventListener("change", (e) => { item.includeMap = e.target.checked; });
      row.querySelector(".report-up").addEventListener("click", () => reorderItem(secIdx, idx, -1));
      row.querySelector(".report-down").addEventListener("click", () => reorderItem(secIdx, idx, 1));
      row.querySelector(".report-exclude").addEventListener("click", () => excludeItem(secIdx, idx));

      secEl.appendChild(row);
    });

    host.appendChild(secEl);
  });

  renderExcludedSection(host);

  const genBtn = document.querySelector("#reportModal .report-generate");
  if (genBtn) genBtn.disabled = totalItems === 0;
}

function renderExcludedSection(host) {
  const { plan, byId } = reportState;
  const excluded = plan.excluded || (plan.excluded = []);
  if (!excluded.length) return;

  const secEl = document.createElement("div");
  secEl.className = "report-section report-section-excluded";
  const head = document.createElement("div");
  head.className = "report-section-head";
  head.innerHTML = `<span class="report-section-title">Not in report</span><span class="report-section-count">${excluded.length}</span>`;
  secEl.appendChild(head);

  excluded.forEach((item, idx) => {
    const rec = byId.get(item.recordId);
    if (!rec) return;
    const blob = window.reportHelpers.imageBlobFor(rec, item.imageKind);
    const url = URL.createObjectURL(blob);
    reportState.thumbUrls.push(url);
    const caption = window.reportCaptions.captionForSection(rec, item.fromKey || "other");

    const row = document.createElement("div");
    row.className = "report-item report-item-excluded";
    row.innerHTML = `
      <img class="report-thumb" src="${url}" alt="" />
      <div class="report-item-main">
        <div class="report-caption">${escapeHtml(caption)}</div>
        <div class="report-excluded-note">Excluded from report</div>
      </div>
      <div class="report-item-order">
        <button type="button" class="report-reinclude" title="Add back to report">↩ Include</button>
      </div>`;
    row.querySelector(".report-reinclude").addEventListener("click", () => reincludeItem(idx));
    secEl.appendChild(row);
  });

  host.appendChild(secEl);
}

function excludeItem(secIdx, idx) {
  const { sections } = reportState.plan;
  const excluded = reportState.plan.excluded || (reportState.plan.excluded = []);
  const [it] = sections[secIdx].items.splice(idx, 1);
  it.fromKey = sections[secIdx].key;
  excluded.push(it);
  renderReportSections();
}

function reincludeItem(idx) {
  const { sections, excluded } = reportState.plan;
  const [it] = excluded.splice(idx, 1);
  const target = sections.find((s) => s.key === it.fromKey) || sections[0];
  delete it.fromKey;
  target.items.push(it);
  renderReportSections();
}

function reorderItem(secIdx, idx, delta) {
  const items = reportState.plan.sections[secIdx].items;
  const target = idx + delta;
  if (target < 0 || target >= items.length) return;
  const [it] = items.splice(idx, 1);
  items.splice(target, 0, it);
  renderReportSections();
}

function moveItemToSection(fromSecIdx, idx, toKey) {
  const { sections } = reportState.plan;
  if (sections[fromSecIdx].key === toKey) return;
  const toSec = sections.find((s) => s.key === toKey);
  if (!toSec) return;
  const [it] = sections[fromSecIdx].items.splice(idx, 1);
  toSec.items.push(it);
  renderReportSections();
}

async function confirmReportModal() {
  if (!reportState) return;
  const overlay = document.getElementById("reportModal");
  const bridgeName = (overlay.querySelector("#reportBridgeName").value || "").trim();
  const plan = reportState.plan;
  const records = reportState.records;
  const genBtn = overlay.querySelector(".report-generate");

  genBtn.disabled = true;
  const prevLabel = genBtn.textContent;
  genBtn.textContent = "⏳ Building…";
  setStatus("Building Word report…");
  try {
    const blob = await buildReportDoc(records, { bridgeName, plan });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    const stamp = new Date().toISOString().slice(0, 10);
    const safeName = bridgeName ? bridgeName.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "_") + "-" : "";
    a.download = `${safeName}Bridge-Inspection-Report-${stamp}.docx`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus("✅ Word report downloaded.");
    closeReportModal();
  } catch (e) {
    console.error("[report] failed:", e);
    setStatus("⚠ Report failed: " + e.message);
    genBtn.textContent = prevLabel;
    genBtn.disabled = false;
  }
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// ── Photo annotation overlay (non-destructive) ────────────────────────────────
let annotState = null;

function openPhotoAnnotator(record) {
  if (!record?.blob) return;
  let overlay = document.getElementById("photoAnnotatorModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "photoAnnotatorModal";
    overlay.className = "sketch-modal";
    overlay.innerHTML = `
      <div class="sketch-dialog photo-annotator-dialog">
        <div class="sketch-header">
          <span class="sketch-title">🖊 Photo annotation</span>
          <button class="annot-close secondary" type="button">✕</button>
        </div>
        <div class="sketch-toolbar">
          <button type="button" id="annotPenTool" class="secondary active">✍ Pen</button>
          <button type="button" id="annotCalloutTool" class="secondary">🗨 Text callout</button>
          <div class="sketch-swatches annot-swatches"></div>
          <label class="sketch-custom">Color <input type="color" id="annotColor" value="#ef4444"></label>
          <label class="sketch-size">Size <input type="range" id="annotSize" min="1" max="24" value="3"></label>
          <label class="sketch-size">Callout fill
            <select id="annotCalloutFill" class="meta-input" style="min-width:96px;">
              <option value="white">White</option>
              <option value="none">No fill</option>
            </select>
          </label>
          <button type="button" id="annotEraser" class="secondary">🩹 Eraser</button>
          <button type="button" id="annotEditCallout" class="secondary">✎ Edit text</button>
          <button type="button" id="annotDeleteCallout" class="secondary">🗑 Delete callout</button>
          <button type="button" id="annotUndo" class="secondary">↶ Undo</button>
          <button type="button" id="annotClear" class="secondary">🗑 Clear</button>
        </div>
        <div class="sketch-canvas-wrap photo-annotator-wrap">
          <div class="photo-annotator-stage">
            <img id="annotBaseImage" alt="Photo for annotation">
            <canvas id="annotCanvas"></canvas>
          </div>
        </div>
        <div class="sketch-footer">
          <span class="sketch-hint">Overlay is stored separately from the photo. Use Pen for freehand stylus marks, or Text callout to place a leader + text box.</span>
          <div class="sketch-footer-btns">
            <button type="button" class="annot-cancel secondary">Cancel</button>
            <button type="button" class="annot-remove secondary">Remove overlay</button>
            <button type="button" class="annot-save">💾 Save overlay</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const sw = overlay.querySelector(".annot-swatches");
    SKETCH_COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sketch-swatch";
      b.style.background = c;
      b.dataset.color = c;
      b.addEventListener("click", () => setAnnotColor(c));
      sw.appendChild(b);
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closePhotoAnnotator(); });
    overlay.querySelector(".annot-close").addEventListener("click", closePhotoAnnotator);
    overlay.querySelector(".annot-cancel").addEventListener("click", closePhotoAnnotator);
    overlay.querySelector(".annot-save").addEventListener("click", savePhotoOverlay);
    overlay.querySelector(".annot-remove").addEventListener("click", removePhotoOverlay);
    overlay.querySelector("#annotColor").addEventListener("input", (e) => setAnnotColor(e.target.value));
    overlay.querySelector("#annotSize").addEventListener("input", (e) => setAnnotSize(+e.target.value));
    overlay.querySelector("#annotCalloutFill").addEventListener("change", (e) => setAnnotCalloutFill(e.target.value));
    overlay.querySelector("#annotPenTool").addEventListener("click", () => setAnnotTool("pen"));
    overlay.querySelector("#annotCalloutTool").addEventListener("click", () => setAnnotTool("callout"));
    overlay.querySelector("#annotEditCallout").addEventListener("click", () => editSelectedCalloutText());
    overlay.querySelector("#annotDeleteCallout").addEventListener("click", () => deleteSelectedCallout());
    overlay.querySelector("#annotEraser").addEventListener("click", (e) => {
      if (!annotState) return;
      annotState.erasing = !annotState.erasing;
      e.currentTarget.classList.toggle("active", annotState.erasing);
    });
    overlay.querySelector("#annotUndo").addEventListener("click", () => {
      if (!annotState || !annotState.ops.length) return;
      annotState.ops.pop();
      redrawPhotoOverlay();
    });
    overlay.querySelector("#annotClear").addEventListener("click", () => {
      if (!annotState) return;
      annotState.ops = [];
      redrawPhotoOverlay();
    });
    setupPhotoAnnotatorCanvas(overlay.querySelector("#annotCanvas"));
  }

  const baseImg = overlay.querySelector("#annotBaseImage");
  const canvas = overlay.querySelector("#annotCanvas");
  const prior = record.annotationData || { w: null, h: null, ops: [] };
  const priorOps = Array.isArray(prior.ops) ? prior.ops : [];
  annotState = {
    record,
    baseImg,
    canvas,
    ctx: canvas.getContext("2d"),
    ops: priorOps.map((op) => JSON.parse(JSON.stringify(op))),
    drawing: false,
    current: null,
    calloutStart: null,
    dragCallout: null,
    selectedCalloutIdx: -1,
    tool: "pen",
    color: "#ef4444",
    size: 3,
    calloutFill: "white",
    erasing: false,
  };
  overlay.querySelector("#annotColor").value = "#ef4444";
  overlay.querySelector("#annotSize").value = 3;
  overlay.querySelector("#annotCalloutFill").value = "white";
  overlay.querySelector("#annotEraser").classList.remove("active");
  setAnnotTool("pen");
  setAnnotColor("#ef4444");
  syncAnnotControls();

  const url = URL.createObjectURL(record.blob);
  baseImg.src = url;
  baseImg.onload = () => {
    URL.revokeObjectURL(url);
    const w = baseImg.naturalWidth, h = baseImg.naturalHeight;
    canvas.width = w; canvas.height = h;
    canvas.style.width = baseImg.clientWidth + "px";
    canvas.style.height = baseImg.clientHeight + "px";
    redrawPhotoOverlay();
  };
  overlay.style.display = "flex";
}

function setAnnotTool(tool) {
  if (!annotState) return;
  annotState.tool = tool;
  const modal = document.getElementById("photoAnnotatorModal");
  modal.querySelector("#annotPenTool").classList.toggle("active", tool === "pen");
  modal.querySelector("#annotCalloutTool").classList.toggle("active", tool === "callout");
  if (tool === "pen") annotState.calloutStart = null;
}

function setAnnotColor(c) {
  if (!annotState) return;
  annotState.color = c;
  annotState.erasing = false;
  const modal = document.getElementById("photoAnnotatorModal");
  modal.querySelector("#annotColor").value = c;
  modal.querySelector("#annotEraser").classList.remove("active");
  modal.querySelectorAll(".annot-swatches .sketch-swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === c));
  applyAnnotStyleToSelectedCallout();
}

function setAnnotSize(sz) {
  if (!annotState) return;
  annotState.size = Math.max(1, Math.round(sz || 1));
  const modal = document.getElementById("photoAnnotatorModal");
  modal.querySelector("#annotSize").value = String(annotState.size);
  applyAnnotStyleToSelectedCallout();
}

function setAnnotCalloutFill(fill) {
  if (!annotState) return;
  annotState.calloutFill = fill === "none" ? "none" : "white";
  const modal = document.getElementById("photoAnnotatorModal");
  modal.querySelector("#annotCalloutFill").value = annotState.calloutFill;
  applyAnnotStyleToSelectedCallout();
}

function syncAnnotControls() {
  if (!annotState) return;
  const modal = document.getElementById("photoAnnotatorModal");
  const selected = annotState.selectedCalloutIdx >= 0 ? annotState.ops[annotState.selectedCalloutIdx] : null;
  if (selected && selected.type === "callout") {
    modal.querySelector("#annotColor").value = selected.color || annotState.color;
    modal.querySelector("#annotSize").value = String(Math.max(1, Math.round(selected.size || annotState.size)));
    modal.querySelector("#annotCalloutFill").value = selected.fill === "none" ? "none" : "white";
  } else {
    modal.querySelector("#annotColor").value = annotState.color;
    modal.querySelector("#annotSize").value = String(annotState.size);
    modal.querySelector("#annotCalloutFill").value = annotState.calloutFill;
  }
}

function applyAnnotStyleToSelectedCallout() {
  if (!annotState) return;
  const i = annotState.selectedCalloutIdx;
  if (i < 0) return;
  const op = annotState.ops[i];
  if (!op || op.type !== "callout") return;
  op.color = annotState.color;
  op.size = annotState.size;
  op.fill = annotState.calloutFill;
  redrawPhotoOverlay();
}

function annotPos(e) {
  const c = annotState.canvas;
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
}

function calloutLayout(op, canvas, ctx) {
  const size = Math.max(1, op.size || 3);
  const fontPx = Math.max(14, Math.round(10 + size * 2));
  const lines = String(op.text || "").trim().split(/\r?\n/).filter(Boolean);
  const safeLines = lines.length ? lines : [" "];
  const pad = 6;
  ctx.save();
  ctx.font = `${fontPx}px Arial, sans-serif`;
  let textW = 0;
  for (const ln of safeLines) textW = Math.max(textW, ctx.measureText(ln).width);
  ctx.restore();
  const boxW = textW + pad * 2;
  const boxH = safeLines.length * (fontPx + 2) + pad * 2 - 2;
  const bx = (op.box && isFinite(op.box[0])) ? op.box[0] : 0;
  const by = (op.box && isFinite(op.box[1])) ? op.box[1] : 0;
  const x = Math.max(2, Math.min(canvas.width - boxW - 2, bx));
  const y = Math.max(2, Math.min(canvas.height - boxH - 2, by));
  const ax = (op.anchor && isFinite(op.anchor[0])) ? op.anchor[0] : x;
  const ay = (op.anchor && isFinite(op.anchor[1])) ? op.anchor[1] : y;
  return { ax, ay, x, y, boxW, boxH, fontPx, pad, lines: safeLines };
}

function findCalloutHit(p) {
  if (!annotState) return null;
  const { canvas, ctx } = annotState;
  const near = (x, y, px, py, r = 14) => ((x - px) ** 2 + (y - py) ** 2) <= r * r;
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const t = c1 / c2;
    const qx = x1 + t * vx, qy = y1 + t * vy;
    return Math.hypot(px - qx, py - qy);
  };
  for (let i = annotState.ops.length - 1; i >= 0; i--) {
    const op = annotState.ops[i];
    if (!op || op.type !== "callout") continue;
    const l = calloutLayout(op, canvas, ctx);
    const size = Math.max(1, op.size || 3);
    if (near(p.x, p.y, l.ax, l.ay, 14)) return { idx: i, mode: "anchor" };
    if (near(p.x, p.y, l.x, l.y, 14)) return { idx: i, mode: "box" };
    if (distSeg(p.x, p.y, l.ax, l.ay, l.x, l.y) <= Math.max(8, size + 4)) return { idx: i, mode: "line" };
    if (p.x >= l.x && p.x <= l.x + l.boxW && p.y >= l.y && p.y <= l.y + l.boxH) return { idx: i, mode: "moveBox", x0: l.x, y0: l.y };
  }
  return null;
}

function findAnnotOpHit(p) {
  if (!annotState) return null;
  const callHit = findCalloutHit(p);
  if (callHit) return { idx: callHit.idx, mode: callHit.mode, type: "callout" };
  const distSeg = (px, py, x1, y1, x2, y2) => {
    const vx = x2 - x1, vy = y2 - y1;
    const wx = px - x1, wy = py - y1;
    const c1 = vx * wx + vy * wy;
    if (c1 <= 0) return Math.hypot(px - x1, py - y1);
    const c2 = vx * vx + vy * vy;
    if (c2 <= c1) return Math.hypot(px - x2, py - y2);
    const t = c1 / c2;
    const qx = x1 + t * vx, qy = y1 + t * vy;
    return Math.hypot(px - qx, py - qy);
  };
  for (let i = annotState.ops.length - 1; i >= 0; i--) {
    const op = annotState.ops[i];
    if (!op || op.type !== "stroke") continue;
    const pts = op.points || [];
    const r = Math.max(8, (op.size || 3) * 1.3);
    if (pts.length === 1) {
      const dx = p.x - pts[0][0], dy = p.y - pts[0][1];
      if (Math.hypot(dx, dy) <= r) return { idx: i, mode: "stroke", type: "stroke" };
      continue;
    }
    for (let j = 1; j < pts.length; j++) {
      if (distSeg(p.x, p.y, pts[j - 1][0], pts[j - 1][1], pts[j][0], pts[j][1]) <= r) {
        return { idx: i, mode: "stroke", type: "stroke" };
      }
    }
  }
  return null;
}

function setupPhotoAnnotatorCanvas(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    if (!annotState) return;
    canvas.setPointerCapture(e.pointerId);
    const p = annotPos(e);
    const hit = findAnnotOpHit(p);
    if (annotState.erasing) {
      if (hit) {
        annotState.ops.splice(hit.idx, 1);
        if (annotState.selectedCalloutIdx === hit.idx) annotState.selectedCalloutIdx = -1;
        else if (annotState.selectedCalloutIdx > hit.idx) annotState.selectedCalloutIdx -= 1;
        syncAnnotControls();
        redrawPhotoOverlay();
      }
      return;
    }
    if (hit && hit.type === "callout" && annotState.tool !== "callout") {
      setAnnotTool("callout");
      annotState.selectedCalloutIdx = hit.idx;
      const op = annotState.ops[hit.idx];
      annotState.color = op.color || annotState.color;
      annotState.size = Math.max(1, Math.round(op.size || annotState.size));
      annotState.calloutFill = op.fill === "none" ? "none" : "white";
      if (hit.mode === "anchor" || hit.mode === "box" || hit.mode === "moveBox") {
        annotState.dragCallout = { idx: hit.idx, mode: hit.mode, p0: p, box0: op.box ? [op.box[0], op.box[1]] : [p.x, p.y] };
      }
      syncAnnotControls();
      redrawPhotoOverlay();
      return;
    }
    if (annotState.tool === "callout") {
      const callHit = findCalloutHit(p);
      if (callHit) {
        annotState.selectedCalloutIdx = callHit.idx;
        const op = annotState.ops[callHit.idx];
        annotState.color = op.color || annotState.color;
        annotState.size = Math.max(1, Math.round(op.size || annotState.size));
        annotState.calloutFill = op.fill === "none" ? "none" : "white";
        if (callHit.mode === "anchor" || callHit.mode === "box" || callHit.mode === "moveBox") {
          annotState.dragCallout = { idx: callHit.idx, mode: callHit.mode, p0: p, box0: op.box ? [op.box[0], op.box[1]] : [p.x, p.y] };
        } else {
          annotState.dragCallout = null;
        }
        syncAnnotControls();
        redrawPhotoOverlay();
        return;
      }
      annotState.selectedCalloutIdx = -1;
      syncAnnotControls();
      annotState.calloutStart = p;
      redrawPhotoOverlay();
      return;
    }
    annotState.drawing = true;
    annotState.selectedCalloutIdx = -1;
    annotState.current = {
      type: "stroke",
      color: annotState.erasing ? "#000000" : annotState.color,
      size: annotState.size,
      erase: !!annotState.erasing,
      points: [[p.x, p.y]],
    };
    annotState.ops.push(annotState.current);
    redrawPhotoOverlay();
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = annotPos(e);
    if (annotState?.dragCallout) {
      const { idx, mode, p0, box0 } = annotState.dragCallout;
      const op = annotState.ops[idx];
      if (!op || op.type !== "callout") return;
      if (mode === "anchor") op.anchor = [p.x, p.y];
      else if (mode === "box") op.box = [p.x, p.y];
      else if (mode === "moveBox") op.box = [box0[0] + (p.x - p0.x), box0[1] + (p.y - p0.y)];
      redrawPhotoOverlay();
      return;
    }
    if (!annotState || !annotState.drawing || !annotState.current) return;
    annotState.current.points.push([p.x, p.y]);
    redrawPhotoOverlay();
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!annotState) return;
    if (annotState.dragCallout) {
      annotState.dragCallout = null;
      redrawPhotoOverlay();
      return;
    }
    if (annotState.tool === "callout" && annotState.calloutStart) {
      const a = annotState.calloutStart;
      const b = annotPos(e);
      annotState.calloutStart = null;
      const txt = prompt("Callout text:");
      if (txt && txt.trim()) {
        const idx = annotState.ops.length;
        annotState.ops.push({
          type: "callout",
          color: annotState.color,
          size: Math.max(1, annotState.size),
          anchor: [a.x, a.y],
          box: [b.x, b.y],
          text: txt.trim(),
          fill: annotState.calloutFill,
        });
        annotState.selectedCalloutIdx = idx;
        // Prevent "stuck in callout mode": after creating one, return to pen.
        setAnnotTool("pen");
        syncAnnotControls();
        redrawPhotoOverlay();
      }
      return;
    }
    annotState.drawing = false;
    annotState.current = null;
  });
  canvas.addEventListener("pointercancel", () => {
    if (!annotState) return;
    annotState.drawing = false;
    annotState.current = null;
    annotState.calloutStart = null;
    annotState.dragCallout = null;
  });
}

function redrawPhotoOverlay() {
  if (!annotState) return;
  const { ctx, canvas } = annotState;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const op of annotState.ops) {
    if (op.type === "stroke") {
      const pts = op.points || [];
      if (!pts.length) continue;
      ctx.save();
      ctx.globalCompositeOperation = op.erase ? "destination-out" : "source-over";
      ctx.strokeStyle = op.color || "#ef4444";
      ctx.fillStyle = op.color || "#ef4444";
      ctx.lineWidth = op.size || 3;
      if (pts.length === 1) {
        ctx.beginPath();
        ctx.arc(pts[0][0], pts[0][1], (op.size || 3) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.beginPath();
        ctx.moveTo(pts[0][0], pts[0][1]);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
        ctx.stroke();
      }
      ctx.restore();
      continue;
    }
    if (op.type === "callout") {
      const l = calloutLayout(op, canvas, ctx);
      const { ax, ay, x, y, boxW, boxH, fontPx, lines, pad } = l;
      const color = op.color || "#ef4444";
      const size = Math.max(1, op.size || 3);
      // Leader should terminate on the closest edge of the text box, not the box's
      // top-left corner. This makes the arrowhead visible and geometrically correct.
      const cx = x + boxW * 0.5, cy = y + boxH * 0.5;
      const dx0 = cx - ax, dy0 = cy - ay;
      const halfW = boxW * 0.5, halfH = boxH * 0.5;
      const sx = Math.abs(dx0) > 1e-6 ? halfW / Math.abs(dx0) : Infinity;
      const sy = Math.abs(dy0) > 1e-6 ? halfH / Math.abs(dy0) : Infinity;
      const t = Math.min(sx, sy);
      const tx = cx - dx0 * t, ty = cy - dy0 * t;
      ctx.save();
      ctx.strokeStyle = color;
      // Thinner leader line for better readability under text.
      ctx.lineWidth = Math.max(1, size * 0.5);
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.font = `${fontPx}px Arial, sans-serif`;
      ctx.textBaseline = "top";
      if (op.fill !== "none") {
        ctx.fillStyle = "rgba(255,255,255,0.88)";
        ctx.fillRect(x, y, boxW, boxH);
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.strokeRect(x, y, boxW, boxH);
      // Arrowhead at the target end of the leader (anchor side).
      const dx = ax - tx, dy = ay - ty;
      const mag = Math.hypot(dx, dy) || 1;
      const ux = dx / mag, uy = dy / mag;
      const ahLen = Math.max(10, size * 3.4);
      const ahWid = Math.max(10, size * 3.0);
      const bx = ax - ux * ahLen, by = ay - uy * ahLen;
      const px = -uy, py = ux;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(ax, ay);
      ctx.lineTo(bx + px * ahWid * 0.5, by + py * ahWid * 0.5);
      ctx.lineTo(bx - px * ahWid * 0.5, by - py * ahWid * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#111827";
      lines.forEach((ln, i) => ctx.fillText(ln, x + pad, y + pad + i * (fontPx + 2)));
      if (annotState.selectedCalloutIdx >= 0 && annotState.ops[annotState.selectedCalloutIdx] === op) {
        ctx.fillStyle = "#22d3ee";
        ctx.beginPath(); ctx.arc(ax, ay, 5, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#f59e0b";
        ctx.fillRect(x - 4, y - 4, 8, 8);
      }
      ctx.restore();
    }
  }
  if (annotState.tool === "callout" && annotState.calloutStart) {
    const p = annotState.calloutStart;
    ctx.save();
    ctx.strokeStyle = "#22d3ee";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p.x - 8, p.y); ctx.lineTo(p.x + 8, p.y);
    ctx.moveTo(p.x, p.y - 8); ctx.lineTo(p.x, p.y + 8);
    ctx.stroke();
    ctx.restore();
  }
}

function closePhotoAnnotator() {
  const overlay = document.getElementById("photoAnnotatorModal");
  if (overlay) overlay.style.display = "none";
  annotState = null;
}

async function savePhotoOverlay() {
  if (!annotState) return;
  const rec = annotState.record;
  const hasOps = annotState.ops.length > 0;
  let overlayBlob = null;
  if (hasOps) overlayBlob = await canvasToBlob(annotState.canvas, "image/png");
  const updated = {
    ...rec,
    annotationData: hasOps ? { w: annotState.canvas.width, h: annotState.canvas.height, ops: annotState.ops } : null,
    annotationOverlayBlob: overlayBlob,
  };
  await runTransaction("readwrite", (store) => store.put(updated));
  await renderSavedPhotos();
  closePhotoAnnotator();
  setStatus(hasOps ? "🖊 Photo overlay saved (kept separate)." : "🖊 Overlay cleared.");
}

function deleteSelectedCallout() {
  if (!annotState) return;
  const i = annotState.selectedCalloutIdx;
  if (i < 0 || !annotState.ops[i] || annotState.ops[i].type !== "callout") {
    setStatus("Select a callout first (tap anchor, box corner, or inside the box).");
    return;
  }
  annotState.ops.splice(i, 1);
  annotState.selectedCalloutIdx = -1;
  syncAnnotControls();
  redrawPhotoOverlay();
}

function editSelectedCalloutText() {
  if (!annotState) return;
  const i = annotState.selectedCalloutIdx;
  if (i < 0 || !annotState.ops[i] || annotState.ops[i].type !== "callout") {
    setStatus("Select a callout first, then press Edit text.");
    return;
  }
  const op = annotState.ops[i];
  const txt = prompt("Edit callout text:", String(op.text || ""));
  if (txt == null) return; // cancelled
  const t = txt.trim();
  if (!t) {
    setStatus("Callout text cannot be empty.");
    return;
  }
  op.text = t;
  redrawPhotoOverlay();
}

async function removePhotoOverlay() {
  if (!annotState) return;
  const rec = annotState.record;
  const updated = { ...rec, annotationData: null, annotationOverlayBlob: null };
  await runTransaction("readwrite", (store) => store.put(updated));
  await renderSavedPhotos();
  closePhotoAnnotator();
  setStatus("Overlay removed.");
}

// ── Sketch (draw instead of photo) ─────────────────────────────────────────────
let sketchState = null;
const SKETCH_COLORS = ["#111827", "#ef4444", "#2563eb", "#16a34a", "#f59e0b", "#ffffff"];
const SKETCH_W = 1000, SKETCH_H = 750;

function openSketchModal() {
  let overlay = document.getElementById("sketchModal");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "sketchModal";
    overlay.className = "sketch-modal";
    overlay.innerHTML = `
      <div class="sketch-dialog">
        <div class="sketch-header">
          <span class="sketch-title">✏ Sketch</span>
          <button class="sketch-close secondary" type="button">✕</button>
        </div>
        <div class="sketch-toolbar">
          <div class="sketch-swatches"></div>
          <label class="sketch-custom">Color <input type="color" id="sketchColor" value="#111827"></label>
          <label class="sketch-size">Size <input type="range" id="sketchSize" min="1" max="40" value="4"></label>
          <button type="button" id="sketchEraser" class="secondary">🩹 Eraser</button>
          <button type="button" id="sketchUndo" class="secondary">↶ Undo</button>
          <button type="button" id="sketchClear" class="secondary">🗑 Clear</button>
        </div>
        <div class="sketch-canvas-wrap">
          <canvas id="sketchCanvas" width="${SKETCH_W}" height="${SKETCH_H}"></canvas>
        </div>
        <div class="sketch-footer">
          <span class="sketch-hint">Draw with mouse or finger. Sketch saves as a photo record (with your comment, tags &amp; location).</span>
          <div class="sketch-footer-btns">
            <button type="button" class="sketch-cancel secondary">Cancel</button>
            <button type="button" class="sketch-save">💾 Save sketch</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const swatchHost = overlay.querySelector(".sketch-swatches");
    SKETCH_COLORS.forEach((c) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "sketch-swatch";
      b.style.background = c;
      b.dataset.color = c;
      b.addEventListener("click", () => setSketchColor(c));
      swatchHost.appendChild(b);
    });

    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSketchModal(); });
    overlay.querySelector(".sketch-close").addEventListener("click", closeSketchModal);
    overlay.querySelector(".sketch-cancel").addEventListener("click", closeSketchModal);
    overlay.querySelector(".sketch-save").addEventListener("click", saveSketch);
    overlay.querySelector("#sketchColor").addEventListener("input", (e) => setSketchColor(e.target.value));
    overlay.querySelector("#sketchSize").addEventListener("input", (e) => { if (sketchState) sketchState.size = +e.target.value; });
    overlay.querySelector("#sketchEraser").addEventListener("click", (e) => {
      if (!sketchState) return;
      sketchState.erasing = !sketchState.erasing;
      e.currentTarget.classList.toggle("active", sketchState.erasing);
    });
    overlay.querySelector("#sketchUndo").addEventListener("click", sketchUndo);
    overlay.querySelector("#sketchClear").addEventListener("click", () => {
      if (!sketchState) return;
      sketchState.strokes = [];
      redrawSketch();
    });

    setupSketchCanvas(overlay.querySelector("#sketchCanvas"));
  }

  sketchState = { canvas: overlay.querySelector("#sketchCanvas"), ctx: overlay.querySelector("#sketchCanvas").getContext("2d"),
                  strokes: [], current: null, drawing: false, color: "#111827", size: 4, erasing: false };
  overlay.querySelector("#sketchColor").value = "#111827";
  overlay.querySelector("#sketchSize").value = 4;
  overlay.querySelector("#sketchEraser").classList.remove("active");
  setSketchColor("#111827");
  redrawSketch();
  overlay.style.display = "flex";
}

function setSketchColor(c) {
  if (!sketchState) return;
  sketchState.color = c;
  sketchState.erasing = false;
  const overlay = document.getElementById("sketchModal");
  overlay.querySelector("#sketchColor").value = c;
  overlay.querySelector("#sketchEraser").classList.remove("active");
  overlay.querySelectorAll(".sketch-swatch").forEach((b) => b.classList.toggle("active", b.dataset.color === c));
}

function sketchPos(e) {
  const c = sketchState.canvas;
  const r = c.getBoundingClientRect();
  return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
}

function setupSketchCanvas(canvas) {
  canvas.addEventListener("pointerdown", (e) => {
    if (!sketchState) return;
    canvas.setPointerCapture(e.pointerId);
    sketchState.drawing = true;
    sketchState.current = { color: sketchState.erasing ? "#ffffff" : sketchState.color, size: sketchState.size, points: [sketchPos(e)] };
    sketchState.strokes.push(sketchState.current);
    redrawSketch();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!sketchState || !sketchState.drawing) return;
    sketchState.current.points.push(sketchPos(e));
    redrawSketch();
  });
  const end = () => { if (sketchState) { sketchState.drawing = false; sketchState.current = null; } };
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointercancel", end);
  canvas.addEventListener("pointerleave", () => { if (sketchState) sketchState.drawing = false; });
}

function redrawSketch() {
  if (!sketchState) return;
  const { ctx } = sketchState;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, SKETCH_W, SKETCH_H);
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const s of sketchState.strokes) {
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.beginPath();
    const pts = s.points;
    if (pts.length === 1) {
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, s.size / 2, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
}

function sketchUndo() {
  if (!sketchState || !sketchState.strokes.length) return;
  sketchState.strokes.pop();
  redrawSketch();
}

function closeSketchModal() {
  const overlay = document.getElementById("sketchModal");
  if (overlay) overlay.style.display = "none";
  sketchState = null;
}

async function saveSketch() {
  if (!sketchState) return;
  if (!sketchState.strokes.length) { setStatus("Draw something first, or press Cancel."); return; }
  const dataUrl = sketchState.canvas.toDataURL("image/png");
  const bin = atob(dataUrl.split(",")[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: "image/png" });
  try {
    await savePhoto(blob, null, commentInput.value.trim(), currentLocation, currentHeading, facingMode, null, null, normalizeTags(captureTags), { isSketch: true });
  } catch (e) {
    console.error("[sketch] save failed:", e);
    setStatus("⚠ Sketch save failed: " + e.message);
    return;
  }
  commentInput.value = "";
  captureTags = emptyTags();
  renderCaptureTags();
  closeSketchModal();
  setStatus("✏ Sketch saved.");
}

// ═══════════════════════════════════════════════════════════════════════════════
// Bridges layer: plan multiple locations, each with its own KMZ, title, and
// description. Photos/sketches/reports are scoped per bridge, and a bridge can be
// exported as a ZIP with metadata embedded in the images.
// ═══════════════════════════════════════════════════════════════════════════════
function bridgesView()  { return document.getElementById("bridgesView"); }
function appView()      { return document.getElementById("appView"); }

function showBridgesOverview() {
  closePeerTransferView();
  activeBridgeId = null;
  localStorage.removeItem(ACTIVE_BRIDGE_KEY);
  if (appView()) appView().hidden = true;
  if (bridgesView()) bridgesView().hidden = false;
  renderBridgesList();
}

async function renderBridgesList() {
  bridges = (await getAllBridges()) || [];
  bridges.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
  const allPhotos = await runTransaction("readonly", (store) => store.getAll());
  const countByBridge = new Map();
  const coverByBridge = new Map();
  for (const p of allPhotos) {
    countByBridge.set(p.bridgeId, (countByBridge.get(p.bridgeId) || 0) + 1);
    if (p.blob && !coverByBridge.has(p.bridgeId)) coverByBridge.set(p.bridgeId, p.blob);
  }

  const list = document.getElementById("bridgesList");
  const empty = document.getElementById("bridgesEmpty");
  if (!list) return;
  // Revoke previous cover thumbnails.
  list.querySelectorAll("img[data-url]").forEach((im) => URL.revokeObjectURL(im.dataset.url));
  list.innerHTML = "";
  empty.hidden = bridges.length > 0;

  for (const b of bridges) {
    const count = countByBridge.get(b.id) || 0;
    const card = document.createElement("article");
    card.className = "bridge-card";

    const thumb = document.createElement("div");
    thumb.className = "bridge-thumb";
    const cover = coverByBridge.get(b.id);
    if (cover) {
      const im = document.createElement("img");
      const url = URL.createObjectURL(cover);
      im.src = url; im.dataset.url = url; im.alt = "";
      thumb.appendChild(im);
    } else {
      thumb.textContent = "🌉";
    }

    const body = document.createElement("div");
    body.className = "bridge-card-body";
    const h = document.createElement("h3");
    h.className = "bridge-card-title";
    h.textContent = b.title || "Untitled bridge";
    const desc = document.createElement("p");
    desc.className = "bridge-card-desc";
    desc.textContent = b.description || "";
    const meta = document.createElement("div");
    meta.className = "bridge-card-meta";
    meta.innerHTML = `<span>📷 ${count} item${count !== 1 ? "s" : ""}</span>` +
                     `<span>${b.kml ? "🗺 KMZ attached" : "🗺 no overlay"}</span>` +
                     (b.location ? `<span>📍 ${b.location.lat.toFixed(4)}, ${b.location.lng.toFixed(4)}</span>` : "");
    body.append(h, desc, meta);

    const actions = document.createElement("div");
    actions.className = "bridge-card-actions";
    const openBtn = makeButton("Open", "");
    openBtn.classList.add("bridge-open-btn");
    openBtn.addEventListener("click", () => openBridge(b.id));
    const editBtn = makeButton("✎ Edit", "secondary");
    editBtn.addEventListener("click", () => openBridgeEditor(b));
    const zipBtn = makeButton("⬇ ZIP", "secondary");
    zipBtn.addEventListener("click", () => downloadBridgeZip(b.id));
    const delBtn = makeButton("🗑", "danger");
    delBtn.addEventListener("click", () => deleteBridge(b.id));
    actions.append(openBtn, editBtn, zipBtn, delBtn);

    card.append(thumb, body, actions);
    list.appendChild(card);
  }
}

async function openBridge(id) {
  closePeerTransferView();
  const b = bridges.find((x) => x.id === id) || (await getBridgeRec(id));
  if (!b) { showBridgesOverview(); return; }
  if (!bridges.some((x) => x.id === id)) bridges.push(b);
  activeBridgeId = id;
  localStorage.setItem(ACTIVE_BRIDGE_KEY, id);

  const banner = document.getElementById("bridgeBannerTitle");
  const bdesc  = document.getElementById("bridgeBannerDesc");
  if (banner) banner.textContent = b.title || "Untitled bridge";
  if (bdesc)  bdesc.textContent  = b.description || "";

  if (bridgesView()) bridgesView().hidden = true;
  if (appView()) appView().hidden = false;

  await loadSavedKml();
  await renderSavedPhotos();
  setStatus(`Opened “${b.title || "bridge"}”.`);
}

// ── Bridge create / edit modal ────────────────────────────────────────────────
let bridgeEditorState = null; // { id|null, pendingKmz: File|null, clearKmz: bool }

function openBridgeEditor(bridge = null) {
  bridgeEditorState = { id: bridge ? bridge.id : null, pendingKmz: null, clearKmz: false };
  let overlay = document.getElementById("bridgeEditor");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "bridgeEditor";
    overlay.className = "bridge-modal";
    overlay.innerHTML = `
      <div class="bridge-dialog">
        <div class="bridge-dialog-head">
          <span class="bridge-dialog-title">🌉 Bridge</span>
          <button type="button" class="bridge-dialog-close secondary">✕</button>
        </div>
        <div class="bridge-dialog-body">
          <label class="bridge-field">Title
            <input type="text" id="bridgeTitle" placeholder="e.g. Main St over River" />
          </label>
          <label class="bridge-field">Description
            <textarea id="bridgeDesc" rows="3" placeholder="Bridge / location notes…"></textarea>
          </label>
          <div class="bridge-field">
            <span>KMZ / KML overlay</span>
            <div class="bridge-kmz-row">
              <label class="bridge-kmz-pick secondary">📁 Choose file
                <input type="file" id="bridgeKmz" accept=".kml,.kmz" hidden />
              </label>
              <span id="bridgeKmzName" class="bridge-kmz-name">No file selected</span>
              <button type="button" id="bridgeKmzClear" class="secondary" hidden>Remove</button>
            </div>
          </div>
        </div>
        <div class="bridge-dialog-foot">
          <button type="button" class="bridge-dialog-cancel secondary">Cancel</button>
          <button type="button" class="bridge-dialog-save">💾 Save bridge</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeBridgeEditor(); });
    overlay.querySelector(".bridge-dialog-close").addEventListener("click", closeBridgeEditor);
    overlay.querySelector(".bridge-dialog-cancel").addEventListener("click", closeBridgeEditor);
    overlay.querySelector(".bridge-dialog-save").addEventListener("click", saveBridgeFromEditor);
    overlay.querySelector("#bridgeKmz").addEventListener("change", (e) => {
      const f = e.target.files?.[0];
      if (f) {
        bridgeEditorState.pendingKmz = f;
        bridgeEditorState.clearKmz = false;
        overlay.querySelector("#bridgeKmzName").textContent = f.name;
        overlay.querySelector("#bridgeKmzClear").hidden = false;
      }
    });
    overlay.querySelector("#bridgeKmzClear").addEventListener("click", () => {
      bridgeEditorState.pendingKmz = null;
      bridgeEditorState.clearKmz = true;
      overlay.querySelector("#bridgeKmz").value = "";
      overlay.querySelector("#bridgeKmzName").textContent = "Overlay will be removed";
      overlay.querySelector("#bridgeKmzClear").hidden = true;
    });
  }

  const existingKmzName = bridge?.kml?.name;
  overlay.querySelector("#bridgeTitle").value = bridge?.title || "";
  overlay.querySelector("#bridgeDesc").value  = bridge?.description || "";
  overlay.querySelector("#bridgeKmz").value = "";
  overlay.querySelector("#bridgeKmzName").textContent = existingKmzName || "No file selected";
  overlay.querySelector("#bridgeKmzClear").hidden = !existingKmzName;
  overlay.querySelector(".bridge-dialog-title").textContent = bridge ? "🌉 Edit bridge" : "🌉 New bridge";
  overlay.style.display = "flex";
  overlay.querySelector("#bridgeTitle").focus();
}

function closeBridgeEditor() {
  const overlay = document.getElementById("bridgeEditor");
  if (overlay) overlay.style.display = "none";
  bridgeEditorState = null;
}

async function saveBridgeFromEditor() {
  if (!bridgeEditorState) return;
  const overlay = document.getElementById("bridgeEditor");
  const title = overlay.querySelector("#bridgeTitle").value.trim();
  const description = overlay.querySelector("#bridgeDesc").value.trim();
  if (!title) { setStatus("Give the bridge a title first."); overlay.querySelector("#bridgeTitle").focus(); return; }

  let rec = bridgeEditorState.id ? (bridges.find((b) => b.id === bridgeEditorState.id) || await getBridgeRec(bridgeEditorState.id)) : null;
  if (!rec) rec = { id: createId(), createdAt: new Date().toISOString(), kml: null, reportConfig: null };
  rec.title = title;
  rec.description = description;

  if (bridgeEditorState.pendingKmz) {
    const saveBtn = overlay.querySelector(".bridge-dialog-save");
    saveBtn.disabled = true; saveBtn.textContent = "Parsing overlay…";
    try {
      rec.kml = await parseKmzToOverlay(bridgeEditorState.pendingKmz);
    } catch (e) {
      console.warn("KMZ parse failed:", e);
      setStatus("⚠ Overlay parse failed: " + e.message);
    }
    saveBtn.disabled = false; saveBtn.textContent = "💾 Save bridge";
  } else if (bridgeEditorState.clearKmz) {
    rec.kml = null;
  }

  await putBridgeRec(rec);
  const idx = bridges.findIndex((b) => b.id === rec.id);
  if (idx >= 0) bridges[idx] = rec; else bridges.push(rec);

  closeBridgeEditor();
  // If we edited the currently-open bridge, refresh its banner + overlay.
  if (activeBridgeId === rec.id) {
    const banner = document.getElementById("bridgeBannerTitle");
    const bdesc  = document.getElementById("bridgeBannerDesc");
    if (banner) banner.textContent = rec.title;
    if (bdesc)  bdesc.textContent  = rec.description || "";
    await loadSavedKml();
    await renderSavedPhotos();
  } else {
    renderBridgesList();
  }
  setStatus(`Saved bridge “${rec.title}”.`);
}

// ── Import bridges by NBI structure number ──────────────────────────────
let nbiStatesCache = null;          // [{abbr,name,fips,count}]
const nbiStateData = new Map();     // abbr -> {recs, idx}
let nbiPreviewMatches = [];         // current found records awaiting import

// Location of the currently-open bridge (e.g. set from an NBI import), used as
// a last-resort default when a captured photo has neither EXIF GPS nor a live fix.
function activeBridgeLocation() {
  if (!activeBridgeId) return null;
  const b = bridges.find((x) => x.id === activeBridgeId);
  if (b && b.location && isFinite(b.location.lat) && isFinite(b.location.lng)) {
    return { lat: b.location.lat, lng: b.location.lng, accuracy: b.location.accuracy ?? 0 };
  }
  return null;
}

async function loadNbiStates() {
  if (nbiStatesCache) return nbiStatesCache;
  const r = await fetch("nbi/states.json", { cache: "no-store" });
  if (!r.ok) throw new Error("states.json " + r.status);
  nbiStatesCache = await r.json();
  return nbiStatesCache;
}

async function loadNbiState(abbr) {
  if (nbiStateData.has(abbr)) return nbiStateData.get(abbr);
  const r = await fetch(`nbi/${abbr}.json`, { cache: "no-store" });
  if (!r.ok) throw new Error(`${abbr}.json ${r.status}`);
  const data = await r.json();
  nbiStateData.set(abbr, data);
  return data;
}

function nbiLookup(data, raw) {
  const n = raw.trim().toUpperCase();
  if (!n) return null;
  let i = data.idx[n];
  if (i === undefined) i = data.idx[n.replace(/^0+/, "")];
  if (i === undefined) return null;
  const [struct, lat, lng, feat, carried, loc, year] = data.recs[i];
  return { struct, lat, lng, feat, carried, loc, year };
}

async function openNbiImport() {
  let overlay = document.getElementById("nbiImport");
  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "nbiImport";
    overlay.className = "bridge-modal";
    overlay.innerHTML = `
      <div class="bridge-dialog">
        <div class="bridge-dialog-head">
          <span class="bridge-dialog-title">🔢 Import bridges by NBI #</span>
          <button type="button" class="bridge-dialog-close secondary">✕</button>
        </div>
        <div class="bridge-dialog-body">
          <label class="bridge-field">State
            <select id="nbiState"></select>
          </label>
          <label class="bridge-field">NBI structure number(s)
            <textarea id="nbiNumbers" rows="3" placeholder="One per line or comma-separated, e.g.&#10;S702&#10;883039900"></textarea>
          </label>
          <button type="button" id="nbiLookupBtn">🔍 Look up</button>
          <div id="nbiPreview" class="nbi-preview" hidden></div>
        </div>
        <div class="bridge-dialog-foot">
          <button type="button" class="bridge-dialog-cancel secondary">Cancel</button>
          <button type="button" id="nbiImportBtn" disabled>➕ Import selected</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeNbiImport(); });
    overlay.querySelector(".bridge-dialog-close").addEventListener("click", closeNbiImport);
    overlay.querySelector(".bridge-dialog-cancel").addEventListener("click", closeNbiImport);
    overlay.querySelector("#nbiLookupBtn").addEventListener("click", runNbiLookup);
    overlay.querySelector("#nbiImportBtn").addEventListener("click", importNbiSelected);
  }

  const sel = overlay.querySelector("#nbiState");
  const preview = overlay.querySelector("#nbiPreview");
  preview.hidden = true; preview.innerHTML = "";
  overlay.querySelector("#nbiNumbers").value = "";
  overlay.querySelector("#nbiImportBtn").disabled = true;
  nbiPreviewMatches = [];
  overlay.style.display = "flex";

  if (!sel.options.length) {
    sel.innerHTML = `<option value="">Loading states…</option>`;
    try {
      const states = await loadNbiStates();
      sel.innerHTML = states
        .map((s) => `<option value="${s.abbr}">${s.name} (${s.count.toLocaleString()})</option>`)
        .join("");
    } catch (e) {
      sel.innerHTML = `<option value="">Failed to load states</option>`;
      setStatus("⚠ NBI data not found. Run build_nbi_index.py first.");
      console.warn(e);
    }
  }
}

function closeNbiImport() {
  const overlay = document.getElementById("nbiImport");
  if (overlay) overlay.style.display = "none";
  nbiPreviewMatches = [];
}

async function runNbiLookup() {
  const overlay = document.getElementById("nbiImport");
  const abbr = overlay.querySelector("#nbiState").value;
  const preview = overlay.querySelector("#nbiPreview");
  const importBtn = overlay.querySelector("#nbiImportBtn");
  if (!abbr) { setStatus("Pick a state first."); return; }

  const nums = overlay.querySelector("#nbiNumbers").value
    .split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);
  if (!nums.length) { setStatus("Enter at least one NBI number."); return; }

  const lookupBtn = overlay.querySelector("#nbiLookupBtn");
  lookupBtn.disabled = true; lookupBtn.textContent = "Loading…";
  let data;
  try {
    data = await loadNbiState(abbr);
  } catch (e) {
    setStatus("⚠ Could not load " + abbr + " data.");
    lookupBtn.disabled = false; lookupBtn.textContent = "🔍 Look up";
    return;
  }
  lookupBtn.disabled = false; lookupBtn.textContent = "🔍 Look up";

  const found = [], missing = [];
  const seen = new Set();
  for (const q of nums) {
    const m = nbiLookup(data, q);
    if (m && !seen.has(m.struct)) { seen.add(m.struct); found.push(m); }
    else if (!m) missing.push(q);
  }
  nbiPreviewMatches = found;

  let html = "";
  if (found.length) {
    html += `<p class="nbi-preview-head">✅ ${found.length} found — all will be imported:</p>`;
    html += found.map((m) => {
      const title = nbiTitle(m);
      const coords = (m.lat != null && m.lng != null)
        ? `${m.lat.toFixed(5)}, ${m.lng.toFixed(5)}` : "no coordinates";
      return `<div class="nbi-hit"><strong>${escapeHtml(m.struct)}</strong> — ${escapeHtml(title)}
        <span class="nbi-hit-sub">${escapeHtml(m.loc || "")} · ${coords}${m.year ? " · " + escapeHtml(m.year) : ""}</span></div>`;
    }).join("");
  }
  if (missing.length) {
    html += `<p class="nbi-preview-head nbi-miss">⚠ ${missing.length} not found: ${missing.map(escapeHtml).join(", ")}</p>`;
  }
  preview.innerHTML = html;
  preview.hidden = false;
  importBtn.disabled = found.length === 0;
  importBtn.textContent = found.length ? `➕ Import ${found.length}` : "➕ Import selected";
}

function nbiTitle(m) {
  const carried = m.carried && m.carried !== "0" ? m.carried : "";
  const feat = m.feat && m.feat !== "0" ? m.feat : "";
  if (carried && feat) return `${carried} over ${feat}`;
  return carried || feat || `NBI ${m.struct}`;
}

async function importNbiSelected() {
  if (!nbiPreviewMatches.length) return;
  const overlay = document.getElementById("nbiImport");
  const importBtn = overlay.querySelector("#nbiImportBtn");
  importBtn.disabled = true; importBtn.textContent = "Importing…";

  let added = 0;
  for (const m of nbiPreviewMatches) {
    const descParts = [];
    if (m.loc) descParts.push(m.loc);
    if (m.year && m.year !== "0") descParts.push("Built " + m.year);
    descParts.push("NBI " + m.struct);
    const rec = {
      id: createId(),
      createdAt: new Date().toISOString(),
      title: nbiTitle(m),
      description: descParts.join(" · "),
      kml: null,
      reportConfig: null,
      nbi: { struct: m.struct, feat: m.feat, carried: m.carried, loc: m.loc, year: m.year },
    };
    if (m.lat != null && m.lng != null) {
      rec.location = { lat: m.lat, lng: m.lng, accuracy: 0 };
    }
    await putBridgeRec(rec);
    bridges.push(rec);
    added++;
  }

  closeNbiImport();
  renderBridgesList();
  setStatus(`Imported ${added} bridge${added === 1 ? "" : "s"} from the NBI.`);
}

async function deleteBridge(id) {
  const b = bridges.find((x) => x.id === id);
  const name = b ? (b.title || "this bridge") : "this bridge";
  const photos = (await runTransaction("readonly", (store) => store.getAll())).filter((p) => p.bridgeId === id);
  if (!confirm(`Delete “${name}” and its ${photos.length} photo(s)/sketch(es)? This cannot be undone.`)) return;
  for (const p of photos) await runTransaction("readwrite", (store) => store.delete(p.id));
  await deleteBridgeRec(id);
  bridges = bridges.filter((x) => x.id !== id);
  if (activeBridgeId === id) showBridgesOverview();
  else renderBridgesList();
  setStatus(`Deleted bridge “${name}”.`);
}

// Standalone KMZ/KML parser (decoupled from the on-screen overlay globals) used
// by the bridge editor. Returns { kmlText, name, overlays, fileBlob, savedAt }.
async function parseKmzToOverlay(file) {
  let kmlText;
  const imageBlobs = {};
  if (file.name.toLowerCase().endsWith(".kmz")) {
    if (!window.JSZip) throw new Error("JSZip not available");
    const zip = await JSZip.loadAsync(await file.arrayBuffer());
    const kmlEntry = Object.values(zip.files).find((f) => f.name.toLowerCase().endsWith(".kml") && !f.dir);
    if (!kmlEntry) throw new Error("no .kml inside KMZ");
    kmlText = await kmlEntry.async("text");
    for (const [name, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue;
      if (/\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(name)) {
        const ab = await entry.async("arraybuffer");
        const lower = name.toLowerCase();
        const mime = lower.endsWith(".png") ? "image/png" : lower.endsWith(".gif") ? "image/gif"
                   : lower.endsWith(".webp") ? "image/webp" : "image/jpeg";
        const url = arrayBufferToDataUrl(ab, mime);
        imageBlobs[name] = url;
        imageBlobs[name.split("/").pop()] = url;
      }
    }
  } else {
    kmlText = await file.text();
  }

  const kmlDoc = new DOMParser().parseFromString(kmlText, "text/xml");
  const overlays = [];
  for (const el of Array.from(kmlDoc.getElementsByTagName("GroundOverlay"))) {
    const iconEl = el.getElementsByTagName("Icon")[0];
    const hrefEl = iconEl ? iconEl.getElementsByTagName("href")[0] : el.getElementsByTagName("href")[0];
    const href = hrefEl?.textContent?.trim();
    const imageUrl = href ? (imageBlobs[href] || imageBlobs[href.split("/").pop()] || href) : null;
    if (!imageUrl) continue;
    const box = el.getElementsByTagName("LatLonBox")[0];
    if (box) {
      const n = parseFloat(box.getElementsByTagName("north")[0]?.textContent);
      const s = parseFloat(box.getElementsByTagName("south")[0]?.textContent);
      const e = parseFloat(box.getElementsByTagName("east")[0]?.textContent);
      const w = parseFloat(box.getElementsByTagName("west")[0]?.textContent);
      const rot = parseFloat(box.getElementsByTagName("rotation")[0]?.textContent) || 0;
      if (![n, s, e, w].some((v) => isNaN(v))) { overlays.push({ type: "box", bounds: [[s, w], [n, e]], rotation: rot, imageUrl }); continue; }
    }
    let quad = el.getElementsByTagName("gx:LatLonQuad")[0] || el.getElementsByTagName("LatLonQuad")[0];
    if (!quad) for (const e2 of el.getElementsByTagName("*")) { if (e2.localName === "LatLonQuad") { quad = e2; break; } }
    if (quad) {
      const raw = quad.getElementsByTagName("coordinates")[0]?.textContent?.trim() || "";
      const pts = raw.split(/\s+/).map((p) => p.split(",").map(Number)).filter((a) => a.length >= 2);
      if (pts.length >= 4) {
        const lats = pts.map((p) => p[1]), lngs = pts.map((p) => p[0]);
        overlays.push({ type: "quad", bounds: [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]], corners: pts, imageUrl });
      }
    }
  }
  return { kmlText, name: file.name, overlays, fileBlob: file, savedAt: new Date().toISOString() };
}

// ── Save report layout without generating (called from the report modal) ────────
async function saveReportLayout() {
  if (!reportState) return;
  const overlay = document.getElementById("reportModal");
  const bridgeName = (overlay.querySelector("#reportBridgeName").value || "").trim();
  const b = activeBridge();
  if (!b) { setStatus("Open a bridge first."); return; }
  b.reportConfig = { plan: reportState.plan, bridgeName, savedAt: new Date().toISOString() };
  await putBridgeRec(b);
  const idx = bridges.findIndex((x) => x.id === b.id);
  if (idx >= 0) bridges[idx] = b;
  setStatus("✅ Report layout saved. It will be used for this bridge's ZIP export.");
  closeReportModal();
}

// ── ZIP export: everything associated with a bridge ─────────────────────────────
async function downloadBridgeZip(id) {
  if (!window.JSZip) { setStatus("⚠ JSZip not loaded."); return; }
  const b = (await getBridgeRec(id)) || bridges.find((x) => x.id === id);
  if (!b) { setStatus("Bridge not found."); return; }
  const idx = bridges.findIndex((x) => x.id === id);
  if (idx >= 0) bridges[idx] = b;
  const photos = (await runTransaction("readonly", (store) => store.getAll())).filter((p) => p.bridgeId === id && !p.isScanFrame && !p.isScanSession);
  photos.sort((a, c) => a.createdAt.localeCompare(c.createdAt));
  const photoNoById = buildPhotoNumberMap(photos);

  setStatus(`Building ZIP for “${b.title}” (${photos.length} item(s))…`);
  const zip = new JSZip();
  const safe = (s) => (s || "bridge").replace(/[^\w\-]+/g, "_").slice(0, 60);
  const root = zip.folder(safe(b.title));

  const manifest = {
    title: b.title,
    description: b.description || "",
    createdAt: b.createdAt,
    exportedAt: new Date().toISOString(),
    photoCount: photos.length,
    photos: [],
  };
  const csvRows = [["file", "type", "capturedAt", "lat", "lng", "heading", "attitude", "comment", "tags", "isSketch"]];

  const imgFolder = root.folder("images");
  const plyFolder = root.folder("pointclouds");

  let i = 0;
  for (const p of photos) {
    i++;
    const num = photoNoById.get(p.id) || { index: i, main: String(i), thermal: null, depth: `${i}-depth`, ply: `${i}-ply` };
    const kind = p.isSketch ? "sketch" : "photo";
    const files = [];

    if (p.blob) {
      try {
        // Sketches are PNG with transparency-free white bg; embed metadata all the same.
        const annotated = await annotatePhotoBlob(p, p.blob);
        const fname = `${safeStem(num.main)}.jpg`;
        imgFolder.file(fname, annotated);
        files.push("images/" + fname);
      } catch (e) { console.warn("annotate failed for", p.id, e); }
    }
    if (p.thermalBlob) { const f = `${safeStem(num.thermal || `${num.index}-b`)}.jpg`; imgFolder.file(f, p.thermalBlob); files.push("images/" + f); }
    if (p.depthBlob)   { const f = `${safeStem(num.depth || `${num.index}-depth`)}.jpg`;  imgFolder.file(f, p.depthBlob);  files.push("images/" + f); }
    if (p.plyText)     { const f = `${safeStem(num.ply || `${num.index}-ply`)}.ply`; plyFolder.file(f, p.plyText); files.push("pointclouds/" + f); }

    manifest.photos.push({
      seq: i, photoNo: num.main, id: p.id, capturedAt: p.createdAt, comment: p.comment || "",
      tags: p.tags || null, location: p.location || null, heading: p.heading ?? null,
      attitude: p.attitude ?? null, facing: p.facing || null, isSketch: !!p.isSketch, files,
    });
    csvRows.push([
      files[0] || "", kind, p.createdAt,
      p.location ? p.location.lat : "", p.location ? p.location.lng : "",
      p.heading ?? "", p.attitude ?? "", (p.comment || "").replace(/"/g, '""'),
      tagsToFlatString(p.tags).replace(/"/g, '""'), p.isSketch ? "yes" : "no",
    ]);
  }

  root.file("metadata.json", JSON.stringify(manifest, null, 2));
  root.file("metadata.csv", csvRows.map((r) => r.map((c) => `"${c}"`).join(",")).join("\r\n"));

  // KMZ / KML overlay (original file when available, otherwise reconstructed KML).
  if (b.kml) {
    const ov = root.folder("overlay");
    if (b.kml.fileBlob) ov.file(b.kml.name || "overlay.kmz", b.kml.fileBlob);
    else if (b.kml.kmlText) ov.file(b.kml.name || "overlay.kml", b.kml.kmlText);
  }

  // Word report using the last saved layout, or defaults.
  if (typeof buildReportDoc === "function" && window.docx) {
    try {
      const withPhoto = photos.filter((p) => p.blob);
      if (withPhoto.length) {
        const cfg = b.reportConfig;
        const meta = { bridgeName: (cfg && cfg.bridgeName) || b.title };
        if (cfg && cfg.plan) meta.plan = cfg.plan;
        const docBlob = await buildReportDoc(withPhoto, meta);
        root.file("report.docx", docBlob);
      }
    } catch (e) { console.warn("report in zip failed:", e); }
  }

  setStatus("Compressing ZIP…");
  const blob = await zip.generateAsync({ type: "blob", compression: "DEFLATE" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safe(b.title)}.zip`;
  a.click();
  URL.revokeObjectURL(a.href);
  setStatus(`✅ Downloaded “${b.title}” ZIP (${photos.length} item(s)).`);
}

// ── Card builder ──────────────────────────────────────────────────────────────
function buildCard(record, photoNo) {
  const card = photoCardTemplate.content.firstElementChild.cloneNode(true);
  const labels = photoNo || { main: "photo", thermal: "stereo", overlay: "photo-overlay", depth: "depth", ply: "pointcloud" };

  const mainImg = card.querySelector(".main-img");
  const mainUrl = URL.createObjectURL(record.blob);
  mainImg.src = mainUrl;
  mainImg.addEventListener("load", () => URL.revokeObjectURL(mainUrl), { once: true });

  const mainBadge = card.querySelector(".photo-img-wrap .img-badge");
  if (mainBadge) {
    mainBadge.textContent = labels.main;
    if (record.isSketch) mainBadge.style.background = "rgba(124,58,237,.75)";
  }
  if (record.annotationOverlayBlob) {
    const overlayImg = document.createElement("img");
    overlayImg.className = "photo-annotation-overlay";
    const ovUrl = URL.createObjectURL(record.annotationOverlayBlob);
    overlayImg.src = ovUrl;
    overlayImg.alt = "Annotation overlay";
    overlayImg.addEventListener("load", () => URL.revokeObjectURL(ovUrl), { once: true });
    card.querySelector(".photo-img-wrap").appendChild(overlayImg);
  }

  if (record.thermalBlob) {
    const thermalWrap = card.querySelector(".thermal-img-wrap");
    const thermalImg  = card.querySelector(".thermal-img");
    const thermalBadge = card.querySelector(".thermal-img-wrap .img-badge");
    if (thermalBadge) thermalBadge.textContent = labels.thermal || "stereo";
    const thermalUrl  = URL.createObjectURL(record.thermalBlob);
    thermalImg.src = thermalUrl;
    thermalImg.addEventListener("load", () => URL.revokeObjectURL(thermalUrl), { once: true });
    thermalWrap.hidden = false;
  }

  if (record.depthBlob) {
    const depthWrap = card.querySelector(".depth-img-wrap");
    const depthImg  = card.querySelector(".depth-img");
    const depthBadge = card.querySelector(".depth-img-wrap .img-badge");
    if (depthBadge) depthBadge.textContent = labels.depth || "depth";
    const depthUrl  = URL.createObjectURL(record.depthBlob);
    depthImg.src = depthUrl;
    depthImg.addEventListener("load", () => URL.revokeObjectURL(depthUrl), { once: true });
    depthWrap.hidden = false;
  }

  const time = card.querySelector("time");
  time.dateTime = record.createdAt;
  time.textContent = `${labels.main} · ${new Date(record.createdAt).toLocaleString()}`;

  renderComment(card.querySelector(".photo-comment-area"), record);
  renderTagsArea(card.querySelector(".photo-tags-area"), record);
  renderNavArea(card.querySelector(".photo-nav-area"), record);

  const dlBtn = card.querySelector(".download-btn");
  if (record.annotationOverlayBlob) dlBtn.textContent = "⬇ Photo only";
  dlBtn.addEventListener("click", () => downloadPhoto(record, record.blob, labels.main));

  if (!record.isSketch) {
    const annotateBtn = makeButton("🖊 Annotate", "secondary");
    annotateBtn.addEventListener("click", () => openPhotoAnnotator(record));
    card.querySelector(".photo-actions").insertBefore(annotateBtn, card.querySelector(".download-btn"));
    if (record.annotationOverlayBlob) {
      const dlOverlay = makeButton("⬇ Photo+overlay", "secondary");
      dlOverlay.addEventListener("click", () => downloadPhoto(record, record.blob, labels.overlay, true, true));
      card.querySelector(".photo-actions").insertBefore(dlOverlay, dlBtn.nextSibling);
    }
    attachCrackTool(card, record);
  }

  if (record.thermalBlob) {
    const dlT = makeButton("\u2b07 Thermal", "secondary");
    dlT.addEventListener("click", () => downloadPhoto(record, record.thermalBlob, labels.thermal || "stereo", false));
    card.querySelector(".photo-actions").insertBefore(dlT, card.querySelector(".download-btn").nextSibling);
  }

  if (record.depthBlob) {
    const dlD = makeButton("\u2b07 Depth", "secondary");
    dlD.addEventListener("click", () => downloadPhoto(record, record.depthBlob, labels.depth || "depth", false));
    card.querySelector(".photo-actions").insertBefore(dlD, card.querySelector(".download-btn").nextSibling);
  }
  if (record.plyText) {
    const dlP = makeButton("\u2b07 PLY (3D)", "secondary");
    dlP.addEventListener("click", () => downloadPly(record, labels.ply || "pointcloud"));
    card.querySelector(".photo-actions").insertBefore(dlP, card.querySelector(".download-btn").nextSibling);
  }

  card.querySelector(".delete-btn").addEventListener("click", async () => {
    const confirmed = window.confirm(`Delete photo ${labels.main}? This cannot be undone.`);
    if (!confirmed) {
      setStatus("Photo delete canceled.");
      return;
    }
    const inst = leafletInstances.get(record.id);
    if (inst) { inst.lmap.remove(); leafletInstances.delete(record.id); }
    await runTransaction("readwrite", (store) => store.delete(record.id));
    await renderSavedPhotos();
    setStatus("Photo deleted.");
  });

  return card;
}

// ── Download with EXIF + metadata burn-in ────────────────────────────────────
async function downloadPhoto(record, blob, stem, burnMeta = true, includeOverlay = false) {
  // Stereo/depth images must stay pixel-identical for OpenCV: skip the
  // burned-in footer bar (and EXIF re-encode) entirely for those.
  if (!burnMeta) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${safeStem(stem)}.jpg`;
    a.click();
    URL.revokeObjectURL(a.href);
    return;
  }
  const finalBlob = await annotatePhotoBlob(record, blob, { includeOverlay });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(finalBlob);
  a.download = `${safeStem(stem)}.jpg`;
  a.click();
  URL.revokeObjectURL(a.href);
}

// Returns a JPEG Blob of `blob` with a metadata footer burned in and GPS/comment
// embedded as EXIF. Reused by both single-photo download and the bridge ZIP export.
async function annotatePhotoBlob(record, blob, opts = {}) {
  const includeOverlay = !!opts.includeOverlay;
  const img    = await loadImage(blob);
  const canvas = document.createElement("canvas");
  canvas.width  = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  if (includeOverlay && record.annotationOverlayBlob) {
    try {
      const ov = await loadImage(record.annotationOverlayBlob);
      ctx.drawImage(ov, 0, 0, canvas.width, canvas.height);
    } catch (e) { console.warn("overlay compose failed:", e); }
  }

  const lines = [];
  lines.push(new Date(record.createdAt).toLocaleString());
  const navParts = [];
  if (record.location) {
    const { lat, lng, accuracy } = record.location;
    navParts.push(`GPS ${lat.toFixed(6)}, ${lng.toFixed(6)}${accuracy ? ` (\u00b1${accuracy}m)` : ""}`);
  }
  if (record.heading != null) {
    navParts.push(`Direction ${record.heading}\u00b0 ${bearingLabel(record.heading)}${record.facing ? ` (${facingLabel(record.facing)} camera)` : ""}`);
  }
  if (record.attitude != null && isFinite(record.attitude)) navParts.push(`Attitude ${attitudeLabel(record.attitude)}`);
  if (navParts.length) lines.push(navParts.join(" \u00b7 "));
  if (record.comment) lines.push(`Comment: ${record.comment}`);
  const tagStr = tagsToFlatString(record.tags);
  if (tagStr) lines.push(`Tags: ${tagStr}`);

  if (lines.length) {
    const lineH = Math.max(22, Math.round(canvas.width * 0.025));
    const pad   = Math.round(lineH * 0.4);
    const barH  = lines.length * lineH + pad * 2;
    ctx.fillStyle = "rgba(0,0,0,0.68)";
    ctx.fillRect(0, canvas.height - barH, canvas.width, barH);
    ctx.fillStyle = "#ffffff";
    ctx.font = `${Math.round(lineH * 0.65)}px Arial, sans-serif`;
    ctx.textBaseline = "top";
    lines.forEach((line, i) => ctx.fillText(line, pad, canvas.height - barH + pad + i * lineH));
  }

  let finalBlob = await canvasToBlob(canvas);

  if (record.location && window.piexif) {
    try {
      const buf    = await finalBlob.arrayBuffer();
      const binary = bufferToBinaryString(buf);
      let exifObj;
      try { exifObj = piexif.load(binary); } catch { exifObj = { "0th": {}, "Exif": {}, "GPS": {}, "Interop": {}, "1st": {} }; }
      const { lat, lng } = record.location;
      exifObj["GPS"][piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? "N" : "S";
      exifObj["GPS"][piexif.GPSIFD.GPSLatitude]     = decimalToDmsRational(Math.abs(lat));
      exifObj["GPS"][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? "E" : "W";
      exifObj["GPS"][piexif.GPSIFD.GPSLongitude]    = decimalToDmsRational(Math.abs(lng));
      if (record.heading != null) {
        exifObj["GPS"][piexif.GPSIFD.GPSImgDirectionRef] = "T";
        exifObj["GPS"][piexif.GPSIFD.GPSImgDirection]    = [Math.round(record.heading * 100), 100];
      }
      // Embed comment (+ tags) as EXIF ImageDescription
      const descParts = [];
      if (record.comment) descParts.push(record.comment);
      const tagStrExif = tagsToFlatString(record.tags);
      if (tagStrExif) descParts.push(`[${tagStrExif}]`);
      if (descParts.length) {
        exifObj["0th"][piexif.ImageIFD.ImageDescription] = descParts.join(" ");
      }
      const exifBytes = piexif.dump(exifObj);
      const inserted  = piexif.insert(exifBytes, binary);
      const bytes     = new Uint8Array(inserted.length);
      for (let i = 0; i < inserted.length; i++) bytes[i] = inserted.charCodeAt(i);
      finalBlob = new Blob([bytes], { type: "image/jpeg" });
    } catch (e) { console.warn("EXIF embedding failed:", e); }
  }
  return finalBlob;
}

function downloadPly(record, stem = "pointcloud") {
  const blob = new Blob([record.plyText], { type: "application/octet-stream" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${safeStem(stem)}.ply`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function decimalToDmsRational(decimal) {
  const d = Math.floor(decimal);
  const mFull = (decimal - d) * 60;
  const m = Math.floor(mFull);
  const s = Math.round((mFull - m) * 60 * 10000);
  return [[d, 1], [m, 1], [s, 10000]];
}

function arrayBufferToDataUrl(buffer, mime) {
  // Chunked to avoid stack overflow on large images
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK)
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return `data:${mime};base64,${btoa(binary)}`;
}

function bufferToBinaryString(buffer) {
  const bytes = new Uint8Array(buffer);
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK)
    out += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  return out;
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image(), url = URL.createObjectURL(blob);
    img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Failed to load image")); };
    img.src = url;
  });
}

// ── Local crack detection (pure-canvas, offline) ──────────────────────────────
// Cracks are thin DARK ridges on a brighter surface. A grayscale morphological
// CLOSING fills them in; the "black-hat" = closing − original isolates exactly
// those dark thin features. An adaptive threshold + small-blob removal yields a
// crack mask, painted as a translucent red overlay. All classical DSP — no ML,
// no external libraries, runs fully client-side.

const CRACK_MAXDIM = 1100;   // analysis resolution cap (perf)

function _grayFromCanvas(cnv) {
  const { width: w, height: h } = cnv;
  const d = cnv.getContext("2d", { willReadFrequently: true }).getImageData(0, 0, w, h).data;
  const g = new Float32Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) g[j] = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
  return g;
}

// Separable box blur (approx Gaussian) — denoise before morphology.
function _boxBlur(src, w, h, r) {
  if (r < 1) return src.slice();
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h), win = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0; const row = y * w;
    for (let x = -r; x <= r; x++) acc += src[row + Math.min(w - 1, Math.max(0, x))];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / win;
      const xo = row + Math.min(w - 1, Math.max(0, x - r));
      const xi = row + Math.min(w - 1, Math.max(0, x + r + 1));
      acc += src[xi] - src[xo];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[x + w * Math.min(h - 1, Math.max(0, y))];
    for (let y = 0; y < h; y++) {
      out[x + y * w] = acc / win;
      const yo = x + w * Math.min(h - 1, Math.max(0, y - r));
      const yi = x + w * Math.min(h - 1, Math.max(0, y + r + 1));
      acc += src[yi] - src[yo];
    }
  }
  return out;
}

// Fast 3x3 median filter — removes CMOS column fixed-pattern noise, JPEG speckle
// and salt/pepper without blurring crack edges the way a Gaussian would. A crack
// is a connected ridge many pixels long, so it survives the median; isolated
// 1-px-wide column streaks and specks are outvoted by their neighbours.
function _median3(src, w, h) {
  const out = new Float32Array(w * h);
  const v = new Float32Array(9);
  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - 1) * w, y1 = y * w, y2 = Math.min(h - 1, y + 1) * w;
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - 1), x2 = Math.min(w - 1, x + 1);
      v[0] = src[y0 + x0]; v[1] = src[y0 + x]; v[2] = src[y0 + x2];
      v[3] = src[y1 + x0]; v[4] = src[y1 + x]; v[5] = src[y1 + x2];
      v[6] = src[y2 + x0]; v[7] = src[y2 + x]; v[8] = src[y2 + x2];
      // partial selection sort up to the 5th element (median of 9)
      for (let i = 0; i < 5; i++) {
        let m = i;
        for (let j = i + 1; j < 9; j++) if (v[j] < v[m]) m = j;
        const t = v[i]; v[i] = v[m]; v[m] = t;
      }
      out[y1 + x] = v[4];
    }
  }
  return out;
}

// Separable grayscale morphology with a flat square kernel (min = erosion,
// max = dilation). `fn` is Math.min or Math.max.
function _morph(src, w, h, r, fn) {
  const tmp = new Float32Array(w * h), out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let v = src[row + x];
      for (let k = -r; k <= r; k++) { const xx = Math.min(w - 1, Math.max(0, x + k)); v = fn(v, src[row + xx]); }
      tmp[row + x] = v;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = tmp[y * w + x];
      for (let k = -r; k <= r; k++) { const yy = Math.min(h - 1, Math.max(0, y + k)); v = fn(v, tmp[yy * w + x]); }
      out[y * w + x] = v;
    }
  }
  return out;
}

// Remove connected blobs smaller than minArea from a binary mask (in place).
function _removeSmallBlobs(mask, w, h, minArea) {
  const seen = new Uint8Array(w * h), stack = new Int32Array(w * h);
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i] || seen[i]) continue;
    let sp = 0; stack[sp++] = i; seen[i] = 1;
    const comp = []; 
    while (sp) {
      const p = stack[--sp]; comp.push(p);
      const x = p % w, y = (p / w) | 0;
      if (x > 0     && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[sp++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[sp++] = p + 1; }
      if (y > 0     && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[sp++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[sp++] = p + w; }
    }
    if (comp.length < minArea) for (const p of comp) mask[p] = 0;
  }
}

// Run crack detection on a source canvas. `sensitivity` 0..1 (higher = more).
// Returns { overlay: <canvas RGBA red mask>, crackFrac, w, h }.
// Reject thin vertical streaks (sensor/JPEG column artifacts, formwork seams).
// For each flagged pixel we measure (a) its continuous vertical run length,
// bridging small gaps so dashed streaks still count, and (b) its horizontal
// thickness. A pixel that belongs to a long vertical run AND is thin horizontally
// is a column streak → removed. Real cracks survive because diagonal/meandering
// cracks have short per-column vertical runs, and wide sealed joints are thick.
function _suppressStraightVertical(mask, w, h) {
  const GAP = 18;                                  // bridge vertical gaps up to 18px
  const MINRUN = Math.max(10, Math.round(h * 0.035)); // vertical extent to be a "line"
  const MAXWIDTH = 3;                              // horizontal thickness ≤ this ⇒ thin

  // Horizontal run length through each flagged pixel (its local width).
  const hrun = new Int16Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let x = 0;
    while (x < w) {
      if (!mask[row + x]) { x++; continue; }
      let x2 = x; while (x2 < w && mask[row + x2]) x2++;
      const len = x2 - x;
      for (let k = x; k < x2; k++) hrun[row + k] = len;
      x = x2;
    }
  }
  // Per column: find vertical runs (gap-tolerant); within long runs, clear thin pixels.
  for (let x = 0; x < w; x++) {
    let y = 0;
    while (y < h) {
      if (!mask[y * w + x]) { y++; continue; }
      let yStart = y, yEnd = y, gap = 0, yy = y;
      while (yy < h) {
        if (mask[yy * w + x]) { yEnd = yy; gap = 0; }
        else { gap++; if (gap > GAP) break; }
        yy++;
      }
      if (yEnd - yStart + 1 >= MINRUN) {
        for (let k = yStart; k <= yEnd; k++) {
          const p = k * w + x;
          if (mask[p] && hrun[p] <= MAXWIDTH) mask[p] = 0;
        }
      }
      y = yEnd + 1;
    }
  }
}

function detectCracksOnCanvas(srcCanvas, sensitivity = 0.5, suppressVertical = true) {
  const w = srcCanvas.width, h = srcCanvas.height;
  const gray = _grayFromCanvas(srcCanvas);
  const med  = _median3(gray, w, h);                   // kill column noise / speckle at source
  const den  = _boxBlur(med, w, h, 1);                 // light denoise
  const kr   = Math.max(2, Math.round(Math.min(w, h) / 200)); // kernel scales with image
  const closing = _morph(_morph(den, w, h, kr, Math.max), w, h, kr, Math.min); // dilate→erode
  // Black-hat: closing − original. Dark thin cracks → large positive values.
  const bh = new Float32Array(w * h);
  let mean = 0;
  for (let i = 0; i < bh.length; i++) { const v = Math.max(0, closing[i] - den[i]); bh[i] = v; mean += v; }
  mean /= bh.length;
  let varAcc = 0;
  for (let i = 0; i < bh.length; i++) { const d = bh[i] - mean; varAcc += d * d; }
  const std = Math.sqrt(varAcc / bh.length);
  // Adaptive threshold: higher sensitivity → lower multiplier → more detections.
  const k = 3.2 - 2.6 * Math.min(1, Math.max(0, sensitivity));   // ~[0.6 .. 3.2]
  // Absolute contrast floor (gray levels): a real crack darkens the surface by a
  // few levels; sub-visual sensor/JPEG noise never does. Relaxes with sensitivity.
  const floor = 11 - 6 * Math.min(1, Math.max(0, sensitivity));  // ~[5 .. 11] levels
  const thr = Math.max(floor, mean + k * std);
  const mask = new Uint8Array(w * h);
  let count = 0;
  for (let i = 0; i < bh.length; i++) if (bh[i] >= thr) { mask[i] = 1; count++; }
  // Drop tiny speckles (noise); min blob size scales with image area.
  _removeSmallBlobs(mask, w, h, Math.max(8, Math.round(w * h / 40000)));
  // Reject formwork seams / column streaks: long, straight, near-vertical blobs.
  if (suppressVertical) _suppressStraightVertical(mask, w, h);

  const overlay = document.createElement("canvas");
  overlay.width = w; overlay.height = h;
  const octx = overlay.getContext("2d");
  const out = octx.createImageData(w, h);
  let painted = 0;
  for (let i = 0, j = 0; i < mask.length; i++, j += 4) {
    if (mask[i]) { out.data[j] = 255; out.data[j + 1] = 30; out.data[j + 2] = 30; out.data[j + 3] = 235; painted++; }
  }
  octx.putImageData(out, 0, 0);
  return { overlay, crackFrac: painted / (w * h), w, h };
}

// Load a blob into a canvas, downscaled so its longest edge ≤ CRACK_MAXDIM.
async function _blobToAnalysisCanvas(blob) {
  const img = await loadImage(blob);
  const scale = Math.min(1, CRACK_MAXDIM / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const cnv = document.createElement("canvas");
  cnv.width = w; cnv.height = h;
  cnv.getContext("2d").drawImage(img, 0, 0, w, h);
  return cnv;
}

// Wire a crack-detection UI onto a photo card: overlay canvas + control strip.
function attachCrackTool(card, record) {
  const wrap = card.querySelector(".photo-img-wrap");
  if (!wrap) return;
  let overlayEl = null, srcCanvas = null, lastResult = null, visible = false;
  let sensitivity = 0.5, suppressVertical = true;

  // Control strip (hidden until first run).
  const bar = document.createElement("div");
  bar.className = "crack-bar";
  bar.hidden = true;
  bar.innerHTML =
    '<span class="crack-stat">Cracks: –</span>' +
    '<label class="crack-sens">Sensitivity<input type="range" min="0" max="100" value="50"></label>' +
    '<label class="crack-vert"><input type="checkbox" checked>Ignore vertical lines</label>' +
    '<button class="crack-save secondary" type="button">\u2b07 Save</button>' +
    '<button class="crack-hide secondary" type="button">\u2715 Hide</button>';
  wrap.append(bar);
  const statEl = bar.querySelector(".crack-stat");
  const sens   = bar.querySelector(".crack-sens input");
  const vertChk = bar.querySelector(".crack-vert input");
  const saveBtn = bar.querySelector(".crack-save");
  const hideBtn = bar.querySelector(".crack-hide");

  async function run() {
    statEl.textContent = "Analyzing\u2026";
    if (!srcCanvas) srcCanvas = await _blobToAnalysisCanvas(record.blob);
    lastResult = detectCracksOnCanvas(srcCanvas, sensitivity, suppressVertical);
    if (overlayEl) overlayEl.remove();
    overlayEl = lastResult.overlay;
    overlayEl.className = "crack-overlay";
    wrap.insertBefore(overlayEl, bar);
    visible = true;
    statEl.textContent = `Cracks: ${(lastResult.crackFrac * 100).toFixed(2)}% of area`;
  }

  sens.addEventListener("input", () => { sensitivity = sens.value / 100; run(); });
  vertChk.addEventListener("change", () => { suppressVertical = vertChk.checked; run(); });
  hideBtn.addEventListener("click", () => {
    if (overlayEl) overlayEl.style.display = visible ? "none" : "block";
    visible = !visible;
    hideBtn.textContent = visible ? "\u2715 Hide" : "\ud83d\udc41 Show";
  });
  saveBtn.addEventListener("click", () => saveCrackOverlay(record, srcCanvas, lastResult));

  const btn = makeButton("\ud83d\udd0d Cracks", "secondary");
  btn.addEventListener("click", async () => {
    bar.hidden = false;
    if (!lastResult) await run();
    else { if (overlayEl) { overlayEl.style.display = "block"; visible = true; hideBtn.textContent = "\u2715 Hide"; } }
  });
  card.querySelector(".photo-actions").insertBefore(btn, card.querySelector(".delete-btn"));
}

// Composite the red crack overlay onto the full-res photo and download it.
async function saveCrackOverlay(record, srcCanvas, result) {
  if (!result) return;
  const img = await loadImage(record.blob);
  const cnv = document.createElement("canvas");
  cnv.width = img.naturalWidth; cnv.height = img.naturalHeight;
  const ctx = cnv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = 0.85;
  ctx.drawImage(result.overlay, 0, 0, cnv.width, cnv.height); // scale mask up to full res
  ctx.globalAlpha = 1;
  const blob = await canvasToBlob(cnv);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `cracks-${record.id.slice(0, 8)}.jpg`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  setStatus(`Crack overlay saved (${(result.crackFrac * 100).toFixed(2)}% flagged).`);
}


// ── Satellite map (300-ft zoom) ───────────────────────────────────────────────
function zoomFor300ft(lat, containerPx) {
  const w     = containerPx || 280;
  const mpxZ0 = 156543.03392 * Math.cos((lat * Math.PI) / 180);
  return Math.round(Math.max(1, Math.min(19, Math.log2((mpxZ0 * w) / FEET_300_M))));
}

function makeArrowIcon(headingDeg) {
  const deg = headingDeg ?? 0, op = headingDeg == null ? 0.4 : 1;
  return L.divIcon({
    className: "",
    html: `<div class="arrow-icon" style="transform:rotate(${deg}deg);opacity:${op}" title="Drag to move location"><svg viewBox="0 0 40 40" width="40" height="40"><polygon points="20,3 32,34 20,27 8,34" fill="#38bdf8" stroke="#0c4a6e" stroke-width="2.5" stroke-linejoin="round"/></svg></div>`,
    iconSize: [40, 40], iconAnchor: [20, 20]
  });
}

function makeHandleIcon() {
  return L.divIcon({
    className: "",
    html: '<div class="handle-icon" title="Drag to set direction"></div>',
    iconSize: [16, 16], iconAnchor: [8, 8]
  });
}

function getHandleLatLng(lmap, mainLL, headingDeg, px = 55) {
  const deg = headingDeg ?? 0;
  const mp  = lmap.latLngToContainerPoint(mainLL);
  const rad = (deg * Math.PI) / 180;
  return lmap.containerPointToLatLng([mp.x + px * Math.sin(rad), mp.y - px * Math.cos(rad)]);
}

function initMap(container, record) {
  const { lat, lng } = record.location;
  const lmap = L.map(container, { scrollWheelZoom: true, maxZoom: 22 });
  addEsriBasemap(lmap);

  const zoom = zoomFor300ft(lat, container.clientWidth || 280);
  lmap.setView([lat, lng], zoom);
  lmap.invalidateSize();

  const mainLL       = L.latLng(lat, lng);
  const arrowMarker  = L.marker(mainLL, { draggable: true, icon: makeArrowIcon(record.heading), zIndexOffset: 100 }).addTo(lmap);
  const handleMarker = L.marker(getHandleLatLng(lmap, mainLL, record.heading), { draggable: true, icon: makeHandleIcon(), zIndexOffset: 200 }).addTo(lmap);

  arrowMarker.on("drag", () => {
    const ll = arrowMarker.getLatLng();
    handleMarker.setLatLng(getHandleLatLng(lmap, ll, record.heading));
    // Live-update the coordinate display while dragging
    const card = container.closest(".photo-card");
    if (card) {
      const valEl = card.querySelector(".photo-nav-area .photo-nav-line");
      if (valEl) valEl.textContent = navSummaryLine(record, { location: { lat: ll.lat, lng: ll.lng, accuracy: 0 } });
    }
  });
  arrowMarker.on("dragend", async () => {
    const ll = arrowMarker.getLatLng();
    record.location = { lat: parseFloat(ll.lat.toFixed(6)), lng: parseFloat(ll.lng.toFixed(6)), accuracy: 0 };
    handleMarker.setLatLng(getHandleLatLng(lmap, ll, record.heading));
    await runTransaction("readwrite", (store) => store.put(record));
    const card = container.closest(".photo-card");
    if (card) renderNavArea(card.querySelector(".photo-nav-area"), record);
    setStatus("Location updated by dragging.");
  });

  handleMarker.on("drag", () => {
    const newH = Math.round(bearingBetween(arrowMarker.getLatLng(), handleMarker.getLatLng()));
    record.heading = newH;
    arrowMarker.setIcon(makeArrowIcon(newH));
  });
  handleMarker.on("dragend", async () => {
    const newH = Math.round(bearingBetween(arrowMarker.getLatLng(), handleMarker.getLatLng()));
    record.heading = newH;
    handleMarker.setLatLng(getHandleLatLng(lmap, arrowMarker.getLatLng(), newH));
    arrowMarker.setIcon(makeArrowIcon(newH));
    await runTransaction("readwrite", (store) => store.put(record));
    const card = container.closest(".photo-card");
    if (card) renderNavArea(card.querySelector(".photo-nav-area"), record);
    setStatus(`Direction: ${newH}\u00b0 ${bearingLabel(newH)}.`);
  });

  return { lmap, arrowMarker, handleMarker, kmlLayer: null };
}

function syncMapToRecord(recordId, record) {
  const inst = leafletInstances.get(recordId);
  if (!inst) return;
  const { lmap, arrowMarker, handleMarker } = inst;
  if (record.location) {
    const ll = L.latLng(record.location.lat, record.location.lng);
    arrowMarker.setLatLng(ll);
    lmap.setView(ll, lmap.getZoom());
    handleMarker.setLatLng(getHandleLatLng(lmap, ll, record.heading));
  }
  arrowMarker.setIcon(makeArrowIcon(record.heading));
}

// ── KML / KMZ ─────────────────────────────────────────────────────────────────
async function loadKmlFile(file) {
  kmlStatus.textContent = "Loading\u2026";
  const diag = [];
  try {
    let kmlText;
    const imageBlobs = {};

    if (file.name.toLowerCase().endsWith(".kmz")) {
      if (!window.JSZip) { kmlStatus.textContent = "JSZip library not available."; return; }
      const zip = await JSZip.loadAsync(await file.arrayBuffer());
      const allNames = Object.keys(zip.files).filter(n => !zip.files[n].dir);
      diag.push(`KMZ contains ${allNames.length} files: ${allNames.join(", ")}`);
      const kmlEntry = Object.values(zip.files).find(f => f.name.toLowerCase().endsWith(".kml") && !f.dir);
      if (!kmlEntry) { kmlStatus.textContent = "No .kml file found inside KMZ. Files: " + allNames.join(", "); return; }
      kmlText = await kmlEntry.async("text");
      // Extract all images as data URLs
      let imgCount = 0;
      for (const [name, entry] of Object.entries(zip.files)) {
        if (entry.dir) continue;
        if (/\.(png|jpe?g|gif|webp|tiff?|bmp)$/i.test(name)) {
          const ab   = await entry.async("arraybuffer");
          const lower= name.toLowerCase();
          const mime = lower.endsWith(".png")  ? "image/png"
                     : lower.endsWith(".gif")  ? "image/gif"
                     : lower.endsWith(".webp") ? "image/webp"
                     : "image/jpeg";
          const url  = arrayBufferToDataUrl(ab, mime);
          imageBlobs[name]                  = url;
          imageBlobs[name.split("/").pop()] = url;
          imgCount++;
        }
      }
      diag.push(`Extracted ${imgCount} image(s)`);
    } else {
      kmlText = await file.text();
      diag.push("Plain KML (no embedded images — external hrefs may not load)");
    }

    const kmlDoc = new DOMParser().parseFromString(kmlText, "text/xml");
    const parseErr = kmlDoc.getElementsByTagName("parsererror");
    if (parseErr.length) diag.push("XML parse warning");

    // Extract GroundOverlays — support LatLonBox AND gx:LatLonQuad
    kmlGroundOverlays = [];
    const goEls = Array.from(kmlDoc.getElementsByTagName("GroundOverlay"));
    diag.push(`${goEls.length} GroundOverlay element(s)`);

    for (const el of goEls) {
      // Get href (image reference)
      const iconEl = el.getElementsByTagName("Icon")[0];
      const hrefEl = iconEl ? iconEl.getElementsByTagName("href")[0] : el.getElementsByTagName("href")[0];
      const href = hrefEl?.textContent?.trim();
      const imageUrl = href ? (imageBlobs[href] || imageBlobs[href.split("/").pop()] || href) : null;
      if (!imageUrl) { diag.push(`  overlay href="${href}" -> NOT FOUND in zip`); continue; }

      // Method 1: LatLonBox (axis-aligned)
      const box = el.getElementsByTagName("LatLonBox")[0];
      if (box) {
        const n = parseFloat(box.getElementsByTagName("north")[0]?.textContent);
        const s = parseFloat(box.getElementsByTagName("south")[0]?.textContent);
        const e = parseFloat(box.getElementsByTagName("east")[0]?.textContent);
        const w = parseFloat(box.getElementsByTagName("west")[0]?.textContent);
        const rot = parseFloat(box.getElementsByTagName("rotation")[0]?.textContent) || 0;
        if (![n, s, e, w].some(v => isNaN(v))) {
          kmlGroundOverlays.push({ type: "box", bounds: [[s, w], [n, e]], rotation: rot, imageUrl });
          diag.push(`  LatLonBox N${n} S${s} E${e} W${w} rot${rot}`);
          continue;
        }
      }

      // Method 2: gx:LatLonQuad (rotated / arbitrary quad) — Google Earth default
      let quad = el.getElementsByTagName("gx:LatLonQuad")[0] || el.getElementsByTagName("LatLonQuad")[0];
      if (!quad) {
        // search any element whose localName is LatLonQuad
        for (const e2 of el.getElementsByTagName("*")) {
          if (e2.localName === "LatLonQuad") { quad = e2; break; }
        }
      }
      if (quad) {
        const coordsEl = quad.getElementsByTagName("coordinates")[0];
        const raw = coordsEl?.textContent?.trim() || "";
        // 4 corner pairs: lon,lat lon,lat lon,lat lon,lat (CCW from lower-left)
        const pts = raw.split(/\s+/).map(p => p.split(",").map(Number)).filter(a => a.length >= 2);
        if (pts.length >= 4) {
          const lats = pts.map(p => p[1]), lngs = pts.map(p => p[0]);
          const bounds = [[Math.min(...lats), Math.min(...lngs)], [Math.max(...lats), Math.max(...lngs)]];
          kmlGroundOverlays.push({ type: "quad", bounds, corners: pts, imageUrl });
          diag.push(`  LatLonQuad ${pts.length} corners`);
          continue;
        }
      }
      diag.push(`  overlay has no LatLonBox or LatLonQuad — skipped`);
    }

    // Strip GroundOverlays before toGeoJSON
    for (const goEl of Array.from(kmlDoc.getElementsByTagName("GroundOverlay"))) {
      if (goEl.parentNode) goEl.parentNode.removeChild(goEl);
    }
    kmlGeoJSON = window.toGeoJSON ? toGeoJSON.kml(kmlDoc) : null;

    for (const [, inst] of leafletInstances) applyKmlToMap(inst);
    // Persist the overlay in the active bridge record so it survives reloads,
    // is scoped to this bridge, and is shared with the Map summary page.
    try {
      const saved = {
        kmlText,
        name: file.name,
        overlays: kmlGroundOverlays,
        fileBlob: file,
        savedAt: new Date().toISOString(),
      };
      const b = activeBridge();
      if (b) { b.kml = saved; await putBridgeRec(b); }
      // Clear any legacy localStorage copy now that IndexedDB is the source of truth.
      try { localStorage.removeItem("kml-overlay"); localStorage.removeItem("kml-name"); localStorage.removeItem("kml-overlays-data"); } catch {}
    } catch (e) { diag.push("(overlay failed to save: " + e.message + ")"); console.warn("overlay save failed:", e); }

    kmlFileName.textContent = file.name;
    clearKmlButton.hidden = false;
    const vc = kmlGeoJSON?.features?.length ?? 0;
    const ic = kmlGroundOverlays.length;
    kmlStatus.innerHTML = `<strong>Overlay loaded:</strong> ${ic} image${ic !== 1 ? "s" : ""}${vc ? ` + ${vc} vector feature${vc !== 1 ? "s" : ""}` : ""}.`;
    // Full parse details stay in the console for troubleshooting only.
    console.log("KMZ diagnostics:", diag);
  } catch (err) {
    kmlStatus.textContent = `Failed: ${err.message}`;
    console.error(err, diag);
  }
}

function applyKmlToMap(inst) {
  // Remove old layers
  if (inst.kmlLayer) { inst.lmap.removeLayer(inst.kmlLayer); inst.kmlLayer = null; }
  (inst.kmlOverlays || []).forEach(l => inst.lmap.removeLayer(l));
  inst.kmlOverlays = [];

  // Vector features (lines, polygons, points)
  if (kmlGeoJSON?.features?.length) {
    inst.kmlLayer = L.geoJSON(kmlGeoJSON, {
      style: { color: "#ff6600", weight: 2.5, opacity: 0.9, fillOpacity: 0.2, fillColor: "#ff9900" },
      pointToLayer: (_, ll) => L.circleMarker(ll, { radius: 6, fillColor: "#ff6600", color: "#cc4400", weight: 2, fillOpacity: 0.85 }),
      onEachFeature: (f, layer) => {
        const name = f.properties?.name || f.properties?.Name;
        const desc = f.properties?.description || f.properties?.Description;
        if (name || desc) layer.bindPopup(`${name ? `<strong>${name}</strong>` : ""}${desc ? `<br>${desc}` : ""}`);
      }
    }).addTo(inst.lmap);
  }

  // Geo-referenced images (GroundOverlay — used by CAD exports)
  const boundsToFit = [];
  for (const ov of kmlGroundOverlays) {
    try {
      const ol = L.imageOverlay(ov.imageUrl, ov.bounds, { opacity: kmlOverlayOpacity, interactive: false, zIndex: 10, className: "kmz-overlay-img" }).addTo(inst.lmap);
      inst.kmlOverlays.push(ol);
      boundsToFit.push(ov.bounds);
      console.log("Added image overlay type=" + ov.type, "bounds:", ov.bounds);
    } catch (e) { console.warn("Ground overlay failed:", e); }
  }
  // Fit map to show the overlay if it has image overlays
  if (boundsToFit.length) {
    try {
      const allBounds = boundsToFit.reduce((acc, b) => acc.extend(b), L.latLngBounds(boundsToFit[0]));
      inst.lmap.fitBounds(allBounds, { padding: [10, 10] });
    } catch (e) { console.warn("fitBounds failed:", e); }
  }
  if (kmlGroundOverlays.length && kmlOpacityRow) kmlOpacityRow.style.display = "flex";
}

// Live-update opacity on every map's image overlays without a full reload.
function setKmlOverlayOpacity(v) {
  kmlOverlayOpacity = Math.max(0, Math.min(1, v));
  if (kmlOpacityVal) kmlOpacityVal.textContent = Math.round(kmlOverlayOpacity * 100);
  for (const [, inst] of leafletInstances) {
    (inst.kmlOverlays || []).forEach(l => { try { l.setOpacity(kmlOverlayOpacity); } catch {} });
  }
  try { localStorage.setItem("kml-opacity", String(kmlOverlayOpacity)); } catch {}
}

async function clearKmlOverlay() {
  for (const [, inst] of leafletInstances) {
    if (inst.kmlLayer) { inst.lmap.removeLayer(inst.kmlLayer); inst.kmlLayer = null; }
    (inst.kmlOverlays || []).forEach(l => inst.lmap.removeLayer(l));
    inst.kmlOverlays = [];
  }
  kmlGeoJSON = null;
  kmlGroundOverlays = [];
  kmlFileName.textContent = "";
  clearKmlButton.hidden = true;
  if (kmlOpacityRow) kmlOpacityRow.style.display = "none";
  kmlStatus.textContent = "Overlay removed.";
  try { const b = activeBridge(); if (b) { b.kml = null; await putBridgeRec(b); } } catch (e) { console.warn("overlay delete failed:", e); }
  try { localStorage.removeItem("kml-overlay"); localStorage.removeItem("kml-name"); localStorage.removeItem("kml-overlays-data"); } catch {}
}

// Load and render the active bridge's KMZ overlay (called when entering a bridge).
async function loadSavedKml() {
  // Reset any previously displayed overlay first.
  kmlGeoJSON = null;
  kmlGroundOverlays = [];
  kmlFileName.textContent = "";
  clearKmlButton.hidden = true;
  if (kmlOpacityRow) kmlOpacityRow.style.display = "none";
  try {
    const b = activeBridge();
    const saved = b ? b.kml : null;
    if (!saved || !saved.kmlText) { kmlStatus.textContent = "No overlay loaded. Load a KML or KMZ file to overlay CAD drawings on all maps."; return; }

    const name = saved.name || "saved overlay";
    kmlGroundOverlays = Array.isArray(saved.overlays) ? saved.overlays : [];
    // Strip GroundOverlay nodes so toGeoJSON does not convert them to polygons
    const kmlDoc = new DOMParser().parseFromString(saved.kmlText, "text/xml");
    for (const el of Array.from(kmlDoc.getElementsByTagName("GroundOverlay"))) {
      if (el.parentNode) el.parentNode.removeChild(el);
    }
    kmlGeoJSON = window.toGeoJSON ? toGeoJSON.kml(kmlDoc) : null;
    kmlFileName.textContent = name;
    clearKmlButton.hidden = false;
    const vc = kmlGeoJSON?.features?.length ?? 0;
    const ic = kmlGroundOverlays.length;
    if (ic && kmlOpacityRow) kmlOpacityRow.style.display = "flex";
    // Re-apply to any maps that are already on screen.
    for (const [, inst] of leafletInstances) applyKmlToMap(inst);
    kmlStatus.textContent = `Restored: ${vc} vector feature${vc !== 1 ? "s" : ""} + ${ic} image overlay${ic !== 1 ? "s" : ""} from ${name}.`;
  } catch (e) { console.warn("Failed to restore KML:", e); }
}



// ── Stereo calibration helpers ────────────────────────────────────────────────
function loadCalibration() {
  try {
    const c = JSON.parse(localStorage.getItem("stereo-calib") || "{}");
    if (calibPanel.querySelector) {
      document.getElementById("calFocal").value    = c.focal    ?? 700;
      document.getElementById("calBaseline").value = c.baseline ?? 60;
      document.getElementById("calCx").value       = c.cx       ?? 320;
      document.getElementById("calCy").value       = c.cy       ?? 240;
      document.getElementById("calMinDisp").value  = c.minDisp  ?? 0;
      document.getElementById("calNumDisp").value  = c.numDisp  ?? 8;
    }
  } catch {}
}

function saveCalibration() {
  const c = {
    focal:    parseFloat(document.getElementById("calFocal").value)    || 700,
    baseline: parseFloat(document.getElementById("calBaseline").value) || 60,
    cx:       parseFloat(document.getElementById("calCx").value)       || 320,
    cy:       parseFloat(document.getElementById("calCy").value)       || 240,
    minDisp:  parseInt(document.getElementById("calMinDisp").value)    || 0,
    numDisp:  parseInt(document.getElementById("calNumDisp").value)    || 8,
  };
  localStorage.setItem("stereo-calib", JSON.stringify(c));
  calibStatus.textContent = "Saved!";
  // Send updated calibration to depth server if connected
  if (depthWs && depthWs.readyState === WebSocket.OPEN) {
    depthWs.send(JSON.stringify({ type: "calibration", ...c }));
  }
  setTimeout(() => { calibStatus.textContent = ""; }, 2000);
}

function requestAutoCalibration() {
  if (!depthWs || depthWs.readyState !== WebSocket.OPEN) {
    calibStatus.textContent = "Enable Depth mode first so the depth server connects.";
    return;
  }
  autoCalibActive = true;
  thermalFrame.classList.add("calibrating");
  const instr = "Show a <strong>9\u00d76 inner-corner checkerboard</strong> (10\u00d77 squares) to <strong>BOTH</strong> lenses. Collecting 15 frames \u2014 tilt/move between shots.";
  updateDepthBanner(instr);
  calibStatus.textContent = "Auto-calibration ON \u2014 present checkerboard to both cameras.";
  depthWs.send(JSON.stringify({ type: "auto_calibrate", cols: 9, rows: 6 }));
}

// ── Depth Camera (WebSocket to depth_server.py) ───────────────────────────────
const DEPTH_WS_URL = "ws://localhost:8765";
let depthCanvas, depthCtx, depthAnimId;

// Reflect the refine-strength slider value (0.00..1.00) in its label.
function updateRefineLabel() {
  if (!refineStrength || !refineStrengthVal) return;
  refineStrengthVal.textContent = (refineStrength.value / 100).toFixed(2);
}

// Push the current refine strength to the depth server (applies to next capture).
function sendRefineStrength() {
  if (!depthWs || depthWs.readyState !== WebSocket.OPEN) return;
  const v = refineStrength ? refineStrength.value / 100 : 0.5;
  depthWs.send(JSON.stringify({ type: "refine_strength", value: v }));
}

// Reflect the depth-cutoff slider value (metres) in its label.
function updateCutoffLabel() {
  if (!depthCutoff || !depthCutoffVal) return;
  depthCutoffVal.textContent = parseFloat(depthCutoff.value).toFixed(2) + " m";
}

// Push the current depth cutoff (mm) to the depth server. Affects live map + mesh.
function sendDepthCutoff() {
  if (!depthWs || depthWs.readyState !== WebSocket.OPEN) return;
  const mm = (depthCutoff ? parseFloat(depthCutoff.value) : 1.0) * 1000;
  depthWs.send(JSON.stringify({ type: "depth_cutoff", mm }));
}

function initDepthCanvas() {
  if (depthCanvas) return;
  depthCanvas = document.getElementById("depthCanvas");
  depthCtx    = depthCanvas.getContext("2d");
}

async function startDepthMode() {
  initDepthCanvas();
  updateDepthUiVisibility(true);
  depthCanvas.hidden = false;
  thermalFrame.classList.add("depth-on");
  if (!thermalStream) {
    setStatus("Start the 2nd camera (stereo camera) first, then enable depth mode.");
    depthModeCheck.checked = false;
    return;
  }
  try {
    depthWs = new WebSocket(DEPTH_WS_URL);
    depthWs.binaryType = "arraybuffer";
    depthWs.onopen    = () => {
      setStatus("Depth server connected. Computing depth map…");
      // Send saved calibration immediately
      try {
        const c = JSON.parse(localStorage.getItem("stereo-calib") || "{}");
        if (Object.keys(c).length) depthWs.send(JSON.stringify({ type: "calibration", ...c }));
      } catch {}
      sendRefineStrength();
      sendDepthCutoff();
      sendDepthFrame();
    };
    depthWs.onmessage = (e) => handleDepthMessage(e.data);
    depthWs.onerror   = () => setStatus("⚠ Depth server not running. Double-click start_servers.bat, then re-check Depth mode.");
    depthWs.onclose   = () => {
      setStatus("⚠ Depth server disconnected — depth capture is OFF. Run start_servers.bat and re-check Depth mode.");
      // Make the checkbox reflect reality so the user knows depth is unavailable
      // (otherwise it stays checked but silently does nothing on capture).
      depthModeEnabled = false;
      depthModeCheck.checked = false;
      stopDepthMode();
    };
  } catch (e) { setStatus(`Depth WS error: ${e.message}`); }
}

function stopDepthMode() {
  updateDepthUiVisibility(!!thermalStream);
  if (depthAnimId) { cancelAnimationFrame(depthAnimId); depthAnimId = null; }
  if (depthWs) { depthWs.close(); depthWs = null; }
  if (depthCanvas) depthCanvas.hidden = true;
  autoCalibActive = false;
  thermalFrame.classList.remove("depth-on", "calibrating");
  if (depthBanner) depthBanner.hidden = true;
}

// Split-frame stereo: the IMP02G (and most USB stereo cameras) output
// a SINGLE stream with left and right frames side-by-side.
// We split the second camera frame down the middle.
// Preview uses a REQUEST->RESPONSE model: at most one preview frame is ever in
// flight. The next frame is only sent after the server's PNG reply arrives (see
// renderDepthMap). A free-running requestAnimationFrame loop floods the server's
// receive queue at ~60fps, so a later capture request sits behind a huge backlog
// and appears to "time out". Gating keeps the queue depth at 1.
let depthPreviewInFlight = false;

function sendDepthFrame() {
  if (!depthWs || depthWs.readyState !== WebSocket.OPEN) return;
  if (!thermalStream) return;
  if (depthPreviewInFlight) return;            // one frame max — wait for reply

  const fw = thermalPreview.videoWidth, fh = thermalPreview.videoHeight;
  if (!fw || !fh) { depthAnimId = requestAnimationFrame(sendDepthFrame); return; }

  // Split SBS frame in half — left eye and right eye
  const hw = Math.floor(fw / 2);
  const lc = document.createElement("canvas"); lc.width = hw; lc.height = fh;
  lc.getContext("2d").drawImage(thermalPreview, 0, 0, hw, fh, 0, 0, hw, fh);
  const rc = document.createElement("canvas"); rc.width = hw; rc.height = fh;
  rc.getContext("2d").drawImage(thermalPreview, hw, 0, hw, fh, 0, 0, hw, fh);

  lc.toBlob((lb) => {
    rc.toBlob((rb) => {
      if (!lb || !rb || !depthWs || depthWs.readyState !== WebSocket.OPEN) return;
      Promise.all([lb.arrayBuffer(), rb.arrayBuffer()]).then(([lbuf, rbuf]) => {
        if (!depthWs || depthWs.readyState !== WebSocket.OPEN) return;  // race guard
        depthPreviewInFlight = true;
        depthWs.send(packStereo(0, lbuf, rbuf));
      });
    }, "image/jpeg", 0.7);
  }, "image/jpeg", 0.7);
  // Next frame is scheduled by renderDepthMap once this one's reply is received.
}

// Banner + auto-calibration feedback state
let autoCalibActive = false;
const depthBanner = document.getElementById("depthBanner");

function updateDepthBanner(text) {
  if (!depthBanner) return;
  depthBanner.hidden = false;
  depthBanner.innerHTML = (autoCalibActive ? "\uD83C\uDFAF <strong>AUTO-CALIBRATION MODE</strong><br>" : "") + text;
}
function hideDepthBanner() {
  if (autoCalibActive) return;
  if (depthBanner) depthBanner.hidden = true;
}

// [mode(1)][left_size uint32 LE(4)][left jpeg][right jpeg]
function packStereo(mode, lbuf, rbuf) {
  const msg = new Uint8Array(1 + 4 + lbuf.byteLength + rbuf.byteLength);
  msg[0] = mode;
  new DataView(msg.buffer).setUint32(1, lbuf.byteLength, true);
  msg.set(new Uint8Array(lbuf), 5);
  msg.set(new Uint8Array(rbuf), 5 + lbuf.byteLength);
  return msg.buffer;
}

function base64ToBlob(b64, mime) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// Split the current side-by-side stereo frame into left/right JPEG buffers.
function grabStereoBuffers() {
  return new Promise((resolve, reject) => {
    if (!thermalStream) return reject(new Error("2nd (stereo) camera not started"));
    const fw = thermalPreview.videoWidth, fh = thermalPreview.videoHeight;
    if (!fw || !fh) return reject(new Error("no stereo frame yet"));
    const hw = Math.floor(fw / 2);
    const lc = document.createElement("canvas"); lc.width = hw; lc.height = fh;
    lc.getContext("2d").drawImage(thermalPreview, 0, 0, hw, fh, 0, 0, hw, fh);
    const rc = document.createElement("canvas"); rc.width = hw; rc.height = fh;
    rc.getContext("2d").drawImage(thermalPreview, hw, 0, hw, fh, 0, 0, hw, fh);
    lc.toBlob((lb) => rc.toBlob((rb) => {
      if (!lb || !rb) return reject(new Error("frame encode failed"));
      Promise.all([lb.arrayBuffer(), rb.arrayBuffer()]).then(([lbuf, rbuf]) => resolve([lbuf, rbuf]));
    }, "image/jpeg", 0.95), "image/jpeg", 0.95);
  });
}

let depthCaptureResolve = null, depthCaptureReject = null;
// Request a one-shot depth capture: returns {depthBlob, plyText, count}.
function captureDepthFrame() {
  return new Promise((resolve, reject) => {
    if (!depthWs || depthWs.readyState !== WebSocket.OPEN) return reject(new Error("depth server not connected"));
    // Pause the live preview stream: at full sensor resolution those frames are
    // large and would queue ahead of the heavy capture response, delaying (or
    // appearing to hang) the capture.
    if (depthAnimId) { cancelAnimationFrame(depthAnimId); depthAnimId = null; }
    depthPreviewInFlight = true;   // block preview loop while capturing
    const finish = (fn, arg) => {
      depthCaptureResolve = depthCaptureReject = null;
      // Resume live preview (clear the in-flight gate so the loop restarts).
      depthPreviewInFlight = false;
      if (depthWs && depthWs.readyState === WebSocket.OPEN) sendDepthFrame();
      fn(arg);
    };
    grabStereoBuffers().then(([lbuf, rbuf]) => {
      depthCaptureResolve = (v) => finish(resolve, v);
      depthCaptureReject  = (e) => finish(reject, e);
      depthWs.send(packStereo(1, lbuf, rbuf));
      setTimeout(() => {
        if (depthCaptureReject) depthCaptureReject(new Error("depth capture timed out"));
      }, 30000);
    }).catch(reject);
  });
}

// Dispatch server messages: JSON text (status/calib/capture) vs binary preview PNG.
function handleDepthMessage(data) {
  if (typeof data === "string") {
    let msg; try { msg = JSON.parse(data); } catch { return; }
    if (msg.type === "status") {
      calibStatus.textContent = msg.msg;
      updateDepthBanner(msg.msg);
    } else if (msg.type === "calib_result") {
      autoCalibActive = false;
      thermalFrame.classList.remove("calibrating");
      calibStatus.textContent = msg.msg;
      updateDepthBanner("\u2705 " + msg.msg);
      if (msg.calib) { try { localStorage.setItem("stereo-calib", JSON.stringify(msg.calib)); loadCalibration(); } catch {} }
      setTimeout(hideDepthBanner, 6000);
    } else if (msg.type === "capture_result") {
      if (depthCaptureResolve) {
        const depthBlob = base64ToBlob(msg.depthPng, "image/png");
        const plyText = atob(msg.ply);
        depthCaptureResolve({ depthBlob, plyText, count: msg.count });
        depthCaptureResolve = depthCaptureReject = null;
      }
    } else if (msg.type === "error") {
      setStatus("Depth error: " + msg.msg);
    }
    return;
  }
  renderDepthMap(data);
}

function renderDepthMap(data) {
  // A preview reply arrived — free the in-flight gate and queue the next frame.
  depthPreviewInFlight = false;
  // Receive PNG depth map as arraybuffer
  const blob = new Blob([data], { type: "image/png" });
  const url  = URL.createObjectURL(blob);
  const img  = new Image();
  img.onload = () => {
    if (!depthCanvas || depthCanvas.hidden) { URL.revokeObjectURL(url); return; }
    depthCanvas.width  = img.width;
    depthCanvas.height = img.height;
    depthCtx.drawImage(img, 0, 0);
    URL.revokeObjectURL(url);
  };
  img.src = url;
  // Schedule next preview frame (only if still connected + not capturing).
  if (depthWs && depthWs.readyState === WebSocket.OPEN && !depthCaptureResolve) {
    depthAnimId = requestAnimationFrame(sendDepthFrame);
  }
}

// ── Comment ───────────────────────────────────────────────────────────────────
function renderComment(container, record) {
  container.innerHTML = "";
  const hdr = makeAreaHeader("\ud83d\udcac Comment", record.comment ? "Edit" : "Add");
  container.append(hdr.div);
  container.append(record.comment
    ? (() => { const p = document.createElement("p"); p.className = "area-value"; p.textContent = record.comment; return p; })()
    : makeMuted("No comment yet"));
  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const ta = document.createElement("textarea");
    ta.className = "comment-edit-area"; ta.rows = 2; ta.value = record.comment ?? ""; ta.placeholder = "Type a comment\u2026";
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary");
    row.append(sv, cn); container.append(ta, row); ta.focus();
    sv.addEventListener("click", async () => {
      record.comment = ta.value.trim();
      await runTransaction("readwrite", (s) => s.put(record));
      renderComment(container, record);
      setStatus("Comment saved.");
    });
    cn.addEventListener("click", () => renderComment(container, record));
  });
}

// ── Tags ──────────────────────────────────────────────────────────────────────
function renderTagsArea(container, record) {
  container.innerHTML = "";
  const has = !tagsAreEmpty(record.tags);
  const hdr = makeAreaHeader("\ud83c\udff7 Tags", has ? "Edit" : "Add");
  container.append(hdr.div);
  container.append(has ? buildTagSummary(record.tags) : makeMuted("No tags yet"));
  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const working = normalizeTags(record.tags);
    const picker = buildTagPicker(working);
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary");
    row.append(sv, cn);
    container.append(picker, row);
    sv.addEventListener("click", async () => {
      record.tags = working;
      await runTransaction("readwrite", (s) => s.put(record));
      renderTagsArea(container, record);
      setStatus("Tags saved.");
    });
    cn.addEventListener("click", () => renderTagsArea(container, record));
  });
}

function navSummaryLine(record, overrides = {}) {
  const loc = overrides.location ?? record.location ?? null;
  const heading = overrides.heading ?? record.heading ?? null;
  const attitude = overrides.attitude ?? record.attitude ?? null;
  const parts = [];
  if (loc && isFinite(loc.lat) && isFinite(loc.lng)) parts.push(`📍 ${loc.lat.toFixed(5)}, ${loc.lng.toFixed(5)}`);
  if (heading != null && isFinite(heading)) parts.push(`🧭 ${Math.round(heading)}° ${bearingLabel(heading)}`);
  if (attitude != null && isFinite(attitude)) parts.push(`📐 ${attitudeLabel(attitude)}`);
  return parts.length ? parts.join(" · ") : "📍 — · 🧭 — · 📐 —";
}

function renderNavArea(container, record, overrides = {}) {
  if (!container) return;
  container.innerHTML = "";
  const has = !!(record.location || (record.heading != null) || (record.attitude != null && isFinite(record.attitude)));
  const hdr = makeAreaHeader("📍/🧭/📐 Navigation", has ? "Edit" : "Add");
  const p = document.createElement("p"); p.className = "area-value photo-nav-line";
  p.textContent = navSummaryLine(record, overrides);
  container.append(hdr.div, p);
  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const latI = makeInput("number", record.location?.lat ?? "", "Latitude"); latI.step = "0.00001";
    const lngI = makeInput("number", record.location?.lng ?? "", "Longitude"); lngI.step = "0.00001";
    const accI = makeInput("number", record.location?.accuracy ?? "", "Accuracy (m)");
    const degI = makeInput("number", record.heading ?? "", "Heading 0–360");
    const sel = document.createElement("select");
    sel.className = "meta-input";
    for (const m of ["environment", "user"]) {
      const o = document.createElement("option"); o.value = m; o.textContent = facingLabel(m); if ((record.facing || "environment") === m) o.selected = true;
      sel.append(o);
    }
    const attI = makeInput("number", record.attitude ?? "", "-90 (down) to 90 (up)"); attI.min = -90; attI.max = 90;
    const gpsBtn = makeButton("Re-acquire GPS", "secondary");
    const hdgBtn = makeButton("Re-acquire compass", "secondary");
    const attBtn = makeButton("Re-read tilt", "secondary");
    const sensorRow = document.createElement("div"); sensorRow.className = "edit-row"; sensorRow.append(gpsBtn, hdgBtn, attBtn);
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary"), cl = makeButton("Clear", "danger");
    row.append(sv, cn, cl);
    const sp = makeEditStatus();
    container.append(
      makeLabeledField("Latitude", latI),
      makeLabeledField("Longitude", lngI),
      makeLabeledField("Accuracy (m)", accI),
      makeLabeledField("Heading (0–360)", degI),
      makeLabeledField("Camera", sel),
      makeLabeledField("Attitude (− down, + up)", attI),
      sensorRow, row, sp
    );

    gpsBtn.addEventListener("click", () => {
      sp.textContent = "Reading GPS…";
      acquireLocationNow(
        (loc) => { latI.value = loc.lat; lngI.value = loc.lng; accI.value = loc.accuracy; sp.textContent = "Got GPS — press Save."; },
        (e) => { sp.textContent = `GPS failed: ${e.message || e}`; }
      );
    });
    hdgBtn.addEventListener("click", () => {
      sp.textContent = "Reading compass…";
      acquireHeadingOnce(
        (deg) => { degI.value = deg; sp.textContent = "Got heading — press Save."; },
        (msg) => { sp.textContent = `Compass failed: ${msg}`; }
      );
    });
    attBtn.addEventListener("click", () => {
      sp.textContent = "Reading tilt…";
      acquireOrientationOnce(
        (o) => { if (o.attitude != null) { attI.value = o.attitude; sp.textContent = "Got attitude — press Save."; } else sp.textContent = "Tilt not available."; },
        (msg) => { sp.textContent = `Tilt failed: ${msg}`; }
      );
    });
    sv.addEventListener("click", async () => {
      const lat = parseFloat(latI.value), lng = parseFloat(lngI.value), acc = parseFloat(accI.value);
      record.location = (isFinite(lat) && isFinite(lng)) ? { lat, lng, accuracy: isFinite(acc) ? Math.max(0, Math.round(acc)) : 0 } : null;
      const h = parseInt(degI.value);
      record.heading = isNaN(h) ? null : (((h % 360) + 360) % 360);
      record.facing = record.heading == null ? null : (sel.value || null);
      const a = parseInt(attI.value);
      record.attitude = isNaN(a) ? null : Math.max(-90, Math.min(90, a));
      await runTransaction("readwrite", (s) => s.put(record));
      syncMapToRecord(record.id, record);
      renderNavArea(container, record);
      setStatus("Location / direction / attitude updated.");
    });
    cl.addEventListener("click", async () => {
      record.location = null; record.heading = null; record.facing = null; record.attitude = null;
      await runTransaction("readwrite", (s) => s.put(record));
      syncMapToRecord(record.id, record);
      renderNavArea(container, record);
      setStatus("Location / direction / attitude cleared.");
    });
    cn.addEventListener("click", () => renderNavArea(container, record));
  });
}

// ── Location area ─────────────────────────────────────────────────────────────
function renderLocationArea(container, record) {
  if (!container) return;
  container.innerHTML = "";
  const hdr = makeAreaHeader("\ud83d\udccd Location", record.location ? "Edit" : "Add");
  container.append(hdr.div);
  if (record.location) {
    const { lat, lng, accuracy } = record.location;
    const p = document.createElement("p"); p.className = "area-value";
    p.innerHTML = `<a href="https://www.google.com/maps?q=${lat},${lng}" target="_blank" rel="noopener">${lat.toFixed(5)}, ${lng.toFixed(5)}</a>${accuracy ? ` (\u00b1${accuracy}m)` : ""}`;
    container.append(p);
  } else { container.append(makeMuted("No location recorded")); }

  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const latI = makeInput("number", record.location?.lat ?? "", "e.g. 41.87654");
    const lngI = makeInput("number", record.location?.lng ?? "", "e.g. -87.62345");
    const accI = makeInput("number", record.location?.accuracy ?? "", "e.g. 10");
    latI.step = lngI.step = "0.00001";
    const reBtn = makeButton("Re-acquire GPS", "secondary");
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary"), cl = makeButton("Clear", "danger");
    row.append(sv, cn, cl);
    const sp = makeEditStatus();
    container.append(makeLabeledField("Latitude", latI), makeLabeledField("Longitude", lngI), makeLabeledField("Accuracy (m)", accI), reBtn, row, sp);

    reBtn.addEventListener("click", () => {
      sp.textContent = "Acquiring GPS\u2026";
      acquireLocationNow(
        (loc) => { latI.value = loc.lat; lngI.value = loc.lng; accI.value = loc.accuracy; sp.textContent = "GPS acquired \u2014 press Save."; },
        (err) => { sp.textContent = `Failed: ${err.message}`; }
      );
    });

    sv.addEventListener("click", async () => {
      const lat = parseFloat(latI.value), lng = parseFloat(lngI.value);
      if (isNaN(lat) || isNaN(lng)) { sp.textContent = "Enter valid coordinates."; return; }
      record.location = { lat, lng, accuracy: parseInt(accI.value) || 0 };
      await runTransaction("readwrite", (s) => s.put(record));
      const card = container.closest(".photo-card");
      const mapContainer = card.querySelector(".photo-map-container");
      if (leafletInstances.has(record.id)) {
        syncMapToRecord(record.id, record);
      } else {
        mapContainer.hidden = false;
        const hint = card.querySelector(".map-hint"); if (hint) hint.hidden = false;
        const inst = initMap(mapContainer, record);
        leafletInstances.set(record.id, inst);
        if (kmlGeoJSON) applyKmlToMap(inst);
      }
      renderLocationArea(container, record); setStatus("Location updated.");
    });
    cl.addEventListener("click", async () => {
      record.location = null; await runTransaction("readwrite", (s) => s.put(record));
      const inst = leafletInstances.get(record.id);
      if (inst) { inst.lmap.remove(); leafletInstances.delete(record.id); }
      const card = container.closest(".photo-card");
      card.querySelector(".photo-map-container").hidden = true;
      const hint = card.querySelector(".map-hint"); if (hint) hint.hidden = true;
      renderLocationArea(container, record); setStatus("Location cleared.");
    });
    cn.addEventListener("click", () => renderLocationArea(container, record));
  });
}

// ── Heading area ──────────────────────────────────────────────────────────────
function renderHeadingArea(container, record) {
  container.innerHTML = "";
  const hdr = makeAreaHeader("\ud83e\uddad Direction", record.heading != null ? "Edit" : "Add");
  container.append(hdr.div);
  if (record.heading != null) {
    const p = document.createElement("p"); p.className = "area-value";
    p.textContent = `${record.heading}\u00b0 ${bearingLabel(record.heading)}${record.facing ? ` \u00b7 ${facingLabel(record.facing)} camera` : ""}`;
    container.append(p);
  } else { container.append(makeMuted("No direction recorded")); }

  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const degI = makeInput("number", record.heading ?? "", "0\u2013360"); degI.min = 0; degI.max = 360;
    const sel = document.createElement("select"); sel.className = "meta-input";
    [["", "Unknown"], ["environment", "Rear camera"], ["user", "Front camera"]].forEach(([v, t]) => {
      const o = document.createElement("option"); o.value = v; o.textContent = t;
      if ((record.facing ?? "") === v) o.selected = true; sel.append(o);
    });
    const reBtn = makeButton("Re-acquire compass", "secondary");
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary"), cl = makeButton("Clear", "danger");
    row.append(sv, cn, cl);
    const sp = makeEditStatus();
    container.append(makeLabeledField("Degrees (0\u2013360)", degI), makeLabeledField("Camera", sel), reBtn, row, sp);

    reBtn.addEventListener("click", () => {
      sp.textContent = "Reading compass\u2026";
      acquireHeadingOnce(
        (deg) => { degI.value = deg; sp.textContent = `Got ${deg}\u00b0 \u2014 press Save.`; },
        (msg) => { sp.textContent = `Failed: ${msg}`; }
      );
    });

    sv.addEventListener("click", async () => {
      const deg = parseInt(degI.value);
      if (isNaN(deg)) { sp.textContent = "Enter a valid heading."; return; }
      record.heading = ((deg % 360) + 360) % 360; record.facing = sel.value || null;
      await runTransaction("readwrite", (s) => s.put(record));
      syncMapToRecord(record.id, record);
      renderHeadingArea(container, record); setStatus("Direction updated.");
    });
    cl.addEventListener("click", async () => {
      record.heading = null; record.facing = null;
      await runTransaction("readwrite", (s) => s.put(record));
      syncMapToRecord(record.id, record);
      renderHeadingArea(container, record); setStatus("Direction cleared.");
    });
    cn.addEventListener("click", () => renderHeadingArea(container, record));
  });
}

function renderAttitudeArea(container, record) {
  container.innerHTML = "";
  const has = record.attitude != null && isFinite(record.attitude);
  const hdr = makeAreaHeader("\ud83d\udcd0 Attitude (angle from horizontal)", has ? "Edit" : "Add");
  container.append(hdr.div);
  if (has) {
    const p = document.createElement("p"); p.className = "area-value";
    p.textContent = `${record.attitude}\u00b0 \u00b7 ${attitudeLabel(record.attitude)}`;
    container.append(p);
  } else { container.append(makeMuted("No attitude recorded")); }

  hdr.btn.addEventListener("click", () => {
    container.innerHTML = "";
    const degI = makeInput("number", record.attitude ?? "", "-90 (down) to 90 (up)"); degI.min = -90; degI.max = 90;
    const reBtn = makeButton("Re-read tilt sensor", "secondary");
    const row = document.createElement("div"); row.className = "edit-row";
    const sv = makeButton("Save", ""), cn = makeButton("Cancel", "secondary"), cl = makeButton("Clear", "danger");
    row.append(sv, cn, cl);
    const sp = makeEditStatus();
    container.append(makeLabeledField("Degrees (\u2212 down, + up)", degI), reBtn, row, sp);

    reBtn.addEventListener("click", () => {
      sp.textContent = "Reading tilt\u2026";
      acquireOrientationOnce(
        (o) => { if (o.attitude != null) { degI.value = o.attitude; sp.textContent = `Got ${attitudeLabel(o.attitude)} \u2014 press Save.`; } else sp.textContent = "Tilt not available."; },
        (msg) => { sp.textContent = `Failed: ${msg}`; }
      );
    });
    sv.addEventListener("click", async () => {
      const a = parseInt(degI.value);
      if (isNaN(a)) { sp.textContent = "Enter a valid angle."; return; }
      record.attitude = Math.max(-90, Math.min(90, a));
      await runTransaction("readwrite", (s) => s.put(record));
      renderAttitudeArea(container, record); setStatus("Attitude updated.");
    });
    cl.addEventListener("click", async () => {
      record.attitude = null;
      await runTransaction("readwrite", (s) => s.put(record));
      renderAttitudeArea(container, record); setStatus("Attitude cleared.");
    });
    cn.addEventListener("click", () => renderAttitudeArea(container, record));
  });
}

// ── DOM helpers ───────────────────────────────────────────────────────────────
function makeButton(text, cls = "") { const b = document.createElement("button"); b.type = "button"; b.className = cls; b.textContent = text; return b; }
function makeInput(type, value, placeholder) { const i = document.createElement("input"); i.type = type; i.className = "meta-input"; i.value = value; i.placeholder = placeholder; return i; }
function makeLabeledField(label, el) { const w = document.createElement("div"); w.className = "labeled-field"; const l = document.createElement("label"); l.className = "field-label"; l.textContent = label; w.append(l, el); return w; }
function makeAreaHeader(labelText, btnText) { const d = document.createElement("div"); d.className = "area-header"; const s = document.createElement("span"); s.className = "area-label"; s.textContent = labelText; const b = makeButton(btnText, "secondary edit-btn"); d.append(s, b); return { div: d, btn: b }; }
function makeMuted(text) { const p = document.createElement("p"); p.className = "area-value muted"; p.textContent = text; return p; }
function makeEditStatus() { const p = document.createElement("p"); p.className = "edit-status"; return p; }
function setStatus(msg) { statusMessage.textContent = msg; }
function revealFallback(msg) { cameraFallback.hidden = false; captureButton.disabled = true; switchCameraButton.disabled = true; setStatus(msg); }

// ── Utilities ─────────────────────────────────────────────────────────────────
function createId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  if (globalThis.crypto?.getRandomValues) { const v = new Uint32Array(4); globalThis.crypto.getRandomValues(v); return Array.from(v, (n) => n.toString(16).padStart(8, "0")).join(""); }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
function canvasToBlob(canvas, type = "image/jpeg", quality = 0.92) {
  return new Promise((res, rej) => canvas.toBlob((b) => b ? res(b) : rej(new Error("Could not capture image.")), type, quality));
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
function runTransaction(mode, action) {
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE_NAME, mode), req = action(tx.objectStore(STORE_NAME));
    tx.addEventListener("complete", () => res(req && "result" in req ? req.result : undefined));
    tx.addEventListener("error",    () => rej(tx.error));
    tx.addEventListener("abort",    () => rej(tx.error ?? new Error("Transaction aborted.")));
  });
}
// Generic key/value access to the "meta" store (used for the shared CAD overlay).
function metaGet(key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE, "readonly");
    const req = tx.objectStore(META_STORE).get(key);
    req.addEventListener("success", () => res(req.result ? req.result.value : null));
    req.addEventListener("error",   () => rej(req.error));
  });
}
function metaPut(key, value) {
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).put({ key, value });
    tx.addEventListener("complete", () => res());
    tx.addEventListener("error",    () => rej(tx.error));
    tx.addEventListener("abort",    () => rej(tx.error ?? new Error("Transaction aborted.")));
  });
}
function metaDelete(key) {
  return new Promise((res, rej) => {
    const tx = db.transaction(META_STORE, "readwrite");
    tx.objectStore(META_STORE).delete(key);
    tx.addEventListener("complete", () => res());
    tx.addEventListener("error",    () => rej(tx.error));
    tx.addEventListener("abort",    () => rej(tx.error ?? new Error("Transaction aborted.")));
  });
}
// ── Bridges store (project/location layer) ────────────────────────────────────
function bridgeTx(mode, action) {
  return new Promise((res, rej) => {
    const tx = db.transaction(BRIDGE_STORE, mode), req = action(tx.objectStore(BRIDGE_STORE));
    tx.addEventListener("complete", () => res(req && "result" in req ? req.result : undefined));
    tx.addEventListener("error",    () => rej(tx.error));
    tx.addEventListener("abort",    () => rej(tx.error ?? new Error("Transaction aborted.")));
  });
}
function getAllBridges()   { return bridgeTx("readonly",  (s) => s.getAll()); }
function getBridgeRec(id)  { return bridgeTx("readonly",  (s) => s.get(id)); }
function putBridgeRec(b)   { return bridgeTx("readwrite", (s) => s.put(b)); }
function deleteBridgeRec(id){ return bridgeTx("readwrite", (s) => s.delete(id)); }
async function registerServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  try { await navigator.serviceWorker.register("sw.js"); } catch (e) { console.warn("SW:", e); }
}
