/**
 * IFC 3D Viewer Module
 * Handles IFC file upload, parsing, rendering, and element selection
 * Uses Three.js for 3D rendering and IFC.js for file parsing
 */

class IFCViewer {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.ifcLoader = null;
    this.model = null;
    this.selectedElement = null;
    this.selectedElements = new Map(); // uuid -> mesh (multi-select support)
    this.raycaster = null;
    this.mouse = null;
    this.originalColors = new Map();
    this.highlightColor = null;
    this.initialized = false;
    // Persistent point the camera looks at; elevation arrows and zoom move it.
    this.target = null;
    this.modelToScene = null;
    this.sceneToModel = null;
    this.taggedExpressIds = new Set();
    this.taggedSprites = [];
    this.taggedSpriteTexture = null;
  }

  _initThreeJs() {
    // Check if THREE.js is available when first needed
    if (typeof THREE === 'undefined') {
      throw new Error('THREE.js library not found');
    }
    if (!this.initialized) {
      this.raycaster = new THREE.Raycaster();
      this.mouse = new THREE.Vector2();
      this.highlightColor = new THREE.Color(0xff6600);
      this.initialized = true;
    }
  }

  /**
   * Initialize the 3D scene, camera, and renderer
   */
  async init(containerElement) {
    if (!containerElement) {
      console.error('IFC Viewer: Container element not found');
      return false;
    }

    try {
      // Initialize THREE.js references
      this._initThreeJs();
      
      // Scene setup
      this.scene = new THREE.Scene();
      this.scene.background = new THREE.Color(0xfafafa);

      // Camera setup
      const width = containerElement.clientWidth;
      const height = containerElement.clientHeight;
      this.camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 10000);
      this.camera.position.set(0, 0, 50);
      this.camera.up.set(0, 0, 1); // Z-up world (elevation is up)
      this.target = new THREE.Vector3(0, 0, 0);

      // Renderer setup
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      this.renderer.setSize(width, height);
      this.renderer.setPixelRatio(window.devicePixelRatio);
      containerElement.appendChild(this.renderer.domElement);

      // Lighting
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
      this.scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
      directionalLight.position.set(50, 50, 50);
      this.scene.add(directionalLight);

      // Basic orbit controls (if needed, can use three/examples/OrbitControls.js)
      this.setupControls();

      // Event listeners for element selection
      this.renderer.domElement.addEventListener('click', (e) => this.onMouseClick(e));
      window.addEventListener('resize', () => this.onWindowResize(containerElement));

      // Start animation loop
      this.animate();

      return true;
    } catch (error) {
      console.error('IFC Viewer init error:', error);
      return false;
    }
  }

  /**
   * Setup basic camera controls (rotation, zoom, pan)
   * Left-click drag: orbit rotate around selected element centroid (or global center)
   * Right-click drag: pan camera
   */
  setupControls() {
    let isDragging = false;
    let dragButton = -1; // -1=none, 0=left, 2=right
    let previousMousePosition = { x: 0, y: 0 };
    this._dragDistance = 0;
    let orbitTarget = new THREE.Vector3(0, 0, 0); // Persistent orbit center for this drag session

    this.renderer.domElement.addEventListener('mousedown', (e) => {
      isDragging = true;
      dragButton = e.button;
      this._dragDistance = 0;
      previousMousePosition = { x: e.clientX, y: e.clientY };
      
      // If left-click and element is selected, set orbit center to element centroid
      if (dragButton === 0 && this.selectedElement && this.selectedElement.geometry) {
        const box = new THREE.Box3().setFromObject(this.selectedElement);
        orbitTarget = new THREE.Vector3();
        box.getCenter(orbitTarget);
      } else {
        // No selection or right-click: orbit around global center
        orbitTarget = new THREE.Vector3(0, 0, 0);
      }
      this.target = orbitTarget.clone();
      
      e.preventDefault();
    });

    document.addEventListener('mousemove', (e) => {
      if (!isDragging) return;

      const deltaX = e.clientX - previousMousePosition.x;
      const deltaY = e.clientY - previousMousePosition.y;
      this._dragDistance += Math.abs(deltaX) + Math.abs(deltaY);

      if (dragButton === 0) {
        // Left-click: true orbit (move camera position) around a fixed pivot.
        this.target = orbitTarget.clone();
        this.orbitEye(-deltaX * 0.005, -deltaY * 0.005);
      } else if (dragButton === 2) {
        // Right-click: pan camera (move both eye and target together)
        const panScale = 0.005;
        this.panMove(-deltaX * panScale, deltaY * panScale);
      }

      previousMousePosition = { x: e.clientX, y: e.clientY };
    });

    document.addEventListener('mouseup', () => {
      isDragging = false;
      dragButton = -1;
    });

    // Suppress context menu on right-click in the viewer
    this.renderer.domElement.addEventListener('contextmenu', (e) => {
      e.preventDefault();
    });

    // Zoom with mouse wheel: dolly the camera toward/away from the model
    // center along the view direction (works for any view preset).
    this.renderer.domElement.addEventListener('wheel', (e) => {
      e.preventDefault();
      if (!this.camera) return;
      const target = this.target || new THREE.Vector3(0, 0, 0);
      const dir = new THREE.Vector3().subVectors(this.camera.position, target);
      let dist = dir.length();
      const min = this.zoomMin || 1;
      const max = this.zoomMax || 5000;
      dist += e.deltaY * (this.zoomStep || 1);
      dist = Math.max(min, Math.min(max, dist));
      dir.normalize().multiplyScalar(dist);
      this.camera.position.copy(target).add(dir);
      this.camera.lookAt(target);
    }, { passive: false });
  }

  /**
   * Load and parse IFC file from File input
   */
  // Robustly read a picked File into an ArrayBuffer. On Android work profiles,
  // file.arrayBuffer() can throw NotReadableError when the file lives in a
  // managed/cloud location. Fall back to FileReader, then to a Blob re-slice,
  // and finally throw a clear, actionable message.
  async _readFileRobust(file) {
    // Attempt 1: modern Blob.arrayBuffer()
    try {
      return await file.arrayBuffer();
    } catch (e1) {
      console.warn('file.arrayBuffer() failed, trying FileReader:', e1 && e1.name, e1 && e1.message);
    }
    // Attempt 2: legacy FileReader
    try {
      return await new Promise((resolve, reject) => {
        const fr = new FileReader();
        fr.onload = () => resolve(fr.result);
        fr.onerror = () => reject(fr.error || new Error('FileReader failed'));
        fr.onabort = () => reject(new Error('FileReader aborted'));
        fr.readAsArrayBuffer(file);
      });
    } catch (e2) {
      console.warn('FileReader failed, trying Blob re-slice:', e2 && e2.name, e2 && e2.message);
    }
    // Attempt 3: re-slice the Blob then read (sometimes refreshes the handle)
    try {
      const reblob = file.slice(0, file.size);
      return await reblob.arrayBuffer();
    } catch (e3) {
      console.error('All read attempts failed:', e3 && e3.name, e3 && e3.message);
    }
    throw new Error(
      "Couldn't read this file (permission blocked by your device/work profile). " +
      "This usually means the IFC is in a cloud or managed folder (OneDrive, SharePoint, Google Drive). " +
      "Fix: download/copy the .ifc into your phone's local Downloads folder, then pick it from there."
    );
  }

  async loadIFCFile(file, options = {}) {
    try {
      console.log('Loading IFC file:', file.name);
      const arrayBuffer = await this._readFileRobust(file);
      const excludeRebar = !!options.excludeRebar;

      // Dynamically load web-ifc ES module (only ships as ESM, not a browser global)
      if (!window.WebIFC) {
        try {
          window.WebIFC = await import('./vendor/web-ifc-api.js');
        } catch (impErr) {
          console.error('Failed to import web-ifc module:', impErr);
          throw new Error('web-ifc library failed to load. Please refresh the page and try again.');
        }
      }

      // Clear existing model
      this.selectedElements.clear();
      this.selectedElement = null;
      this._clearTaggedSymbols();
      if (this.model) {
        this.scene.remove(this.model);
        this.originalColors.clear();
      }

      // Create a group to hold the model
      this.model = new THREE.Group();
      
      // Initialize web-ifc
      const ifc = new window.WebIFC.IfcAPI();
      ifc.SetWasmPath('./vendor/');
      await ifc.Init();
      
      // Parse the IFC file. COORDINATE_TO_ORIGIN recenters georeferenced
      // bridge/infrastructure models near (0,0,0) to avoid float precision loss.
      const uint8Array = new Uint8Array(arrayBuffer);
      const modelID = ifc.OpenModel(uint8Array, {
        COORDINATE_TO_ORIGIN: true,
      });

      console.log('IFC model ID:', modelID);
      if (modelID < 0) {
        throw new Error('web-ifc could not open this file (unsupported schema or corrupt file).');
      }

      const schema = ifc.GetModelSchema ? ifc.GetModelSchema(modelID) : 'unknown';
      console.log('IFC schema:', schema);

      // Stream real triangulated geometry for every element in the model.
      const elements = [];
      let meshCount = 0;
      let skippedRebar = 0;
      const tmpMatrix = new THREE.Matrix4();

      ifc.StreamAllMeshes(modelID, (flatMesh) => {
        const expressID = flatMesh.expressID;
        const placed = flatMesh.geometries;
        const numGeom = placed.size();

        // Resolve a human-readable name/type once per element.
        let typeName = 'Element';
        try {
          const typeCode = ifc.GetLineType(modelID, expressID);
          typeName = ifc.GetNameFromTypeCode(typeCode) || 'Element';
        } catch (e) { /* keep default */ }

        let elemName = typeName;
        try {
          const line = ifc.GetLine(modelID, expressID);
          if (line && line.Name && line.Name.value) elemName = line.Name.value;
        } catch (e) { /* keep default */ }

        if (excludeRebar && this._isRebarElement(typeName, elemName)) {
          skippedRebar++;
          placed.delete();
          return;
        }

        for (let i = 0; i < numGeom; i++) {
          const pg = placed.get(i);
          const geom = ifc.GetGeometry(modelID, pg.geometryExpressID);

          const verts = ifc.GetVertexArray(
            geom.GetVertexData(), geom.GetVertexDataSize()
          );
          const indices = ifc.GetIndexArray(
            geom.GetIndexData(), geom.GetIndexDataSize()
          );

          // web-ifc packs interleaved [px,py,pz, nx,ny,nz] floats (stride 6).
          const positions = new Float32Array(verts.length / 2);
          const normals = new Float32Array(verts.length / 2);
          for (let v = 0, o = 0; v < verts.length; v += 6, o += 3) {
            positions[o]     = verts[v];
            positions[o + 1] = verts[v + 1];
            positions[o + 2] = verts[v + 2];
            normals[o]       = verts[v + 3];
            normals[o + 1]   = verts[v + 4];
            normals[o + 2]   = verts[v + 5];
          }

          const bufferGeom = new THREE.BufferGeometry();
          bufferGeom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
          bufferGeom.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
          bufferGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(indices), 1));

          const col = pg.color; // {x,y,z,w} 0..1
          const colorHex = new THREE.Color(col.x, col.y, col.z).getHex();
          const material = new THREE.MeshPhongMaterial({
            color: colorHex,
            side: THREE.DoubleSide,
            transparent: col.w < 1,
            opacity: col.w,
            shininess: 40,
          });

          tmpMatrix.fromArray(pg.flatTransformation);
          bufferGeom.applyMatrix4(tmpMatrix);
          const mesh = new THREE.Mesh(bufferGeom, material);

          mesh.userData.elementId = `elem_${expressID}`;
          mesh.userData.elementName = elemName;
          mesh.userData.elementType = typeName;
          mesh.userData.ifcExpressId = expressID;

          this.model.add(mesh);
          this.originalColors.set(mesh.uuid, colorHex);
          meshCount++;
        }

        elements.push({ id: expressID, name: elemName, type: typeName });
        // Free WASM-side geometry memory for this mesh.
        placed.delete();
      });

      console.log(`Streamed ${meshCount} meshes across ${elements.length} elements${excludeRebar ? ` (rebar skipped: ${skippedRebar})` : ''}`);


      // Extract georeferencing (map coords) BEFORE fitCameraToObject bakes
      // recentering into the geometry, while meshes are still in web-ifc space.
      try {
        this.georef = this.extractGeoreference(ifc, modelID);
        this.model.userData.georef = this.georef;
        if (this.georef) {
          console.log('Georeference:', this.georef);
          window.dispatchEvent(new CustomEvent('ifcGeoreferenced', { detail: this.georef }));
        } else {
          console.log('No georeferencing found in this IFC.');
        }
      } catch (geoErr) {
        console.warn('Georeferencing extraction failed:', geoErr);
      }

      this.model.userData.fileName = file.name;
      this.model.userData.elements = elements;
      this.model.userData.ifc = ifc;
      this.model.userData.modelID = modelID;

      this.scene.add(this.model);
      this.fitCameraToObject();
      this._refreshTaggedSymbols();

      console.log(`IFC loaded: ${file.name} with ${elements.length} elements (${meshCount} meshes${excludeRebar ? `, skipped rebar elements: ${skippedRebar}` : ''})`);
      this.lastLoadError = null;
      return true;
    } catch (error) {
      console.error('IFC file loading error:', error);
      this.lastLoadError = (error && error.message) ? error.message : String(error);
      return false;
    }
  }

  _classifyProjectionBucket(typeName, elemName) {
    const txt = `${typeName || ""} ${elemName || ""}`.toLowerCase();
    if (txt.includes("deck") || txt.includes("slab")) return "deck";
    if (txt.includes("barrier") || txt.includes("rail") || txt.includes("guard") || txt.includes("parapet")) return "barrier";
    if (txt.includes("girder") || txt.includes("beam") || txt.includes("stringer") || txt.includes("member") || txt.includes("truss")) return "girder";
    if (txt.includes("pier") || txt.includes("column") || txt.includes("abut") || txt.includes("footing")
      || txt.includes("pile") || txt.includes("bent") || txt.includes("foundation") || txt.includes("cap")) return "pier";
    return "other";
  }

  _isRebarElement(typeName, elemName) {
    const txt = `${typeName || ""} ${elemName || ""}`.toLowerCase();
    return txt.includes("reinforcing")
      || txt.includes("rebar")
      || txt.includes("ifcreinforcingbar")
      || txt.includes("ifcreinforcingmesh");
  }

  _convexHull(points) {
    if (!Array.isArray(points) || points.length < 3) return [];
    const pts = points
      .map((p) => [Number(p[0]), Number(p[1])])
      .filter((p) => Number.isFinite(p[0]) && Number.isFinite(p[1]))
      .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
    if (pts.length < 3) return [];
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop();
    upper.pop();
    return lower.concat(upper);
  }

  /**
   * Known proj4 CRS definitions (EPSG code -> proj4 string). Extendable; if a
   * model uses a code not listed here, georeferencing center/footprint lat/lon
   * will be null but the raw easting/northing are still returned.
   */
  static CRS_DEFS = {
    'EPSG:7062': '+proj=tmerc +lat_0=40.25 +lon_0=-95.7333333333333 +k=1.000039 +x_0=5029210.05842011 +y_0=2011684.02336805 +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=us-ft +no_defs +type=crs'
  };

  /**
   * Register a proj4 CRS definition at runtime (e.g. fetched from epsg.io).
   */
  static registerCRS(epsg, proj4def) {
    IFCViewer.CRS_DEFS[epsg] = proj4def;
  }

  /**
   * Extract georeferencing from the IFC model and compute a WGS84 footprint.
   * Must run while meshes are still in web-ifc coordinated space (before the
   * fitCameraToObject bake). Returns null if the model is not georeferenced.
   */
  extractGeoreference(ifc, modelID) {
    const WebIFC = window.WebIFC;
    const val = (x) => (x && x.value !== undefined ? x.value : x);

    // --- Read IfcMapConversion + IfcProjectedCRS ---
    let mc = null, crs = null;
    try {
      const mcIds = ifc.GetLineIDsWithType(modelID, WebIFC.IFCMAPCONVERSION);
      if (mcIds && mcIds.size && mcIds.size() > 0) mc = ifc.GetLine(modelID, mcIds.get(0));
    } catch (e) { /* none */ }
    try {
      const crsIds = ifc.GetLineIDsWithType(modelID, WebIFC.IFCPROJECTEDCRS);
      if (crsIds && crsIds.size && crsIds.size() > 0) crs = ifc.GetLine(modelID, crsIds.get(0));
    } catch (e) { /* none */ }

    if (!mc) return null; // not georeferenced via map conversion

    const eastings  = Number(val(mc.Eastings)  ?? 0);
    const northings = Number(val(mc.Northings) ?? 0);
    const scale     = Number(val(mc.Scale)     ?? 1) || 1;
    const absc      = Number(val(mc.XAxisAbscissa) ?? 1);
    const ordn      = Number(val(mc.XAxisOrdinate) ?? 0);
    // Rotation angle of the map grid relative to the model's X axis.
    const norm = Math.hypot(absc, ordn) || 1;
    const cosT = absc / norm;
    const sinT = ordn / norm;

    const crsName = crs ? String(val(crs.Name) || '') : '';
    const epsgMatch = crsName.match(/EPSG:?\s*(\d+)/i);
    const epsg = epsgMatch ? `EPSG:${epsgMatch[1]}` : null;

    // --- Recover true world coords despite COORDINATE_TO_ORIGIN ---
    // Coordination matrix C maps true model coords -> rendered (coordinated)
    // coords. Invert it to go back.
    const Cinv = new THREE.Matrix4();
    this.coordMatrix = new THREE.Matrix4();
    try {
      const C = ifc.GetCoordinationMatrix(modelID);
      this.coordMatrix.fromArray(C);
      Cinv.fromArray(C).invert();
    } catch (e) {
      Cinv.identity();
      this.coordMatrix.identity();
    }

    // Recover the model's TRUE coordinate-space axis-aligned bounds. web-ifc may
    // emit Y-up coordinated geometry, so we can't assume which coordinated axis
    // is the map's northing. Instead transform all 8 coordinated bounding-box
    // corners back into true model space via Cinv, then take the true X (map
    // easting) and true Y (map northing) extents. Elevation (true Z) is ignored
    // for the footprint.
    const box = new THREE.Box3().setFromObject(this.model);
    const boxCorners = [
      [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
      [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
      [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
      [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
    ].map((a) => new THREE.Vector3(a[0], a[1], a[2]).applyMatrix4(Cinv));

    // web-ifc always emits Y-up geometry: model (X, Y, Z)_Zup maps to render
    // (X, Z, -Y)_Yup, and GetCoordinationMatrix only re-centers (no axis flip).
    // So after Cinv the recovered axes are: x = model easting (X),
    // z = -model northing (-Y), y = model elevation (Z). Map easting from .x
    // and northing from -.z.
    let tMinE = Infinity, tMaxE = -Infinity, tMinN = Infinity, tMaxN = -Infinity;
    let tMinEl = Infinity, tMaxEl = -Infinity;
    for (const t of boxCorners) {
      const e = t.x, n = -t.z, el = t.y;
      if (e < tMinE) tMinE = e;
      if (e > tMaxE) tMaxE = e;
      if (n < tMinN) tMinN = n;
      if (n > tMaxN) tMaxN = n;
      if (el < tMinEl) tMinEl = el;
      if (el > tMaxEl) tMaxEl = el;
    }
    // Model elevation center (in true-model metres), used as a default eye
    // height when positioning the camera from a photo's ground location.
    this.modelElevCenterM = (tMinEl + tMaxEl) / 2;
    const trueCorners = [
      [tMinE, tMinN], [tMaxE, tMinN], [tMaxE, tMaxN], [tMinE, tMaxN],
    ];
    const trueCenter = [(tMinE + tMaxE) / 2, (tMinN + tMaxN) / 2];

    // Convert true model X/Y -> map easting/northing (CRS units).
    const toMap = (x, y) => {
      const e = x * scale;
      const n = y * scale;
      return {
        E: e * cosT - n * sinT + eastings,
        N: e * sinT + n * cosT + northings,
      };
    };

    // Convert map E/N -> WGS84 lat/lon via proj4 (if the CRS is known).
    const def = epsg ? IFCViewer.CRS_DEFS[epsg] : null;
    let toLatLon = null;
    if (def && window.proj4) {
      if (!window.proj4.defs(epsg)) window.proj4.defs(epsg, def);
      toLatLon = (E, N) => {
        const [lon, lat] = window.proj4(epsg, 'WGS84', [E, N]);
        return { lat, lon };
      };
    }

    const footprint = trueCorners.map(([x, y]) => {
      const m = toMap(x, y);
      const ll = toLatLon ? toLatLon(m.E, m.N) : null;
      return { E: m.E, N: m.N, lat: ll ? ll.lat : null, lon: ll ? ll.lon : null };
    });
    const cm = toMap(trueCenter[0], trueCenter[1]);
    const cll = toLatLon ? toLatLon(cm.E, cm.N) : null;

    // Build projected overlays as INDIVIDUAL element footprints (grouped by
    // expressID), not one global hull per category.
    const elementGroups = new Map([
      ["deck", new Map()],
      ["barrier", new Map()],
      ["girder", new Map()],
      ["pier", new Map()],
      ["other", new Map()],
    ]);
    const modelElRange = Math.max(1e-6, tMaxEl - tMinEl);
    const modelElMid = (tMinEl + tMaxEl) / 2;
    const meshCounts = new Map([["deck", 0], ["barrier", 0], ["girder", 0], ["pier", 0], ["other", 0]]);
    this.model.traverse((child) => {
      if (!child || !child.isMesh) return;
      let bucket = this._classifyProjectionBucket(child.userData?.elementType, child.userData?.elementName);
      const box = new THREE.Box3().setFromObject(child);
      if (!box || !Number.isFinite(box.min.x) || !Number.isFinite(box.max.x)) return;
      const corners = [
        [box.min.x, box.min.y, box.min.z], [box.max.x, box.min.y, box.min.z],
        [box.min.x, box.max.y, box.min.z], [box.max.x, box.max.y, box.min.z],
        [box.min.x, box.min.y, box.max.z], [box.max.x, box.min.y, box.max.z],
        [box.min.x, box.max.y, box.max.z], [box.max.x, box.max.y, box.max.z],
      ].map((a) => new THREE.Vector3(a[0], a[1], a[2]).applyMatrix4(Cinv));
      let minE = Infinity, maxE = -Infinity, minN = Infinity, maxN = -Infinity;
      let minEl = Infinity, maxEl = -Infinity;
      for (const t of corners) {
        const e = t.x;
        const n = -t.z;
        const el = t.y;
        if (e < minE) minE = e;
        if (e > maxE) maxE = e;
        if (n < minN) minN = n;
        if (n > maxN) maxN = n;
        if (el < minEl) minEl = el;
        if (el > maxEl) maxEl = el;
      }
      if (!Number.isFinite(minE) || !Number.isFinite(maxE) || !Number.isFinite(minN) || !Number.isFinite(maxN)) return;
      // Fallback classification for generic IFC proxies: infer structure from elevation.
      if (bucket === "other" && Number.isFinite(minEl) && Number.isFinite(maxEl)) {
        const centerEl = (minEl + maxEl) / 2;
        // Lower-half elements are likely substructure (piers/columns/footings).
        if (maxEl < modelElMid - 0.08 * modelElRange || centerEl < modelElMid - 0.18 * modelElRange) {
          bucket = "pier";
        // Mid-band elements are likely girders/stringers when names are generic.
        } else if (centerEl < modelElMid + 0.10 * modelElRange) {
          bucket = "girder";
        }
      }
      const expressId = child.userData?.ifcExpressId != null ? String(child.userData.ifcExpressId) : String(child.uuid);
      const groupMap = elementGroups.get(bucket) || elementGroups.get("other");
      let grp = groupMap.get(expressId);
      if (!grp) {
        grp = {
          expressId: child.userData?.ifcExpressId ?? null,
          elementName: child.userData?.elementName || child.userData?.elementType || "Element",
          points: [],
        };
        groupMap.set(expressId, grp);
      }
      grp.points.push([minE, minN], [maxE, minN], [maxE, maxN], [minE, maxN]);
      meshCounts.set(bucket, (meshCounts.get(bucket) || 0) + 1);
    });

    const labels = { deck: "Deck", barrier: "Barrier", girder: "Girder", pier: "Pier", other: "Other" };
    const projections = [];
    const order = ["deck", "barrier", "girder", "pier"];
    for (const key of order) {
      const groupMap = elementGroups.get(key);
      if (!groupMap || !groupMap.size) continue;
      for (const grp of groupMap.values()) {
        const hull = this._convexHull(grp.points);
        if (hull.length < 3) continue;
        const poly = hull.map(([x, y]) => {
          const m = toMap(x, y);
          const ll = toLatLon ? toLatLon(m.E, m.N) : null;
          return { E: m.E, N: m.N, lat: ll ? ll.lat : null, lon: ll ? ll.lon : null };
        });
        if (poly.filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lon)).length < 3) continue;
        projections.push({
          key,
          label: labels[key] || key,
          expressId: grp.expressId,
          elementName: grp.elementName,
          footprint: poly,
        });
      }
    }
    try {
      const elementCounts = {};
      for (const [k, v] of elementGroups) elementCounts[k] = v.size;
      console.log("IFC projection category counts:", {
        elements: elementCounts,
        meshes: Object.fromEntries(meshCounts),
      });
    } catch (e) { /* ignore */ }

    return {
      epsg,
      crsName,
      hasLatLon: !!toLatLon,
      scale, eastings, northings, rotationDeg: Math.atan2(sinT, cosT) * 180 / Math.PI,
      center: { E: cm.E, N: cm.N, lat: cll ? cll.lat : null, lon: cll ? cll.lon : null },
      footprint,
      projections,
    };
  }

  /**
   * Get human-readable element type name
   */
  getElementTypeName(typeID) {
    const typeNames = {
      26: 'Wall',
      27: 'Wall (Standard)',
      61: 'Slab',
      64: 'Column',
      103: 'Beam',
      123: 'Door',
      124: 'Window',
      68: 'Roof',
    };
    return typeNames[typeID] || `Element (${typeID})`;
  }

  /**
   * Fit camera to show entire model, bake centering + up-axis into geometry.
   */
  fitCameraToObject() {
    if (!this.model) return;

    // Bake centering + a rotation that puts the model's ELEVATION on world Z
    // (Z-up). web-ifc emits Y-up coordinated geometry (x=easting, y=elevation,
    // z=-northing); RotX(+90) maps (x,y,z)->(x,-z,y) so the world becomes
    // X=easting, Y=northing, Z=elevation (a standard Z-up survey frame).
    const preBox = new THREE.Box3().setFromObject(this.model);
    const center = preBox.getCenter(new THREE.Vector3());
    const bake = new THREE.Matrix4()
      .makeRotationX(Math.PI / 2)
      .multiply(new THREE.Matrix4().makeTranslation(-center.x, -center.y, -center.z));
    this.model.traverse((child) => {
      if (child.isMesh && child.geometry) {
        child.geometry.applyMatrix4(bake);
        child.geometry.computeBoundingSphere();
      }
    });
    // Turntable feel: horizontal drag spins about world Z (vertical), vertical
    // drag tilts about X. Apply azimuth first, then tilt.
    this.model.rotation.order = 'ZXY';

    // Composite transform: true-model M-space (x=easting, y=elevation,
    // z=-northing, in metres) -> final baked scene coords. Used to place the
    // camera at a photo's real-world location. bake maps coordinated->scene,
    // coordMatrix maps M-space->coordinated, so modelToScene = bake * C.
    if (this.coordMatrix) {
      this.modelToScene = bake.clone().multiply(this.coordMatrix);
      this.sceneToModel = this.modelToScene.clone().invert();
    }

    // Recompute bounds after recentering.
    const box = new THREE.Box3().setFromObject(this.model);
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z) || 1;
    this.modelRadius = maxDim;

    // Add / refresh an axes helper so orientation is legible
    // (red = X / easting, green = Y / northing, blue = Z / elevation = UP).
    if (this.axesHelper) this.scene.remove(this.axesHelper);
    this.axesHelper = new THREE.AxesHelper(maxDim * 0.6);
    this.scene.add(this.axesHelper);

    // Dynamic clip planes + zoom bounds scaled to the model size.
    this.camera.near = maxDim / 1000;
    this.camera.far = maxDim * 100;
    this.zoomMin = maxDim * 0.05;
    this.zoomMax = maxDim * 6;
    this.zoomStep = maxDim / 500;

    // Default to an isometric view so long bridges are not seen end-on.
    this.setView('iso');
  }

  /**
   * Position the camera at a preset view around the model center.
   * @param {'iso'|'top'|'front'|'side'} preset
   */
  setView(preset) {
    const r = this.modelRadius || 50;
    const fov = this.camera.fov * (Math.PI / 180);
    const dist = Math.abs(r / 2 / Math.tan(fov / 2)) * 1.6;
    if (this.model) this.model.rotation.set(0, 0, 0);
    // Reset the look-at target to the model centre for a clean preset.
    if (!this.target) this.target = new THREE.Vector3();
    this.target.set(0, 0, 0);
    // World is Z-up: X=easting, Y=northing, Z=elevation.
    switch (preset) {
      case 'top':   // plan view, looking straight down; north (+Y) toward top
        this.camera.position.set(0, 0, dist);
        this.camera.up.set(0, 1, 0);
        break;
      case 'front': // elevation looking north (+Y)
        this.camera.position.set(0, -dist, 0);
        this.camera.up.set(0, 0, 1);
        break;
      case 'side':  // elevation looking along easting
        this.camera.position.set(dist, 0, 0);
        this.camera.up.set(0, 0, 1);
        break;
      case 'iso':
      default:
        this.camera.position.set(dist * 0.85, -dist * 0.85, dist * 0.7);
        this.camera.up.set(0, 0, 1);
        break;
    }
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Raise (+) or lower (-) the camera vertically along world Z. Moves both the
   * eye and the look-at target so it is a straight vertical pan (elevation),
   * not a tilt.
   * @param {number} meters  absolute scene units (metres) to move; +up / -down
   */
  panElevation(meters) {
    if (!this.camera) return;
    if (!this.target) this.target = new THREE.Vector3(0, 0, 0);
    const step = meters || 0;
    this.camera.position.z += step;
    this.target.z += step;
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Orbit the camera position around the current target pivot.
   * The pivot stays fixed; the eye moves on an arc around it.
   * Yaw is about world Z (up), pitch is about the camera right axis.
   * @param {number} yaw    radians, + = orbit left, - = orbit right
   * @param {number} pitch  radians, + = orbit up,   - = orbit down
   */
  orbitEye(yaw, pitch) {
    if (!this.camera) return;
    if (!this.target) this.target = new THREE.Vector3(0, 0, 0);
    const pivot = this.target.clone();
    const offset = new THREE.Vector3().subVectors(this.camera.position, pivot);
    if (offset.lengthSq() < 1e-10) offset.set((this.modelRadius || 50), 0, 0);
    const up = new THREE.Vector3(0, 0, 1);

    // Yaw about world up.
    if (yaw) offset.applyAxisAngle(up, yaw);

    // Pitch about the camera's right axis, clamped near poles.
    if (pitch) {
      const viewDir = offset.clone().multiplyScalar(-1).normalize();
      const right = new THREE.Vector3().crossVectors(viewDir, up).normalize();
      if (right.lengthSq() > 1e-8) {
        const rotatedOffset = offset.clone().applyAxisAngle(right, pitch);
        const rotatedViewDir = rotatedOffset.clone().multiplyScalar(-1).normalize();
        if (Math.abs(rotatedViewDir.dot(up)) < 0.999) offset.copy(rotatedOffset);
      }
    }

    this.camera.position.copy(pivot).add(offset);
    this.camera.up.set(0, 0, 1);
    this.target.copy(pivot);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Slide the camera horizontally in the ground plane, moving both the eye and
   * the look-at target together (a strafe/dolly, not a rotation). Forward is the
   * horizontal projection of the current view direction; right is perpendicular.
   * @param {number} rightFrac    fraction of model radius to move right (+) / left (-)
   * @param {number} forwardFrac  fraction of model radius to move forward (+) / back (-)
   */
  panMove(rightFrac, forwardFrac) {
    if (!this.camera) return;
    if (!this.target) this.target = new THREE.Vector3(0, 0, 0);
    const dir = new THREE.Vector3().subVectors(this.target, this.camera.position);
    const forward = new THREE.Vector3(dir.x, dir.y, 0);
    if (forward.lengthSq() < 1e-9) forward.set(1, 0, 0);
    forward.normalize();
    const up = new THREE.Vector3(0, 0, 1);
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();
    const scale = this.modelRadius || 50;
    const move = new THREE.Vector3()
      .addScaledVector(right, (rightFrac || 0) * scale)
      .addScaledVector(forward, (forwardFrac || 0) * scale);
    this.camera.position.add(move);
    this.target.add(move);
    this.camera.lookAt(this.target);
    this.camera.updateProjectionMatrix();
  }

  /**
   * Position the camera to match a photo taken at a real-world location.
   * Places the eye at the geolocated point (at the model's elevation centre)
   * looking along the compass heading, tilted by the attitude angle.
   * @param {number} lat  WGS84 latitude
   * @param {number} lon  WGS84 longitude
   * @param {number|null} heading  compass bearing 0-360 (0=N, 90=E)
   * @param {number|null} attitude camera angle from horizontal, deg (+up, -down)
   * @param {number|null} altitude GPS altitude (m). If finite, used as the eye
   *        height; otherwise the model's elevation centre is used.
   * @returns {boolean} true if the camera was positioned
   */
  positionCameraFromGeo(lat, lon, heading, attitude, altitude) {
    const g = this.georef;
    if (!g || !this.modelToScene || !window.proj4 || !g.epsg) return false;
    if (!isFinite(lat) || !isFinite(lon)) return false;

    const def = IFCViewer.CRS_DEFS[g.epsg];
    if (def && !window.proj4.defs(g.epsg)) window.proj4.defs(g.epsg, def);

    let E, N;
    try {
      const r = window.proj4('WGS84', g.epsg, [lon, lat]);
      E = r[0]; N = r[1];
    } catch (e) {
      console.warn('positionCameraFromGeo: proj4 failed', e);
      return false;
    }

    // Invert the map affine (E/N -> true-model easting/northing metres).
    const rot = (g.rotationDeg || 0) * Math.PI / 180;
    const cosT = Math.cos(rot), sinT = Math.sin(rot);
    const scale = g.scale || 1;
    const ep = E - (g.eastings || 0);
    const np = N - (g.northings || 0);
    const xE = (ep * cosT + np * sinT) / scale;   // model easting (m)
    const yN = (-ep * sinT + np * cosT) / scale;  // model northing (m)
    // Eye height: prefer the photo's GPS altitude (metres) when present, else
    // fall back to the model's elevation centre. GPS altitude is coarse
    // (±10-30 m) and may sit on a different vertical datum than the model, so
    // the elevation arrows are provided to fine-tune afterward.
    const elev = (altitude != null && isFinite(altitude))
      ? altitude
      : (this.modelElevCenterM != null ? this.modelElevCenterM : 0);
    this.usedGpsAltitude = (altitude != null && isFinite(altitude));

    // M-space point (x=easting, y=elevation, z=-northing) -> scene coords.
    const eyeScene = new THREE.Vector3(xE, elev, -yN).applyMatrix4(this.modelToScene);

    // Direction: compass heading + attitude, built in M-space then rotated.
    const th = (heading != null && isFinite(heading) ? heading : 0) * Math.PI / 180;
    const phi = (attitude != null && isFinite(attitude) ? attitude : 0) * Math.PI / 180;
    const dirM = new THREE.Vector3(
      Math.sin(th) * Math.cos(phi),
      Math.sin(phi),
      -Math.cos(th) * Math.cos(phi)
    );
    const rotM = new THREE.Matrix3().setFromMatrix4(this.modelToScene);
    const dirScene = dirM.applyMatrix3(rotM).normalize();

    if (this.model) this.model.rotation.set(0, 0, 0);
    this.camera.up.set(0, 0, 1);
    this.camera.position.copy(eyeScene);
    const look = eyeScene.clone().addScaledVector(dirScene, this.modelRadius || 50);
    if (!this.target) this.target = new THREE.Vector3();
    this.target.copy(look);
    this.camera.lookAt(look);
    this.camera.updateProjectionMatrix();
    this.lastGeoView = { lat, lon, heading, attitude, altitude, eyeScene: eyeScene.toArray() };
    return true;
  }

  /**
   * Get the camera eye as WGS84 lat/lon using the model georeference.
   * Returns null if the model is not georeferenced.
   * @returns {{lat:number,lng:number,alt:number}|null}
   */
  getCameraGeoPosition() {
    const g = this.georef;
    if (!g || !this.sceneToModel || !window.proj4 || !g.epsg || !this.camera) return null;
    const def = IFCViewer.CRS_DEFS[g.epsg];
    if (def && !window.proj4.defs(g.epsg)) window.proj4.defs(g.epsg, def);
    const m = this.camera.position.clone().applyMatrix4(this.sceneToModel);
    const xE = m.x;       // true model easting (m)
    const yN = -m.z;      // true model northing (m)
    const alt = m.y;      // true model elevation (m)
    const rot = (g.rotationDeg || 0) * Math.PI / 180;
    const cosT = Math.cos(rot), sinT = Math.sin(rot);
    const scale = g.scale || 1;
    const eScaled = xE * scale;
    const nScaled = yN * scale;
    const ep = eScaled * cosT - nScaled * sinT;
    const np = eScaled * sinT + nScaled * cosT;
    const E = (g.eastings || 0) + ep;
    const N = (g.northings || 0) + np;
    try {
      const r = window.proj4(g.epsg, 'WGS84', [E, N]);
      return { lat: r[1], lng: r[0], alt };
    } catch (e) {
      console.warn('getCameraGeoPosition: proj4 failed', e);
      return null;
    }
  }

  /**
   * Handle mouse click on 3D objects for element selection
   */
  onMouseClick(event) {
    if (!this.renderer.domElement) return;
    // Ignore clicks that were really drags (orbit) — only select on a clean tap.
    if (this._dragDistance && this._dragDistance > 6) return;

    const rect = this.renderer.domElement.getBoundingClientRect();
    this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);

    // Only raycast the model geometry (never the axes helper / ground), and
    // pick the nearest hit that actually carries IFC element metadata.
    const target = this.model ? [this.model] : this.scene.children;
    const intersects = this.raycaster.intersectObjects(target, true);
    const hit = intersects.find(
      (i) => i.object && i.object.isMesh && i.object.userData &&
             i.object.userData.ifcExpressId != null
    );
    if (hit) this.selectElement(hit.object);
  }

  /**
   * Select an element and highlight it
   */
  selectElement(mesh) {
    if (!mesh || !mesh.material) return;
    const wasSelected = this.selectedElements.has(mesh.uuid);
    if (wasSelected) this._unhighlightMesh(mesh);
    else this._highlightMesh(mesh);

    // Set selectedElement to the mesh that was just toggled
    this.selectedElement = wasSelected ? null : mesh;
    this._emitSelection(mesh, !wasSelected);
  }

  /**
   * Get currently selected element metadata (legacy single-selection API).
   */
  getSelectedElement() {
    if (!this.selectedElement && this.selectedElements.size) {
      this.selectedElement = Array.from(this.selectedElements.values())[this.selectedElements.size - 1];
    }
    if (!this.selectedElement) return null;
    return {
      elementId: this.selectedElement.userData.elementId,
      elementName: this.selectedElement.userData.elementName,
      elementType: this.selectedElement.userData.elementType,
      ifcExpressId: this.selectedElement.userData.ifcExpressId,
      meshUUID: this.selectedElement.uuid,
    };
  }

  _matOf(mesh) {
    return mesh ? (Array.isArray(mesh.material) ? mesh.material[0] : mesh.material) : null;
  }

  _highlightMesh(mesh) {
    if (!mesh) return;
    const m = this._matOf(mesh);
    if (m && m.color) {
      if (!this.originalColors.has(mesh.uuid)) this.originalColors.set(mesh.uuid, m.color.getHex());
      m.color.copy(this.highlightColor);
    }
    this.selectedElements.set(mesh.uuid, mesh);
  }

  _unhighlightMesh(mesh) {
    if (!mesh) return;
    const m = this._matOf(mesh);
    const original = this.originalColors.get(mesh.uuid);
    if (m && m.color && original !== undefined) m.color.setHex(original);
    this.selectedElements.delete(mesh.uuid);
  }

  _selectedDetails() {
    return Array.from(this.selectedElements.values()).map((m) => ({
      elementId: m.userData.elementId,
      elementName: m.userData.elementName,
      elementType: m.userData.elementType,
      ifcExpressId: m.userData.ifcExpressId,
      meshUUID: m.uuid,
    }));
  }

  _emitSelection(mesh, toggledSelected) {
    window.dispatchEvent(new CustomEvent('ifcElementSelected', {
      detail: {
        elementId: mesh?.userData?.elementId ?? null,
        elementName: mesh?.userData?.elementName ?? null,
        elementType: mesh?.userData?.elementType ?? null,
        ifcExpressId: mesh?.userData?.ifcExpressId ?? null,
        meshUUID: mesh?.uuid ?? null,
        toggledSelected: !!toggledSelected,
        selectedElements: this._selectedDetails(),
      }
    }));
  }

  clearSelection() {
    for (const mesh of Array.from(this.selectedElements.values())) this._unhighlightMesh(mesh);
    this.selectedElement = null;
    window.dispatchEvent(new CustomEvent('ifcElementSelected', { detail: { selectedElements: [] } }));
  }

  _getTaggedSpriteTexture() {
    if (this.taggedSpriteTexture) return this.taggedSpriteTexture;
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.clearRect(0, 0, 128, 128);
    ctx.fillStyle = "rgba(30, 41, 59, 0.92)";
    ctx.beginPath();
    ctx.arc(64, 64, 54, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(165, 180, 252, 0.95)";
    ctx.lineWidth = 8;
    ctx.stroke();
    ctx.font = "700 62px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#ffffff";
    ctx.fillText("📷", 64, 67);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    this.taggedSpriteTexture = tex;
    return tex;
  }

  _clearTaggedSymbols() {
    for (const entry of this.taggedSprites) {
      if (entry && entry.sprite && entry.sprite.parent) entry.sprite.parent.remove(entry.sprite);
      if (entry && entry.material) entry.material.dispose();
    }
    this.taggedSprites = [];
  }

  _refreshTaggedSymbols() {
    this._clearTaggedSymbols();
    if (!this.model || !this.taggedExpressIds || !this.taggedExpressIds.size) return;
    const tex = this._getTaggedSpriteTexture();
    if (!tex) return;

    const meshByExpress = new Map();
    this.model.traverse((child) => {
      if (!child || !child.isMesh) return;
      const eid = child.userData && child.userData.ifcExpressId;
      if (eid == null) return;
      const key = String(eid);
      if (!meshByExpress.has(key)) meshByExpress.set(key, child);
    });

    const markerScale = Math.max(0.5, Math.min((this.modelRadius || 50) * 0.03, 6));
    for (const key of this.taggedExpressIds) {
      const mesh = meshByExpress.get(String(key));
      if (!mesh || !mesh.geometry) continue;
      if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
      const bb = mesh.geometry.boundingBox;
      if (!bb) continue;
      const center = bb.getCenter(new THREE.Vector3());
      const span = bb.getSize(new THREE.Vector3()).length() || markerScale;
      const spriteMat = new THREE.SpriteMaterial({
        map: tex,
        transparent: true,
        depthTest: true,
        depthWrite: false,
      });
      const sprite = new THREE.Sprite(spriteMat);
      sprite.position.copy(center);
      sprite.position.z += Math.max(markerScale * 0.4, span * 0.15);
      sprite.scale.set(markerScale, markerScale, 1);
      mesh.add(sprite);
      this.taggedSprites.push({ sprite, material: spriteMat });
    }
  }

  setTaggedElementIds(expressIds) {
    const ids = Array.isArray(expressIds) ? expressIds : [];
    this.taggedExpressIds = new Set(ids.filter((v) => v != null).map((v) => String(v)));
    this._refreshTaggedSymbols();
  }

  /**
   * Handle window resize
   */
  onWindowResize(containerElement) {
    if (!containerElement || !this.camera || !this.renderer) return;

    const width = containerElement.clientWidth;
    const height = containerElement.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * Animation loop
   */
  animate = () => {
    requestAnimationFrame(this.animate);
    if (this.renderer && this.scene && this.camera) {
      this.renderer.render(this.scene, this.camera);
    }
  }

  /**
   * Cleanup and destroy viewer
   */
  destroy() {
    this._clearTaggedSymbols();
    if (this.taggedSpriteTexture) {
      this.taggedSpriteTexture.dispose();
      this.taggedSpriteTexture = null;
    }
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
    if (this.renderer) {
      this.renderer.dispose();
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.model = null;
    this.selectedElement = null;
    this.selectedElements.clear();
  }
}

// Export for use in app.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = IFCViewer;
}
