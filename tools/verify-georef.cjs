#!/usr/bin/env node
/**
 * Check where a georeferenced IFC's geometry actually lands.
 *
 * Serve the repo root, then:
 *   node tools/verify-georef.cjs test-models/foo.ifc <lat> <lon> [port]
 *
 * Reports the model's bounding-box centre and an outlier-robust centre as
 * WGS84, plus the offset from the target in metres. Anything more than a few
 * millimetres means the relocation is wrong.
 *
 * This exists because the numbers it prints were once derived by hand in the
 * wrong coordinate frame, which put three test models about 22 m east and 38 m
 * north of where they were supposed to be while the commit message claimed
 * 0.004 m. Measure through the app's own loader, or do not claim a number.
 */
const fs = require('fs');
const path = require('path');
const PW = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = require(PW);

// ifc-viewer.js resolves both the web-ifc ES module and its wasm with './vendor/',
// which a classic script resolves against the DOCUMENT url - so the harness only
// works when served from the repo root. Rather than leave a debug page sitting in
// the deployed tree, copy it up for the run and take it away again.
const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, '_verify-georef.html');

(async () => {
  const [f, lat, lon, port = '8099'] = process.argv.slice(2);
  if (!f || !lat || !lon) {
    console.error('usage: verify-georef.cjs <ifc-path> <lat> <lon> [port]');
    process.exit(1);
  }
  fs.copyFileSync(path.join(__dirname, 'verify-georef.html'), PAGE);
  process.on('exit', () => { try { fs.unlinkSync(PAGE); } catch (_) {} });
  const b = await chromium.launch();
  const p = await (await b.newContext({ serviceWorkers: 'block' })).newPage();
  p.on('pageerror', (e) => console.log('PAGEERROR:', e.message));
  const src = '/' + f.replace(/^\/+/, '');
  await p.goto(`http://127.0.0.1:${port}/_verify-georef.html`
             + `?f=${encodeURIComponent(src)}&lat=${lat}&lon=${lon}`,
               { waitUntil: 'domcontentloaded' });
  await p.waitForFunction(() => window.__r !== undefined, { timeout: 240000 });
  const r = await p.evaluate(() => window.__r);
  console.log(JSON.stringify(r, null, 1));
  await b.close();
  const off = r.offsetFromTargetM;
  process.exit(off && Math.hypot(off.north, off.east) < 0.05 ? 0 : 1);
})();
