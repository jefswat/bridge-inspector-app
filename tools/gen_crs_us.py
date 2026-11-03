#!/usr/bin/env python3
"""Generate crs-us.js: proj4 definitions for every projected CRS (EPSG + ESRI
authorities, including deprecated codes) whose area of use touches the USA or
its territories. Includes State Plane (all NAD83 realisations, m / ftUS / ft),
UTM, NAD27, and county systems (MnDOT county, WISCRS, Oregon OCRS, Iowa RCS,
Indiana InGCS, ...).

Usage:  pip install pyproj  &&  python3 tools/gen_crs_us.py > raw.json
then:   node tools/validate_crs_us.js raw.json > crs-us.js
(validation drops any definition the app's bundled proj4.js cannot run).
"""
import json, re, sys, warnings
from pyproj import CRS
from pyproj.aoi import AreaOfInterest
from pyproj.database import query_crs_info
from pyproj.enums import PJType

warnings.filterwarnings("ignore")

# Bounding boxes: CONUS+Alaska+Hawaii+PR/USVI, Guam/CNMI, American Samoa.
AOIS = [
    AreaOfInterest(-180, 13, -64, 72),
    AreaOfInterest(144, 13, 146.2, 21),
    AreaOfInterest(-171, -15, -168, -11),
    AreaOfInterest(172, 51, 180, 56),  # western Aleutians
]
# Keep systems whose area of use is (part of) the US or its territories, plus
# world-wide systems and WGS 84 UTM zones; drop Canada / Mexico / Russia /
# Arctic-only systems that merely overlap the bounding boxes.
US_WORDS = re.compile(
    r"USA|United States|Alaska|Hawaii|Puerto Rico|Virgin Islands|Guam|Mariana|"
    r"American Samoa|Navajo|^World", re.I)
KEEP_NAME = re.compile(r"WGS ?84.*UTM zone|UTM_Zone", re.I)

def clean(p4):
    p4 = re.sub(r"\s*\+(no_defs|type=crs)\b", "", p4)
    return re.sub(r"\s+", " ", p4).strip()

defs, names, names_dep, centres, skipped = {}, {}, {}, {}, 0
for auth in ("EPSG", "ESRI"):
    seen = {}
    for aoi in AOIS:
        for info in query_crs_info(auth_name=auth, pj_types=PJType.PROJECTED_CRS,
                                   area_of_interest=aoi, contains=False,
                                   allow_deprecated=True):
            seen[info.code] = info
    for code, info in sorted(seen.items(), key=lambda kv: int(kv[0])):
        area = info.area_of_use.name if info.area_of_use else ""
        if not (US_WORDS.search(area) or KEEP_NAME.search(info.name)):
            continue  # Canada / Mexico / Caribbean-only systems
        try:
            p4 = CRS.from_authority(auth, code).to_proj4()
        except Exception:
            skipped += 1
            continue
        if not p4:
            skipped += 1
            continue
        key = f"{auth}:{code}"
        defs[key] = clean(p4)
        # Same name on several codes: prefer the non-deprecated one.
        if info.name not in names or (names_dep.get(info.name) and not info.deprecated):
            names[info.name] = key
            names_dep[info.name] = info.deprecated
        a = info.area_of_use
        if a:  # area-of-use centre, used only by the validator
            w, e = a.west, a.east
            if e < w:
                e += 360
            lon = (w + e) / 2
            centres[key] = [((lon + 180) % 360) - 180, (a.south + a.north) / 2]
json.dump({"defs": defs, "names": names, "centres": centres}, sys.stdout, ensure_ascii=False)
print(f"{len(defs)} defs, {skipped} skipped", file=sys.stderr)
