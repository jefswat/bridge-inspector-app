#!/usr/bin/env node
/**
 * Generate a georeferenced IFC4 test cube for AR testing.
 *
 * The cube is a solid box centred on a given WGS84 lat/lon, with its base at a
 * given elevation, aligned so its faces face N/S/E/W.
 *
 * The base elevation is baked into the geometry's Z, not just written to
 * IfcMapConversion.OrthogonalHeight: extractGeoreference() in ifc-viewer.js
 * never reads OrthogonalHeight, and the AR eye is placed off modelElevMinM
 * (the model's lowest geometry), so an elevation held only in metadata would
 * be ignored. OrthogonalHeight is therefore 0 — the geometry already carries
 * the full height above the CRS vertical datum.
 *
 * Georeferencing matches what ifc-viewer.js actually reads: IfcMapConversion +
 * IfcProjectedCRS (IfcSite RefLatitude/RefLongitude is written too, but the
 * viewer ignores it — see extractGeoreference()).
 *
 * Geometry is declared in METRE. IfcMapConversion.Scale converts model metres
 * to the CRS unit (EPSG:7062 is in US survey feet).
 *
 * Usage:
 *   node tools/make-test-cube.js --lat 41.2 --lon -96.1 [--size-ft 12]
 *                                [--base-ft 1043 | --base-m 317.9064]
 *                                [--epsg EPSG:7062] [--out test-models/cube-12ft.ifc]
 */

const fs = require("fs");
const path = require("path");
const proj4 = require(path.join(__dirname, "..", "vendor", "proj4.js"));

// Must match IFCViewer.CRS_DEFS in ifc-viewer.js, or the app cannot resolve the
// model back to lat/lon and AR anchoring silently falls back to null.
const CRS_DEFS = {
  "EPSG:7062":
    "+proj=tmerc +lat_0=40.25 +lon_0=-95.7333333333333 +k=1.000039 " +
    "+x_0=5029210.05842011 +y_0=2011684.02336805 +ellps=GRS80 " +
    "+towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs",
};

const US_FT_PER_M = 1 / 0.3048006096012192; // US survey foot
const M_PER_FT = 0.3048; // international foot, for the nominal cube size

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith("--")) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith("--")) { out[key] = true; continue; }
    out[key] = next; i += 1;
  }
  return out;
}

// IFC GUIDs are 22 chars of a base64-ish alphabet.
const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
function ifcGuid() {
  let s = "";
  for (let i = 0; i < 22; i += 1) s += B64[Math.floor(Math.random() * 64)];
  return s;
}

// IFC reals must always carry a decimal point.
function num(v) {
  if (!isFinite(v)) return "0.";
  const s = Number(v).toPrecision(15).replace(/0+$/, "");
  return /[.eE]/.test(s) ? s.replace(/\.$/, ".") : s + ".";
}

// Degrees -> IFC compound (deg, min, sec, millionths).
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

function buildCubeIFC(opts) {
  const { lat, lon, sizeM, epsg, baseElevM } = opts;

  const def = CRS_DEFS[epsg];
  if (!def) throw new Error(`EPSG ${epsg} is not in CRS_DEFS — the app could not georeference it.`);
  proj4.defs(epsg, def);
  const [eastings, northings] = proj4("WGS84", epsg, [lon, lat]);

  const lines = [];
  let id = 0;
  const add = (body) => { id += 1; lines.push(`#${id}=${body};`); return id; };

  // --- Geometry context ---
  const originPt = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const zDir = add("IFCDIRECTION((0.,0.,1.))");
  const xDir = add("IFCDIRECTION((1.,0.,0.))");
  const worldPlacement = add(`IFCAXIS2PLACEMENT3D(#${originPt},#${zDir},#${xDir})`);
  const trueNorth = add("IFCDIRECTION((0.,1.))");
  const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${worldPlacement},#${trueNorth})`);

  // --- Units: metre, matching ifc-export.js ---
  const uLen = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const uArea = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
  const uVol = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
  const uAng = add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
  const units = add(`IFCUNITASSIGNMENT((#${uLen},#${uArea},#${uVol},#${uAng}))`);

  const project = add(`IFCPROJECT('${ifcGuid()}',$,'AR Test Cube','12 ft test cube for AR anchoring',$,$,$,(#${ctx}),#${units})`);

  // --- Georeferencing: what ifc-viewer.js extractGeoreference() reads ---
  // Model X = map easting, model Y = map northing (no grid rotation), and Scale
  // converts model metres into the CRS's US survey feet.
  const crsUnit = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
  const crs = add(`IFCPROJECTEDCRS('${epsg}','Nebraska LDP (test)','NAD83','NAVD88',$,$,#${crsUnit})`);
  // OrthogonalHeight is 0 on purpose: the geometry's Z already holds the full
  // height above the vertical datum (see the note at the top of this file).
  add(`IFCMAPCONVERSION(#${ctx},#${crs},${num(eastings)},${num(northings)},0.,1.,0.,${num(US_FT_PER_M)})`);

  // --- Spatial structure ---
  const siteObjPl = add(`IFCLOCALPLACEMENT($,#${worldPlacement})`);
  const site = add(`IFCSITE('${ifcGuid()}',$,'Test Site',$,$,#${siteObjPl},$,$,.ELEMENT.,${dms(lat)},${dms(lon)},${num(baseElevM)},$,$)`);
  const bldObjPl = add(`IFCLOCALPLACEMENT(#${siteObjPl},#${worldPlacement})`);
  const building = add(`IFCBUILDING('${ifcGuid()}',$,'Test Cube',$,$,#${bldObjPl},$,$,.ELEMENT.,$,$,$)`);
  const storeyObjPl = add(`IFCLOCALPLACEMENT(#${bldObjPl},#${worldPlacement})`);
  const storey = add(`IFCBUILDINGSTOREY('${ifcGuid()}',$,'Ground',$,$,#${storeyObjPl},$,$,.ELEMENT.,${num(baseElevM)})`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${project},(#${site}))`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${site},(#${building}))`);
  add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${building},(#${storey}))`);

  // --- The cube: square profile centred on the origin, extruded up ---
  const profPt = add("IFCCARTESIANPOINT((0.,0.))");
  const profDir = add("IFCDIRECTION((1.,0.))");
  const profPl = add(`IFCAXIS2PLACEMENT2D(#${profPt},#${profDir})`);
  const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,'CubeFootprint',#${profPl},${num(sizeM)},${num(sizeM)})`);
  const solidPt = add("IFCCARTESIANPOINT((0.,0.,0.))");
  const solidZ = add("IFCDIRECTION((0.,0.,1.))");
  const solidX = add("IFCDIRECTION((1.,0.,0.))");
  const solidPl = add(`IFCAXIS2PLACEMENT3D(#${solidPt},#${solidZ},#${solidX})`);
  const extrudeDir = add("IFCDIRECTION((0.,0.,1.))");
  const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${solidPl},#${extrudeDir},${num(sizeM)})`);

  // Bright orange so it is unmistakable against a back yard in AR.
  const colour = add("IFCCOLOURRGB($,1.,0.45,0.1)");
  const rendering = add(`IFCSURFACESTYLERENDERING(#${colour},0.15,$,$,$,$,IFCNORMALISEDRATIOMEASURE(0.4),$,.NOTDEFINED.)`);
  const surfStyle = add(`IFCSURFACESTYLE('TestOrange',.BOTH.,(#${rendering}))`);
  add(`IFCSTYLEDITEM(#${solid},(#${surfStyle}),$)`);

  const shapeRep = add(`IFCSHAPEREPRESENTATION(#${ctx},'Body','SweptSolid',(#${solid}))`);
  const prodShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

  // Lift the whole solid so its base sits at the requested elevation. This is
  // what sets modelElevMinM, which the AR eye uses as its ground datum.
  const cubePt = add(`IFCCARTESIANPOINT((0.,0.,${num(baseElevM)}))`);
  const cubeZ = add("IFCDIRECTION((0.,0.,1.))");
  const cubeX = add("IFCDIRECTION((1.,0.,0.))");
  const cubeAxis = add(`IFCAXIS2PLACEMENT3D(#${cubePt},#${cubeZ},#${cubeX})`);
  const cubePl = add(`IFCLOCALPLACEMENT(#${storeyObjPl},#${cubeAxis})`);

  const sizeFt = sizeM / M_PER_FT;
  const baseFt = baseElevM / M_PER_FT;
  const desc = `${sizeFt.toFixed(0)} ft cube | GPS ${lat.toFixed(6)}, ${lon.toFixed(6)} | base ${baseFt.toFixed(1)} ft`;
  const proxy = add(`IFCBUILDINGELEMENTPROXY('${ifcGuid()}',$,'Test Cube ${sizeFt.toFixed(0)}ft','${desc}',$,#${cubePl},#${prodShape},$,.NOTDEFINED.)`);
  add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,'Contents',$,(#${proxy}),#${storey})`);

  // --- Properties, so the values are checkable in the app ---
  const props = [];
  const pv = (nm, v) => { props.push(add(`IFCPROPERTYSINGLEVALUE('${nm}',$,${v},$)`)); };
  pv("Latitude", `IFCREAL(${num(lat)})`);
  pv("Longitude", `IFCREAL(${num(lon)})`);
  pv("Easting_usft", `IFCREAL(${num(eastings)})`);
  pv("Northing_usft", `IFCREAL(${num(northings)})`);
  pv("EdgeLength_ft", `IFCREAL(${num(sizeFt)})`);
  pv("EdgeLength_m", `IFCREAL(${num(sizeM)})`);
  pv("BaseElevation_ft", `IFCREAL(${num(baseFt)})`);
  pv("BaseElevation_m", `IFCREAL(${num(baseElevM)})`);
  pv("TopElevation_ft", `IFCREAL(${num(baseFt + sizeFt)})`);
  const pset = add(`IFCPROPERTYSET('${ifcGuid()}',$,'Pset_TestCube',$,(${props.map((p) => "#" + p).join(",")}))`);
  add(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',$,$,$,(#${proxy}),#${pset})`);

  const stamp = new Date().toISOString().replace(/\.\d+Z$/, "");
  const header = [
    "ISO-10303-21;",
    "HEADER;",
    "FILE_DESCRIPTION(('Georeferenced AR test cube'),'2;1');",
    `FILE_NAME('cube.ifc','${stamp}',(''),(''),'Bridge Inspector test tools','make-test-cube.js','');`,
    "FILE_SCHEMA(('IFC4'));",
    "ENDSEC;",
    "DATA;",
  ];
  const footer = ["ENDSEC;", "END-ISO-10303-21;"];
  return {
    text: header.concat(lines, footer).join("\n") + "\n",
    eastings,
    northings,
  };
}

function main() {
  const args = parseArgs(process.argv);
  const lat = Number(args.lat);
  const lon = Number(args.lon);
  if (!isFinite(lat) || !isFinite(lon)) {
    console.error("Usage: node tools/make-test-cube.js --lat <deg> --lon <deg> [--size-ft 12] [--out path]");
    process.exit(1);
  }
  const sizeFt = args["size-ft"] != null && args["size-ft"] !== true ? Number(args["size-ft"]) : 12;
  const epsg = typeof args.epsg === "string" ? args.epsg : "EPSG:7062";
  // Base elevation above the CRS vertical datum. --base-ft wins if both given.
  let baseElevM = 0;
  if (args["base-ft"] != null && args["base-ft"] !== true) baseElevM = Number(args["base-ft"]) * M_PER_FT;
  else if (args["base-m"] != null && args["base-m"] !== true) baseElevM = Number(args["base-m"]);
  if (!isFinite(baseElevM)) {
    console.error("--base-ft / --base-m must be a number");
    process.exit(1);
  }
  const out = typeof args.out === "string"
    ? args.out
    : path.join("test-models", `cube-${sizeFt}ft.ifc`);

  const built = buildCubeIFC({ lat, lon, sizeM: sizeFt * M_PER_FT, epsg, baseElevM });
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, built.text, "utf8");

  console.log(`Wrote ${out}`);
  console.log(`  centre   ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
  console.log(`  ${epsg}  E=${built.eastings.toFixed(3)} N=${built.northings.toFixed(3)} (us-ft)`);
  console.log(`  edge     ${sizeFt} ft = ${(sizeFt * M_PER_FT).toFixed(4)} m`);
  console.log(`  base     ${(baseElevM / M_PER_FT).toFixed(2)} ft = ${baseElevM.toFixed(4)} m`);
  console.log(`  top      ${(baseElevM / M_PER_FT + sizeFt).toFixed(2)} ft = ${(baseElevM + sizeFt * M_PER_FT).toFixed(4)} m`);
}

if (require.main === module) main();

module.exports = { buildCubeIFC };
