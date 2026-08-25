#!/usr/bin/env node
/**
 * Re-georeference an existing IFC to a given WGS84 position.
 *
 * Rewrites the file's IfcMapConversion and IfcProjectedCRS so the model's
 * horizontal CENTRE lands on the target coordinates, sets the first IfcSite's
 * reference latitude/longitude, and sets its reference elevation to the model's
 * own ground.
 *
 * Two things about the scale factor are worth stating plainly, because they
 * decide whether the result works in this app:
 *
 *  - IfcMapConversion.Scale converts MODEL length units into the CRS's units.
 *    Read strictly, a model declared in millimetres wants mm -> CRS. But
 *    ifc-viewer.js reads geometry back through web-ifc, which normalises every
 *    model to METRES regardless of its declared unit, and then multiplies by
 *    Scale. So for the app the factor must be metres -> CRS units. This tool
 *    writes that, and a strict IFC reader would therefore see a model scaled
 *    by the file's unit factor. Stated here rather than hidden.
 *
 *  - The model is NOT moved vertically. web-ifc ignores the IfcLocalPlacement
 *    hierarchy above product level for these files, so a placement-based shift
 *    is silently discarded; see the note in the code. The site's RefElevation
 *    is therefore left on the model's own datum so the app stays self-consistent.
 *
 * Usage:
 *   node tools/relocate-ifc.js --in model.ifc --out model-site.ifc \
 *        --lat 44.7493535 --lon -93.4017572 --epsg EPSG:7062 --ground-m 317.9064 \
 *        --centre-x -0.799 --centre-y -21.020
 */

const fs = require("fs");
const path = require("path");
const proj4 = require(path.join(__dirname, "..", "vendor", "proj4.js"));

// Must mirror IFCViewer.CRS_DEFS, or the app cannot resolve the model to
// lat/lon and georeferencing silently yields nothing.
const CRS_DEFS = {
  "EPSG:7062":
    "+proj=tmerc +lat_0=40.25 +lon_0=-95.7333333333333 +k=1.000039 " +
    "+x_0=5029210.05842011 +y_0=2011684.02336805 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
  "EPSG:2264":
    "+proj=lcc +lat_0=33.75 +lon_0=-79 +lat_1=36.1666666666667 " +
    "+lat_2=34.3333333333333 +x_0=609601.219202438 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
  "EPSG:2263":
    "+proj=lcc +lat_1=41.0333333333333 +lat_2=40.6666666666667 " +
    "+lat_0=40.1666666666667 +lon_0=-74 +x_0=300000 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
  "EPSG:32118":
    "+proj=lcc +lat_1=41.0333333333333 +lat_2=40.6666666666667 " +
    "+lat_0=40.1666666666667 +lon_0=-74 +x_0=300000 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
  // NAD83 / Iowa South (ftUS) and metric. Des Moines metro.
  "EPSG:3418":
    "+proj=lcc +lat_0=40 +lon_0=-93.5 +lat_1=41.7833333333333 " +
    "+lat_2=40.6166666666667 +x_0=500000.00001016 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
  "EPSG:26976":
    "+proj=lcc +lat_0=40 +lon_0=-93.5 +lat_1=41.7833333333333 " +
    "+lat_2=40.6166666666667 +x_0=500000 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
  "EPSG:32119":
    "+proj=lcc +lat_0=33.75 +lon_0=-79 +lat_1=36.1666666666667 " +
    "+lat_2=34.3333333333333 +x_0=609601.22 +y_0=0 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=m +no_defs +type=crs",
};
const US_FT_PER_M = 1 / 0.3048006096012192;

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[a.slice(2)] = true; continue; }
    out[a.slice(2)] = next; i += 1;
  }
  return out;
}

function num(v) {
  if (!isFinite(v)) return "0.";
  const s = Number(v).toPrecision(15).replace(/0+$/, "");
  return /[.eE]/.test(s) ? s.replace(/\.$/, ".") : s + ".";
}

function dms(deg) {
  if (deg == null || !isFinite(deg)) return "$";
  const sign = deg < 0 ? -1 : 1;
  let a = Math.abs(deg);
  const d = Math.floor(a); a = (a - d) * 60;
  const m = Math.floor(a); a = (a - m) * 60;
  const s = Math.floor(a);
  const ms = Math.round((a - s) * 1e6);
  return `(${sign * d},${sign * m},${sign * s},${sign * ms})`;
}

// Metres per declared model length unit, so the vertical shift can be written
// in the file's own units.
function modelUnitMetres(text) {
  const m = /IFCSIUNIT\(\*,\.LENGTHUNIT\.,\.?([A-Z]*)\.?,\.METRE\.\)/.exec(text);
  if (!m) return 1;
  const prefix = m[1] || "";
  const table = { MILLI: 1e-3, CENTI: 1e-2, DECI: 1e-1, "": 1, KILO: 1e3, MICRO: 1e-6 };
  return table[prefix] != null ? table[prefix] : 1;
}

function relocate(text, opts) {
  const { lat, lon, epsg, groundM, centreX, centreY } = opts;
  const def = CRS_DEFS[epsg];
  if (!def) throw new Error(`${epsg} is not in CRS_DEFS`);
  proj4.defs(epsg, def);
  const [E, N] = proj4("WGS84", epsg, [lon, lat]);
  const crsIsFeet = /\+units=us-ft/.test(def);
  const unitsPerM = crsIsFeet ? US_FT_PER_M : 1;

  // Place the model's CENTRE on the target rather than its origin: the origin
  // of an authored model is arbitrary and often nowhere near the structure.
  const eastings = E - centreX * unitsPerM;
  const northings = N - centreY * unitsPerM;

  let out = text;
  const before = {};

  // --- IfcProjectedCRS -----------------------------------------------------
  const crsRe = /#(\d+)=IFCPROJECTEDCRS\([^;]*\);/;
  const crsM = crsRe.exec(out);
  if (!crsM) throw new Error("no IFCPROJECTEDCRS found");
  before.crs = crsM[0];
  const datum = crsIsFeet || epsg !== "EPSG:32119" ? "NAD83" : "NAD83";
  // MapUnit left unset: the source file pointed it at the model's own unit,
  // which was already wrong for its CRS, and asserting a unit we have not
  // built an entity for would be worse than omitting an optional attribute.
  out = out.replace(crsRe,
    `#${crsM[1]}=IFCPROJECTEDCRS('${epsg}','${epsg}${crsIsFeet ? " (ftUS)" : " (m)"}','${datum}','NAVD88',$,$,$);`);

  // --- IfcMapConversion ----------------------------------------------------
  const mcRe = /#(\d+)=IFCMAPCONVERSION\((#\d+),(#\d+),[^;]*\);/;
  const mcM = mcRe.exec(out);
  if (!mcM) throw new Error("no IFCMAPCONVERSION found");
  before.mc = mcM[0];
  out = out.replace(mcRe,
    `#${mcM[1]}=IFCMAPCONVERSION(${mcM[2]},${mcM[3]},${num(eastings)},${num(northings)},0.,1.,0.,${num(unitsPerM)});`);

  // --- First IfcSite: reference lat/lon/elevation --------------------------
  // extractGeoreference reads the first site, and groundReferenceElevM prefers
  // its RefElevation over the model's lowest geometry.
  const siteRe = /#(\d+)=IFCSITE\((('[^']*'|\$|#\d+|\.[A-Z]+\.|[^,()]*|\([^)]*\)),){8}[^;]*\);/;
  const siteM = siteRe.exec(out);
  if (!siteM) throw new Error("no IFCSITE found");
  before.site = siteM[0];
  // Split the site's attribute list, respecting nested parentheses.
  const inner = siteM[0].slice(siteM[0].indexOf("(") + 1, siteM[0].lastIndexOf(")"));
  const parts = [];
  let depth = 0, cur = "", inStr = false;
  for (const ch of inner) {
    if (ch === "'") inStr = !inStr;
    if (!inStr && ch === "(") depth++;
    if (!inStr && ch === ")") depth--;
    if (ch === "," && depth === 0 && !inStr) { parts.push(cur); cur = ""; continue; }
    cur += ch;
  }
  parts.push(cur);
  if (parts.length < 12) throw new Error(`IFCSITE has ${parts.length} attributes, expected >= 12`);
  parts[9] = dms(lat);            // RefLatitude
  parts[10] = dms(lon);           // RefLongitude
  parts[11] = num(groundM);       // RefElevation - model's own ground, see below
  out = out.replace(siteRe, `#${siteM[1]}=IFCSITE(${parts.join(",")});`);

  // --- Vertical datum ------------------------------------------------------
  // The model is NOT shifted vertically, and RefElevation is set to the model's
  // own ground rather than a site elevation, because a placement-based shift
  // does not survive this app's loader.
  //
  // Verified three ways against this file: moving the root IfcLocalPlacement a
  // thousand kilometres, mutating one child placement's origin in place, and
  // rewriting all six child placements - in every case web-ifc returned
  // identical geometry. It does not apply the placement hierarchy above product
  // level here, so anything written there is silently ignored.
  //
  // Setting RefElevation to a real site elevation while the geometry stays at
  // its authored Z would be worse than leaving it: groundReferenceElevM prefers
  // RefElevation, so the app would put the viewer at, say, 318 m with the model
  // still around 0 and the structure would appear hundreds of metres below.
  // Keeping both at the model's own datum stays self-consistent - the app
  // rejects the phone altitude as a datum mismatch and stands the viewer on the
  // model's ground, which is what you want to see.
  const unitM = modelUnitMetres(out);

  return { text: out, E, N, eastings, northings, unitsPerM, unitM, before };
}

function main() {
  const a = parseArgs(process.argv);
  const req = ["in", "out", "lat", "lon", "epsg"];
  for (const k of req) if (!a[k]) { console.error(`missing --${k}`); process.exit(1); }
  const text = fs.readFileSync(a.in, "utf8");
  const r = relocate(text, {
    lat: Number(a.lat), lon: Number(a.lon), epsg: a.epsg,
    groundM: a["ground-m"] != null ? Number(a["ground-m"]) : 0,
    centreX: a["centre-x"] != null ? Number(a["centre-x"]) : 0,
    centreY: a["centre-y"] != null ? Number(a["centre-y"]) : 0,
  });
  fs.mkdirSync(path.dirname(a.out), { recursive: true });
  fs.writeFileSync(a.out, r.text, "utf8");
  console.log(`Wrote ${a.out}`);
  console.log(`  target    ${Number(a.lat).toFixed(7)}, ${Number(a.lon).toFixed(7)}`);
  console.log(`  ${a.epsg}  E=${r.E.toFixed(3)} N=${r.N.toFixed(3)}`);
  console.log(`  origin    E=${r.eastings.toFixed(3)} N=${r.northings.toFixed(3)} (model centre offset removed)`);
  console.log(`  scale     ${r.unitsPerM.toFixed(9)} CRS units per metre`);
  console.log(`  model unit ${r.unitM} m — geometry NOT shifted; RefElevation ${a["ground-m"] || 0} m (model's own datum)`);
}

if (require.main === module) main();
module.exports = { relocate };
