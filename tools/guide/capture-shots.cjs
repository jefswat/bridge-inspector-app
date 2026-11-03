// Captures the UI screenshots the field guide embeds. Run a static server on
// the repo root first, then:  node tools/guide/capture-shots.js [port]
//
// Requires playwright. Set PLAYWRIGHT_MODULE if it is not resolvable from here.
const path = require('path');
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);
const DIR = path.join(__dirname, 'shots') + path.sep;
const PORT = process.argv[2] || '8099';
require('fs').mkdirSync(DIR, { recursive: true });
(async () => {
  const b = await chromium.launch();
  const c = await b.newContext({ serviceWorkers:'block', viewport:{width:1100,height:1000}, deviceScaleFactor:2 });
  const p = await c.newPage();
  const errs=[]; p.on('pageerror',e=>errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/index.html`,{waitUntil:'domcontentloaded'});
  await p.waitForTimeout(2000);

  const shot = async (sel, name, prep) => {
    if (prep) await p.evaluate(prep);
    await p.waitForTimeout(200);
    const el = await p.$(sel);
    if (!el) { console.log('MISSING', name, sel); return; }
    const box = await el.boundingBox();
    if (!box || box.width < 5 || box.height < 5) { console.log('EMPTY', name, JSON.stringify(box)); return; }
    await el.screenshot({ path: DIR + name + '.png' });
    console.log('ok', name, Math.round(box.width)+'x'+Math.round(box.height));
  };
  const hide = (sel) => p.evaluate((s)=>{const e=document.querySelector(s); if(e) e.hidden=true;}, sel);

  // ── 1. Clear cache card in Settings ────────────────────────────────────────
  await shot('#settingsModal .settings-body section.card:nth-of-type(1)', '01-clear-cache', () => {
    const m=document.getElementById('settingsModal'); m.hidden=false; m.style.display='flex';
    document.querySelectorAll('#settingsModal button[disabled]').forEach(x=>x.disabled=false);
  });
  await hide('#settingsModal');

  // ── 2. IFC upload controls in the 3D viewer ───────────────────────────────
  await shot('.ifc-viewer-controls', '02-ifc-upload', () => {
    const m=document.getElementById('ifcViewerModal'); m.hidden=false; m.style.display='flex';
    document.querySelectorAll('#ifcViewerModal button[disabled]').forEach(x=>x.disabled=false);
    const s=document.getElementById('ifcFileStatus'); if(s) s.textContent='Loaded: InfraBridge-Raleigh.ifc';
  });

  // ── 3. Element tagging row + selection status ─────────────────────────────
  await shot('#ifcViewerModal .actions-row:last-of-type', '03-tagging-buttons', () => {
    const s=document.getElementById('ifcSelectedElement');
    if(s) s.textContent='Tagged: 2 elements — click elements to add/remove selection';
  });
  await shot('#ifcSelectedElement', '03b-selected-element');
  await hide('#ifcViewerModal');

  // ── 4. AR entry button ────────────────────────────────────────────────────
  await shot('.gallery-actions-row', '04-ar-button', () => {
    document.getElementById('appView').hidden=false;
    document.querySelectorAll('button[disabled]').forEach(x=>x.disabled=false);
  });

  // ── AR view. Nothing renders behind the HUD in a headless harness, so the
  //    panels are shot one at a time with the others hidden. ────────────────
  await p.evaluate(() => {
    const m=document.getElementById('arViewModal'); m.hidden=false; m.style.display='flex';
    document.getElementById('arLocationText').textContent='35.872061, -78.674703  ±4 m';
    document.getElementById('arAttitudeText').textContent='Eye 126.0 m (NAVD88) · heading 118° ESE · pitch -2°';
    document.getElementById('arStatusMessage').textContent='Model loaded: InfraBridge-Raleigh.ifc — 1,284 elements';
    const b=document.querySelector('.ar-view-body'); if(b) b.style.background='#0b0f16';
  });
  const only = async (keep) => p.evaluate((k) => {
    ['.ar-hud-panel','.ar-move-controls','.ar-minimap-wrap','.ar-location-display','#arStatusMessage','.ar-view-header']
      .forEach(s=>document.querySelectorAll(s).forEach(e=>{e.style.visibility = k.includes(s) ? 'visible' : 'hidden';}));
  }, keep);

  await only(['.ar-view-header']);   await shot('.ar-view-header', '05-ar-header');
  await only(['.ar-hud-panel']);     await shot('.ar-hud-panel', '06-ar-hud');
                                     await shot('.ar-hud-panel .ar-opacity-controls:nth-of-type(3)', '06b-ground-datum');
                                     await shot('.ar-hud-panel .ar-opacity-controls:nth-of-type(2)', '06c-fov-row', () => {
                                       const v=document.getElementById('arFovValue');
                                       if(v) v.textContent='78.5\u00b0 \u00b7 measured (WebXR)';
                                     });
  await only(['.ar-move-controls']); await shot('.ar-move-controls', '07-ar-controls');
  await only(['.ar-location-display']); await shot('.ar-location-display', '07b-ar-location');
  await hide('#arViewModal');

  // ── 8. Capture toolbar with the live geo + heading readout ────────────────
  await shot('.actions-row', '08-capture-row', () => {
    document.getElementById('geoText').textContent='Location: 35.87206, -78.67470 (±4m)';
    document.getElementById('headingText').textContent='Direction: 118° ESE · Attitude: level';
  });

  // ── 9. Post-capture tagging offer ─────────────────────────────────────────
  await shot('#postCaptureActions', '09-post-capture', () => {
    const bar=document.getElementById('postCaptureActions'); bar.hidden=false; bar.style.display='flex';
  });

  // ── 10. AprilTag live detection status over the camera preview ────────────
  await shot('#apriltagPreviewStatus', '10-apriltag', () => {
    const m=document.getElementById('captureModal'); m.hidden=false; m.style.display='flex';
    const s=document.getElementById('apriltagPreviewStatus');
    if(s) s.textContent='AprilTag 36h11: id 7';
  });

  // ── 11. Pier scan HUD ─────────────────────────────────────────────────────
  await shot('#scanHud', '11-scan-hud', () => {
    const h=document.getElementById('scanHud');
    h.hidden=false; h.removeAttribute('hidden'); h.style.display='block';
    for (let n=h.parentElement; n && n!==document.body; n=n.parentElement) {
      if (n.hidden) n.hidden=false;
      if (getComputedStyle(n).display==='none') n.style.display='block';
    }
    const g=document.getElementById('scanGuide'); if(g) g.textContent='Good overlap — keep moving slowly';
    const c1=document.getElementById('scanCount'); if(c1) c1.textContent='42 frames';
    const f=document.getElementById('scanFocus'); if(f) f.textContent='Sharpness: good';
    const o=document.getElementById('scanOverlapPct'); if(o) o.textContent='Move: 68%';
    const bar=document.getElementById('scanOverlapBar'); if(bar){bar.style.width='68%';bar.classList.add('ready');}
  });
  await hide('#captureModal');

  // ── 12. Start scan, on the main toolbar ──────────────────────────────────
  await shot('.actions-row', '12-scan-start');

  // ── 13. Photo annotator toolbar: AprilTag scale + measurement tools ───────
  await p.evaluate(async () => {
    const cv=document.createElement('canvas'); cv.width=8; cv.height=8;
    const blob=await new Promise(r=>cv.toBlob(r,'image/png'));
    openPhotoAnnotator({ id:'demo', blob, aprilTags:[7] });
  });
  await p.waitForTimeout(400);
  await shot('#photoAnnotatorModal .sketch-toolbar', '13-annot-toolbar', () => {
    const i=document.getElementById('annotScaleInfo');
    if(i) i.textContent='Scale: 12.480 px/in (from tag)';
  });
  await p.evaluate(()=>{const m=document.getElementById('photoAnnotatorModal'); if(m) m.remove();});

  // ── 14. Photo card actions: map/direction + 3D view per photo ─────────────
  await shot('#guideCard .photo-actions', '14-photo-actions', () => {
    const t=document.getElementById('photoCardTemplate');
    const node=t.content.cloneNode(true);
    const wrap=document.createElement('div'); wrap.id='guideCard';
    wrap.appendChild(node);
    document.getElementById('photoGrid').hidden=false;
    document.getElementById('photoGrid').appendChild(wrap);
  });
  await shot('#guideCard .card-body', '14b-photo-meta', () => {
    const w=document.getElementById('guideCard');
    w.querySelector('.card-time').textContent='12 Aug 2026, 10:41';
    w.querySelector('.photo-comment-area').textContent='Pier 3 west face — map crack at construction joint';
    w.querySelector('.photo-apriltag-area').textContent='AprilTag 36h11: id 7';
    w.querySelector('.photo-tags-area').textContent='Tagged elements: Pier 3 Column, Pier 3 Cap';
  });


  // ── 15. Tag picker: the taxonomy the report sorts and captions from ───────
  await shot('#guideTags', '15-tag-picker', () => {
    const tags = { general:['Elevation'], structure:['Substructure'],
                   issues:['Spalling','Cracking'], directions:['N'] };
    const w = document.createElement('div');
    w.id = 'guideTags';
    w.style.cssText = 'background:var(--surface);padding:12px;max-width:760px;';
    w.appendChild(buildTagPicker(tags));
    document.body.appendChild(w);
  });
  await p.evaluate(()=>{const e=document.getElementById('guideTags'); if(e) e.remove();});

  // ── 16. Report toolbar ────────────────────────────────────────────────────
  await shot('.actions-row[style*="flex-end"]', '16-report-toolbar', () => {
    document.querySelectorAll('#wordReportButton,#taggedElementsButton,#exportIfcButton,#clearAllButton')
      .forEach(b=>{b.disabled=false;});
  });

  // ── 17/18. Report preview + ordering modal ────────────────────────────────
  await p.evaluate(async () => {
    // openReportModal needs records with real blobs; paint a few placeholders.
    const mk = async (i, tags, comment) => {
      const cv=document.createElement('canvas'); cv.width=240; cv.height=180;
      const x=cv.getContext('2d');
      x.fillStyle=['#7f8c9b','#8b7d6b','#6b7f8b'][i%3]; x.fillRect(0,0,240,180);
      x.fillStyle='#e8edf3'; x.font='bold 18px sans-serif';
      x.fillText('Photo '+(i+1), 14, 100);
      const blob = await new Promise(r=>cv.toBlob(r,'image/jpeg',0.8));
      return { id:'demo'+i, bridgeId:'demo', blob, tags, comment,
               createdAt:new Date(Date.UTC(2026,7,12,14,i)).toISOString(),
               location:{lat:35.87206,lng:-78.67470}, heading:118 };
    };
    const empty = () => ({general:[],structure:[],issues:[],directions:[]});
    const recs = [
      await mk(0, {...empty(), general:['Elevation'], directions:['N']}, ''),
      await mk(1, {...empty(), general:['Approach'], directions:['SW']}, ''),
      await mk(2, {...empty(), issues:['Spalling'], structure:['Substructure']},
               'Pier 3 west face - spall with exposed rebar, approx 300 x 200 mm'),
      await mk(3, empty(), 'Deck drain outlet'),
    ];
    openReportModal(recs);
  });
  await p.waitForTimeout(600);
  await shot('#reportModal .report-modal-sub', '17-report-options');
  await shot('#reportModal .report-modal-body', '18-report-sections');
  await p.evaluate(()=>{const m=document.getElementById('reportModal'); if(m) m.remove();});

  // ── 19-21. Base / Rover transfer ──────────────────────────────────────────
  const showTransfer = () => p.evaluate(() => {
    const c=document.getElementById('peerTransferCard');
    c.hidden=false; c.style.display='flex';
    document.querySelectorAll('#peerTransferCard button[disabled]').forEach(b=>{b.disabled=false;});
  });
  await showTransfer();
  await shot('#peerTransferCard .scan-panel-head', '19-transfer-role');
  await shot('#peerTransferCard .peer-transfer-actions', '20-transfer-steps');
  // The send row is hidden unless this browser is the rover.
  await shot('#peerSendRow', '21-transfer-send', () => {
    const r=document.getElementById('peerRoleSelect'); if(r) r.value='rover';
    const row=document.getElementById('peerSendRow'); if(row) row.hidden=false;
    const a=document.getElementById('peerAutoSendCheck'); if(a) a.checked=true;
  });
  await shot('#peerConnState', '22-transfer-state', () => {
    const s=document.getElementById('peerConnState');
    if(s) s.textContent='Transfer link: connected (base)';
  });
  await hide('#peerTransferCard');

  // ── 23. Condition rating + inspection property sets in the 3D viewer ──────
  await p.evaluate(() => {
    const m=document.getElementById('ifcViewerModal'); m.hidden=false; m.style.display='flex';
    document.querySelectorAll('#ifcViewerModal button[disabled]').forEach(b=>{b.disabled=false;});
    const s=document.getElementById('ifcConditionSummary');
    if(s) s.textContent='Condition rating 5 (poor) on 2 elements.';
    const r=document.getElementById('ifcConditionRatingInput'); if(r) r.value='5';
    const l=document.getElementById('ifcConditionColorLegend'); if(l) l.hidden=false;
  });
  await shot('#ifcViewerModeBar', '23-condition-view');
  await shot('#ifcViewerPsets', '24-psets');
  await hide('#ifcViewerModal');


  // ── 25-28. Bridges overview, banner, NBI import, Bridges Near Me ──────────
  await shot('.bridges-head-actions', '25-bridges-actions', () => {
    document.getElementById('bridgesView').hidden = false;
  });
  await shot('.bridge-banner', '26-bridge-banner', () => {
    document.getElementById('bridgesView').hidden = true;
    document.getElementById('appView').hidden = false;
    document.getElementById('bridgeBannerTitle').textContent = 'Main St over Neuse River';
    document.getElementById('bridgeBannerDesc').textContent =
      'Wake County, NC · Built 1974 · NBI 910079';
  });

  await p.evaluate(() => { openNbiImport(); });
  await p.waitForTimeout(900);
  await shot('#nbiImport .bridge-dialog', '27-nbi-import', () => {
    const t=document.getElementById('nbiNumbers'); if(t) t.value='910079\n883039900';
  });
  await p.evaluate(()=>{const m=document.getElementById('nbiImport'); if(m) m.remove();});

  await p.evaluate(() => { void openNbiNearMe(); });
  await p.waitForTimeout(900);
  await shot('#nbiNearMe .nbi-near-controls', '28-nbi-near');
  await p.evaluate(()=>{const m=document.getElementById('nbiNearMe'); if(m) m.remove();});

  // ── 29. Tagged elements index ─────────────────────────────────────────────
  await p.evaluate(() => { void openTaggedElementsModal(); });
  await p.waitForTimeout(600);
  await shot('.tagged-el-list, .ifc-tagged-empty', '29-tagged-elements');
  await p.evaluate(()=>{
    document.querySelectorAll('.settings-modal').forEach(m=>{
      if (m.querySelector('.tagged-el-list, .ifc-tagged-empty')) m.remove();
    });
  });

  // ── 30. Automatic crack detection ─────────────────────────────────────────
  await p.evaluate(async () => {
    const cv=document.createElement('canvas'); cv.width=420; cv.height=300;
    const x=cv.getContext('2d');
    x.fillStyle='#9aa3ad'; x.fillRect(0,0,420,300);
    // A few dark lines so the detector has something to find.
    x.strokeStyle='#2b2f35'; x.lineWidth=2;
    x.beginPath(); x.moveTo(30,40); x.lineTo(180,150); x.lineTo(250,120); x.stroke();
    x.beginPath(); x.moveTo(60,250); x.lineTo(300,210); x.stroke();
    const blob=await new Promise(r=>cv.toBlob(r,'image/jpeg',0.9));
    const t=document.getElementById('photoCardTemplate');
    const frag=t.content.cloneNode(true);
    const wrap=document.createElement('div'); wrap.id='crackCard';
    wrap.appendChild(frag);
    const grid=document.getElementById('photoGrid');
    grid.hidden=false; grid.appendChild(wrap);
    const card=wrap.querySelector('.photo-card');
    card.querySelector('.main-img').src=URL.createObjectURL(blob);
    attachCrackTool(card, { id:'crackdemo', blob });
    const btn=[...card.querySelectorAll('.photo-actions button')]
      .find(b=>b.textContent.includes('Cracks'));
    if (btn) btn.click();
  });
  await p.waitForTimeout(2500);
  await shot('#crackCard .crack-bar', '30-crack-bar');
  await p.evaluate(()=>{const e=document.getElementById('crackCard'); if(e) e.remove();});

  // ── 31-34. Settings: camera, depth, calibration, CAD overlay, debug ───────
  const settings = () => p.evaluate(() => {
    const m=document.getElementById('settingsModal'); m.hidden=false; m.style.display='flex';
    document.querySelectorAll('#settingsModal button[disabled]').forEach(b=>{b.disabled=false;});
    ['cameraSelector','mainCameraSelector','depthModeRow','refineRow','cutoffRow','calibPanel',
     'startThermalButton','stopThermalButton','kmlOpacityRow','clearKmlButton']
      .forEach(id=>{const e=document.getElementById(id); if(e){e.hidden=false;
        if (e.style.display==='none') e.style.display='';}});
    const c=document.getElementById('depthModeCheck'); if(c) c.checked=true;
    const k=document.getElementById('kmlFileName'); if(k) k.textContent='deck-plan.kmz';
    const ks=document.getElementById('kmlStatus');
    if(ks) ks.textContent='Overlay loaded: 1 ground overlay, 34 paths. Shown on every map.';
  });
  await settings();
  await shot('#settingsModal .settings-body section.card:nth-of-type(2)', '31-camera-depth');
  await shot('#calibPanel', '32-stereo-calib');
  await shot('#settingsModal .settings-body section.card:nth-of-type(3)', '33-kml-overlay');
  await shot('#settingsModal .settings-body section.card:nth-of-type(4)', '34-debug-console');
  await hide('#settingsModal');

  // ── 35. Sketch ────────────────────────────────────────────────────────────
  await p.evaluate(() => { openSketchModal(); });
  await p.waitForTimeout(500);
  await shot('#sketchModal .sketch-toolbar', '35-sketch-toolbar');
  await p.evaluate(()=>{const m=document.getElementById('sketchModal'); if(m) m.remove();});

  // ── 36. Header: map summary link and Install App ──────────────────────────
  await shot('header', '36-header', () => {
    document.getElementById('installButton').hidden=false;
    document.getElementById('openSettingsButton').hidden=false;
  });

  if (errs.length) console.log('PAGEERRORS:', errs.slice(0,4));
  await b.close();
})();
