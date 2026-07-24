/**
 * IFC Export — write inspection photos into a valid IFC4 (STEP / .ifc) file.
 *
 * HOW IMAGES ARE ADDED TO IFC
 * ---------------------------
 * There is no binary "image blob" primitive in IFC. The standard, portable way
 * to attach a photo to a model is:
 *   1. Create an IfcDocumentReference whose `Location` points at the image.
 *      We embed the JPEG as a base64 `data:` URI so the file stays self-contained
 *      (a single .ifc with no external image folder). A viewer that resolves the
 *      URI can display it; every viewer preserves the reference on round-trip.
 *   2. Associate that document with an element using IfcRelAssociatesDocument.
 * Here each photo also gets its own visible marker (an IfcBuildingElementProxy —
 * a small wedge that points in the camera's viewing direction) placed at the
 * photo's real-world location, so the photos appear as pins inside the model.
 * Photo metadata (lat/lon, heading, attitude, tagged element, comment) is written
 * as an IfcPropertySet on that marker.
 *
 * Placement is a local ENU (east/north/up, metres) frame centred on the bridge
 * footprint centre (equirectangular approximation — accurate to a few cm over a
 * bridge-sized site), so the pins line up with where the photos were taken.
 */
(function () {
  "use strict";

  // ---- IFC GlobalId (compressed 22-char base64 of a 128-bit GUID) -----------
  const B64 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$";
  function uuidBytes() {
    const b = new Uint8Array(16);
    (crypto && crypto.getRandomValues) ? crypto.getRandomValues(b)
      : b.forEach((_, i) => (b[i] = Math.floor(Math.random() * 256)));
    b[6] = (b[6] & 0x0f) | 0x40; // version 4
    b[8] = (b[8] & 0x3f) | 0x80; // variant
    return b;
  }
  function ifcGuid() {
    const b = uuidBytes();
    // Encode 16 bytes as 22 base64 chars in 6-bit groups (IFC scheme: first
    // char from the top 2 bits, then 21 chars of 6 bits each).
    let bits = "";
    for (const x of b) bits += x.toString(2).padStart(8, "0");
    let out = B64[parseInt(bits.slice(0, 2), 2)];
    for (let i = 2; i < 128; i += 6) out += B64[parseInt(bits.slice(i, i + 6), 2)];
    return out;
  }

  // ---- STEP text helpers ----------------------------------------------------
  const q = (s) => "'" + String(s == null ? "" : s).replace(/'/g, "''") + "'";
  const num = (v) => {
    if (v == null || !isFinite(v)) return "0.";
    let s = Number(v).toFixed(6).replace(/0+$/, "").replace(/\.$/, ".");
    if (!s.includes(".")) s += ".";
    return s;
  };

  function blobToDataURI(blob) {
    return new Promise((resolve) => {
      if (!blob) return resolve(null);
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => resolve(null);
      fr.readAsDataURL(blob);
    });
  }

  // Equirectangular lat/lon -> local ENU metres about an origin.
  function toENU(lat, lon, originLat, originLon) {
    const R = 6378137;
    const dLat = (lat - originLat) * Math.PI / 180;
    const dLon = (lon - originLon) * Math.PI / 180;
    const north = dLat * R;
    const east = dLon * R * Math.cos(originLat * Math.PI / 180);
    return { east, north };
  }

  /**
   * Build the IFC text.
   * @param {Array} records  photo records (need .blob; optional location/heading…)
   * @param {Object} bridge  active bridge (uses ifcFootprint.center as origin)
   * @param {Object} opts    { embedImages:boolean }
   * @returns {Promise<{text:string, count:number, withImages:number}>}
   */
  async function buildIFC(records, bridge, opts) {
    opts = opts || {};
    const embed = opts.embedImages !== false;
    const lines = [];
    let id = 0;
    const add = (body) => { id += 1; lines.push(`#${id}=${body};`); return id; };

    // Geometry context ------------------------------------------------------
    const originPt = add("IFCCARTESIANPOINT((0.,0.,0.))");
    const zDir = add("IFCDIRECTION((0.,0.,1.))");
    const xDir = add("IFCDIRECTION((1.,0.,0.))");
    const worldPlacement = add(`IFCAXIS2PLACEMENT3D(#${originPt},#${zDir},#${xDir})`);
    const ctx = add(`IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.0E-5,#${worldPlacement},$)`);

    // Units (metre, radian, square metre) -----------------------------------
    const uLen = add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)");
    const uArea = add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)");
    const uVol = add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)");
    const uAng = add("IFCSIUNIT(*,.PLANEANGLEUNIT.,$,.RADIAN.)");
    const units = add(`IFCUNITASSIGNMENT((#${uLen},#${uArea},#${uVol},#${uAng}))`);

    // Spatial structure -----------------------------------------------------
    const center = bridge && bridge.ifcFootprint && bridge.ifcFootprint.center;
    let originLat = center && (center.lat != null) ? center.lat : null;
    let originLon = center && (center.lon != null) ? center.lon
      : (center && center.lng != null ? center.lng : null);
    if (originLat == null) {
      const withLoc = records.find((r) => r.location && isFinite(r.location.lat));
      if (withLoc) { originLat = withLoc.location.lat; originLon = withLoc.location.lng; }
    }

    const project = add(`IFCPROJECT('${ifcGuid()}',$,${q((bridge && bridge.name) || "Bridge Inspection")},'Inspection photos exported from Bridge Inspector',$,$,$,(#${ctx}),#${units})`);

    const siteObjPl = add(`IFCLOCALPLACEMENT($,#${worldPlacement})`);
    // RefLatitude/Longitude use IFC (deg,min,sec,millionths) compound; store site geo.
    const dms = (deg) => {
      if (deg == null || !isFinite(deg)) return "$";
      const sign = deg < 0 ? -1 : 1; let a = Math.abs(deg);
      const d = Math.floor(a); a = (a - d) * 60;
      const m = Math.floor(a); a = (a - m) * 60;
      const s = Math.floor(a); const ms = Math.round((a - s) * 1e6);
      return `(${sign * d},${sign * m},${sign * s},${sign * ms})`;
    };
    const site = add(`IFCSITE('${ifcGuid()}',$,'Site',$,$,#${siteObjPl},$,$,.ELEMENT.,${dms(originLat)},${dms(originLon)},0.,$,$)`);

    const bldObjPl = add(`IFCLOCALPLACEMENT(#${siteObjPl},#${worldPlacement})`);
    const building = add(`IFCBUILDING('${ifcGuid()}',$,'Bridge',$,$,#${bldObjPl},$,$,.ELEMENT.,$,$,$)`);

    const storeyObjPl = add(`IFCLOCALPLACEMENT(#${bldObjPl},#${worldPlacement})`);
    const storey = add(`IFCBUILDINGSTOREY('${ifcGuid()}',$,'Inspection photos',$,$,#${storeyObjPl},$,$,.ELEMENT.,0.)`);

    add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${project},(#${site}))`);
    add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${site},(#${building}))`);
    add(`IFCRELAGGREGATES('${ifcGuid()}',$,$,$,#${building},(#${storey}))`);

    // One marker per photo --------------------------------------------------
    const proxyIds = [];
    let withImages = 0;
    let fallbackIdx = 0;

    for (const rec of records) {
      // Local position (metres). Photos without a location get lined up in a row.
      let east = 0, north = 0;
      if (rec.location && isFinite(rec.location.lat) && originLat != null) {
        const e = toENU(rec.location.lat, rec.location.lng, originLat, originLon);
        east = e.east; north = e.north;
      } else {
        east = fallbackIdx * 4; north = -8; fallbackIdx += 1;
      }
      const z = 0;

      // Viewing direction from compass heading (0=N=+Y, 90=E=+X).
      const th = (rec.heading != null && isFinite(rec.heading)) ? rec.heading * Math.PI / 180 : 0;
      const dx = Math.sin(th), dy = Math.cos(th);

      const locPt = add(`IFCCARTESIANPOINT((${num(east)},${num(north)},${num(z)}))`);
      const refDir = add(`IFCDIRECTION((${num(dx)},${num(dy)},0.))`);
      const zUp = add("IFCDIRECTION((0.,0.,1.))");
      const axisPl = add(`IFCAXIS2PLACEMENT3D(#${locPt},#${zUp},#${refDir})`);
      const localPl = add(`IFCLOCALPLACEMENT(#${storeyObjPl},#${axisPl})`);

      // Wedge geometry: rectangle profile (long along local +X = view dir),
      // extruded up in Z, so the pin visibly points where the camera looked.
      const p2Pt = add("IFCCARTESIANPOINT((1.,0.))");
      const p2Dir = add("IFCDIRECTION((1.,0.))");
      const prof2Pl = add(`IFCAXIS2PLACEMENT2D(#${p2Pt},#${p2Dir})`);
      const profile = add(`IFCRECTANGLEPROFILEDEF(.AREA.,$,#${prof2Pl},3.0,1.0)`);
      const solidBasePt = add("IFCCARTESIANPOINT((0.,0.,0.))");
      const solidZ = add("IFCDIRECTION((0.,0.,1.))");
      const solidX = add("IFCDIRECTION((1.,0.,0.))");
      const solidPl = add(`IFCAXIS2PLACEMENT3D(#${solidBasePt},#${solidZ},#${solidX})`);
      const extrudeDir = add("IFCDIRECTION((0.,0.,1.))");
      const solid = add(`IFCEXTRUDEDAREASOLID(#${profile},#${solidPl},#${extrudeDir},0.5)`);
      const shapeRep = add(`IFCSHAPEREPRESENTATION(#${ctx},'Body','SweptSolid',(#${solid}))`);
      const prodShape = add(`IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRep}))`);

      const name = rec.exportName || rec.name || ("Photo " + (rec.id || ""));
      const descBits = [];
      if (rec.location && isFinite(rec.location.lat))
        descBits.push(`GPS ${rec.location.lat.toFixed(6)}, ${rec.location.lng.toFixed(6)}`);
      if (rec.heading != null && isFinite(rec.heading)) descBits.push(`Heading ${Math.round(rec.heading)}deg`);
      if (rec.attitude != null && isFinite(rec.attitude)) descBits.push(`Attitude ${Math.round(rec.attitude)}deg`);
      if (rec.ifcTag && (rec.ifcTag.name || rec.ifcTag.type))
        descBits.push(`Tagged ${rec.ifcTag.name || ""} ${rec.ifcTag.type ? "(" + rec.ifcTag.type + ")" : ""}`.trim());
      const proxy = add(`IFCBUILDINGELEMENTPROXY('${ifcGuid()}',$,${q(name)},${q(descBits.join(" | "))},$,#${localPl},#${prodShape},$,.NOTDEFINED.)`);
      proxyIds.push(proxy);

      // Property set with the inspection metadata -----------------------------
      const props = [];
      const pv = (nm, ifcVal) => { const p = add(`IFCPROPERTYSINGLEVALUE(${q(nm)},$,${ifcVal},$)`); props.push(p); };
      if (rec.location && isFinite(rec.location.lat)) {
        pv("Latitude", `IFCREAL(${num(rec.location.lat)})`);
        pv("Longitude", `IFCREAL(${num(rec.location.lng)})`);
      }
      if (rec.heading != null && isFinite(rec.heading)) pv("Heading_deg", `IFCREAL(${num(rec.heading)})`);
      if (rec.attitude != null && isFinite(rec.attitude)) pv("Attitude_deg", `IFCREAL(${num(rec.attitude)})`);
      if (rec.createdAt) pv("CapturedAt", `IFCTEXT(${q(rec.createdAt)})`);
      if (rec.comment) pv("Comment", `IFCTEXT(${q(rec.comment)})`);
      if (rec.ifcTag) {
        if (rec.ifcTag.expressId != null) pv("TaggedElement_ExpressId", `IFCTEXT(${q("#" + rec.ifcTag.expressId)})`);
        if (rec.ifcTag.name) pv("TaggedElement_Name", `IFCTEXT(${q(rec.ifcTag.name)})`);
        if (rec.ifcTag.type) pv("TaggedElement_Type", `IFCTEXT(${q(rec.ifcTag.type)})`);
      }
      if (props.length) {
        const pset = add(`IFCPROPERTYSET('${ifcGuid()}',$,'Pset_InspectionPhoto',$,(${props.map((p) => "#" + p).join(",")}))`);
        add(`IFCRELDEFINESBYPROPERTIES('${ifcGuid()}',$,$,$,(#${proxy}),#${pset})`);
      }

      // Image as a document reference (embedded data URI or filename) ---------
      let location = rec.imageFileName || (safeName(name) + ".jpg");
      if (embed && rec.blob) {
        const uri = await blobToDataURI(rec.blob);
        if (uri) { location = uri; withImages += 1; }
      }
      const docRef = add(`IFCDOCUMENTREFERENCE(${q(location)},$,${q(name)},'Inspection photo',$)`);
      add(`IFCRELASSOCIATESDOCUMENT('${ifcGuid()}',$,$,$,(#${proxy}),#${docRef})`);
    }

    // Contain all markers in the storey -------------------------------------
    if (proxyIds.length) {
      add(`IFCRELCONTAINEDINSPATIALSTRUCTURE('${ifcGuid()}',$,$,$,(${proxyIds.map((p) => "#" + p).join(",")}),#${storey})`);
    }

    const stamp = new Date().toISOString().replace(/\.\d+Z$/, "");
    const header = [
      "ISO-10303-21;",
      "HEADER;",
      `FILE_DESCRIPTION(('Inspection photos with embedded imagery'),'2;1');`,
      `FILE_NAME('${(bridge && bridge.name) ? safeName(bridge.name) : "inspection"}.ifc','${stamp}',(''),(''),'Bridge Inspector PWA','web-ifc-export','');`,
      "FILE_SCHEMA(('IFC4'));",
      "ENDSEC;",
      "DATA;",
    ];
    const footer = ["ENDSEC;", "END-ISO-10303-21;"];
    const text = header.join("\n") + "\n" + lines.join("\n") + "\n" + footer.join("\n") + "\n";
    return { text, count: proxyIds.length, withImages };
  }

  function safeName(s) {
    return String(s || "photo").replace(/[^\w\-]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60) || "photo";
  }

  // --- Merge photos into an EXISTING IFC model ---------------------------------
  // Appends document links to the real element entities so that opening the file
  // in another BIM tool and clicking an element (e.g. a column) surfaces the
  // photos in that element's Documents/Links panel. This is a schema-agnostic
  // STEP text append: we never re-serialise the model, so it works even for
  // schemas web-ifc cannot fully parse (e.g. IFC4X3_ADD2).

  function detectSchema(text) {
    const m = /FILE_SCHEMA\s*\(\s*\(\s*'([^']+)'/i.exec(text);
    const raw = (m && m[1] ? m[1] : "IFC4").toUpperCase();
    return { raw, isIfc2x3: raw.indexOf("IFC2X3") === 0 };
  }

  function maxEntityId(text) {
    let max = 0;
    // Entity ids appear as "#123=" at the start of a definition.
    const re = /#(\d+)\s*=/g;
    let m;
    while ((m = re.exec(text)) !== null) {
      const n = +m[1];
      if (n > max) max = n;
    }
    return max;
  }

  /**
   * @param {string} originalText  the original .ifc file text
   * @param {Array} records  photo records with .ifcTag.expressId and .blob
   * @param {Object} opts  { embedImages:boolean }
   * @returns {Promise<{text:string, linked:number, withImages:number, skipped:number}>}
   */
  async function mergeIntoIFC(originalText, records, opts) {
    opts = opts || {};
    const embed = opts.embedImages !== false;
    const schema = detectSchema(originalText);
    let nextId = maxEntityId(originalText) + 1;
    const add = [];
    const emit = (body) => { const id = nextId++; add.push(`#${id}=${body};`); return id; };

    let linked = 0, withImages = 0, skipped = 0;

    for (const rec of records) {
      const tag = rec.ifcTag;
      const eid = tag && tag.expressId;
      if (eid == null || !isFinite(eid)) { skipped += 1; continue; } // only real, tagged elements

      const name = rec.exportName || rec.name || ("Photo " + (rec.id || ""));
      const metaBits = [];
      if (rec.location && isFinite(rec.location.lat))
        metaBits.push(`GPS ${rec.location.lat.toFixed(6)}, ${rec.location.lng.toFixed(6)}`);
      if (rec.heading != null && isFinite(rec.heading)) metaBits.push(`Heading ${Math.round(rec.heading)}deg`);
      if (rec.attitude != null && isFinite(rec.attitude)) metaBits.push(`Attitude ${Math.round(rec.attitude)}deg`);
      if (rec.comment) metaBits.push(rec.comment);
      const desc = metaBits.join(" | ");

      let location = rec.imageFileName || (safeName(name) + ".jpg");
      if (embed && rec.blob) {
        const uri = await blobToDataURI(rec.blob);
        if (uri) { location = uri; withImages += 1; }
      }
      const ident = "PHOTO-" + safeName(rec.id || name).slice(0, 40);

      let docId;
      if (schema.isIfc2x3) {
        // IFC2X3 IfcDocumentReference(Location, ItemReference, Name)
        docId = emit(`IFCDOCUMENTREFERENCE(${q(location)},${q(ident)},${q(name)})`);
      } else {
        // IFC4 family IfcDocumentInformation(Identification, Name, Description,
        // Location, Purpose, IntendedUse, Scope, Revision, DocumentOwner,
        // Editors, CreationTime, LastRevisionTime, ElectronicFormat, ValidFrom,
        // ValidUntil, Confidentiality, Status)
        docId = emit(`IFCDOCUMENTINFORMATION(${q(ident)},${q(name)},${q(desc)},${q(location)},$,'Inspection photo',$,$,$,$,$,$,'image/jpeg',$,$,$,$)`);
      }
      // IfcRelAssociatesDocument(GlobalId, OwnerHistory, Name, Description,
      // RelatedObjects, RelatingDocument) -> RelatedObjects references the REAL
      // element (#eid) so external viewers show the photo on that element.
      emit(`IFCRELASSOCIATESDOCUMENT('${ifcGuid()}',$,${q(name)},${q(desc)},(#${eid}),#${docId})`);
      linked += 1;
    }

    if (!add.length) {
      return { text: originalText, linked: 0, withImages: 0, skipped };
    }

    // Insert new entities just before the final ENDSEC that closes the DATA
    // section (the last ENDSEC before END-ISO-10303-21).
    const endIso = originalText.lastIndexOf("END-ISO-10303-21");
    const searchIn = endIso >= 0 ? originalText.slice(0, endIso) : originalText;
    const endSec = searchIn.lastIndexOf("ENDSEC");
    let text;
    if (endSec >= 0) {
      text = originalText.slice(0, endSec) + add.join("\n") + "\n" + originalText.slice(endSec);
    } else {
      // Fallback: append before END-ISO if present, else at very end.
      text = endIso >= 0
        ? originalText.slice(0, endIso) + add.join("\n") + "\nENDSEC;\n" + originalText.slice(endIso)
        : originalText + "\n" + add.join("\n") + "\n";
    }
    return { text, linked, withImages, skipped };
  }

  window.ifcExport = { buildIFC, mergeIntoIFC, ifcGuid, detectSchema };
})();
