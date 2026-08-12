#!/usr/bin/env python3
"""Build the Bridge Inspector field guide PDF from the captured UI screenshots."""

import os
import re
import tempfile

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import (BaseDocTemplate, Flowable, Frame, Image,
                                KeepTogether, ListFlowable, ListItem,
                                CondPageBreak, NextPageTemplate, PageBreak,
                                PageTemplate,
                                Paragraph, Spacer, Table, TableStyle)
from PIL import Image as PILImage

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
SHOTS = os.path.join(HERE, "shots")
OUT = os.path.join(REPO, "docs", "Bridge-Inspector-Field-Guide.pdf")


def app_build():
    """Keep the guide's stated build in step with the app rather than a literal."""
    with open(os.path.join(REPO, "app.js"), encoding="utf-8") as fh:
        m = re.search(r'BUILD_VERSION\s*=\s*"([^"]+)"', fh.readline())
    return m.group(1) if m else "unknown"


BUILD = app_build()

# Cropped derivatives are build products, not sources - keep them out of the
# tree next to the captures.
TMP = tempfile.mkdtemp(prefix="guide-shots-")

INK = colors.HexColor("#111827")
MUTED = colors.HexColor("#5b6675")
ACCENT = colors.HexColor("#2563eb")
RULE = colors.HexColor("#d7dde6")
TINT = colors.HexColor("#eef2f9")
WARNBG = colors.HexColor("#fff7ed")
WARNEDGE = colors.HexColor("#f0a868")

PW, PH = letter
MARGIN = 0.8 * inch
CONTENT_W = PW - 2 * MARGIN

ss = getSampleStyleSheet()

def S(name, parent, **kw):
    return ParagraphStyle(name, parent=parent, **kw)

Body = S("Body", ss["BodyText"], fontName="Helvetica", fontSize=9.8, leading=14.2,
         textColor=INK, spaceAfter=8, alignment=TA_LEFT)
Lead = S("Lead", Body, fontSize=10.6, leading=15.5, textColor=MUTED, spaceAfter=12)
H1 = S("H1", ss["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21,
       textColor=INK, spaceBefore=0, spaceAfter=3)
H1num = S("H1num", Body, fontName="Helvetica-Bold", fontSize=9, leading=11,
          textColor=ACCENT, spaceAfter=2)
H2 = S("H2", ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=15,
       textColor=INK, spaceBefore=12, spaceAfter=4)
Cap = S("Cap", Body, fontSize=8.3, leading=11.5, textColor=MUTED, spaceBefore=4,
        spaceAfter=13)
Li = S("Li", Body, spaceAfter=4)
Note = S("Note", Body, fontSize=9.2, leading=13.2, spaceAfter=0)
Title = S("Title2", ss["Title"], fontName="Helvetica-Bold", fontSize=27, leading=32,
          textColor=INK, alignment=TA_LEFT, spaceAfter=6)
Sub = S("Sub", Body, fontSize=12.5, leading=17, textColor=MUTED, spaceAfter=2)
TocItem = S("TocItem", Body, fontSize=10, leading=16, spaceAfter=0)


def shot(name, caption, width=None, crop_w=None):
    """Screenshot flowable. Captures are 2x device pixels, so halve to points."""
    path = os.path.join(SHOTS, name + ".png")
    with PILImage.open(path) as im:
        if crop_w and im.width > crop_w:
            path = os.path.join(TMP, name + "-crop.png")
            im.crop((0, 0, crop_w, im.height)).save(path)
            pw, ph = crop_w, im.height
        else:
            pw, ph = im.size
    w = width or min(CONTENT_W, pw / 2.0)
    h = w * ph / pw
    img = Image(path, width=w, height=h)
    img.hAlign = "LEFT"
    box = Table([[img]], colWidths=[w + 12], style=TableStyle([
        ("BOX", (0, 0), (-1, -1), 0.6, RULE),
        ("BACKGROUND", (0, 0), (-1, -1), colors.white),
        ("LEFTPADDING", (0, 0), (-1, -1), 6),
        ("RIGHTPADDING", (0, 0), (-1, -1), 6),
        ("TOPPADDING", (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
    ]))
    box.hAlign = "LEFT"
    return KeepTogether([box, Paragraph(caption, Cap)])


def callout(title, text, kind="note"):
    bg, edge = (TINT, ACCENT) if kind == "note" else (WARNBG, WARNEDGE)
    inner = [Paragraph(f"<b>{title}</b>", Note), Spacer(1, 3), Paragraph(text, Note)]
    t = Table([[inner]], colWidths=[CONTENT_W], style=TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), bg),
        ("LINEBEFORE", (0, 0), (0, -1), 2.4, edge),
        ("LEFTPADDING", (0, 0), (-1, -1), 10),
        ("RIGHTPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 8),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 9),
    ]))
    t.spaceAfter = 12
    return t


def steps(items):
    return ListFlowable(
        [ListItem(Paragraph(t, Li), leftIndent=18, value=i + 1) for i, t in enumerate(items)],
        bulletType="1", bulletFontName="Helvetica-Bold", bulletFontSize=9.8,
        leftIndent=18, bulletColor=ACCENT, spaceAfter=10)


def bullets(items):
    return ListFlowable(
        [ListItem(Paragraph(t, Li), leftIndent=16) for t in items],
        bulletType="bullet", start="\u2022", bulletFontName="Helvetica",
        bulletFontSize=10, bulletOffsetY=-1, leftIndent=16,
        bulletColor=ACCENT, spaceAfter=10)


PAGE_SECTION = {}


class SectionMarker(Flowable):
    """Zero-height marker that records which page a section starts on, so the
    running header names the section you are reading rather than the last one
    in the document. Needs the two-pass build at the bottom of this file."""

    def __init__(self, title):
        super().__init__()
        self.title = title
        self.width = 0
        self.height = 0

    def draw(self):
        PAGE_SECTION[self.canv.getPageNumber()] = self.title


def heading(n, title):
    # Sections flow rather than each forcing a fresh page: a hard break after
    # every section left pages holding one orphaned paragraph. A section only
    # starts a new page when there is too little room left to be worth starting.
    return [CondPageBreak(270),
            SectionMarker(title),
            Spacer(1, 14),
            Paragraph(f"SECTION {n}", H1num),
            Paragraph(title, H1),
            Table([[""]], colWidths=[CONTENT_W], rowHeights=[1.6],
                  style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)])),
            Spacer(1, 11)]


def chrome(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 0.52 * inch,
                      "Bridge Inspector · Field Guide · build " + BUILD)
    canvas.drawRightString(PW - MARGIN, 0.52 * inch, str(canvas.getPageNumber()))
    canvas.setStrokeColor(RULE)
    canvas.setLineWidth(0.5)
    canvas.line(MARGIN, 0.68 * inch, PW - MARGIN, 0.68 * inch)
    page = canvas.getPageNumber()
    title = ""
    for p in sorted(PAGE_SECTION):
        if p <= page:
            title = PAGE_SECTION[p]
    if title:
        canvas.drawRightString(PW - MARGIN, PH - 0.6 * inch, title)
        canvas.line(MARGIN, PH - 0.7 * inch, PW - MARGIN, PH - 0.7 * inch)
    canvas.restoreState()


def cover(canvas, doc):
    canvas.saveState()
    canvas.setFillColor(ACCENT)
    canvas.rect(0, PH - 0.34 * inch, PW, 0.34 * inch, stroke=0, fill=1)
    canvas.setFont("Helvetica", 7.6)
    canvas.setFillColor(MUTED)
    canvas.drawString(MARGIN, 0.52 * inch, "Bridge Inspector · Field Guide")
    canvas.restoreState()


story = []

# ── Cover ────────────────────────────────────────────────────────────────────
story += [
    Spacer(1, 1.5 * inch),
    Paragraph("Bridge Inspector", Title),
    Paragraph("Field Guide", Title),
    Spacer(1, 10),
    Paragraph("Setting up a georeferenced IFC on site, running the AR overlay, "
              "and using the inspection tools.", Sub),
    Spacer(1, 26),
    Table([[""]], colWidths=[2.2 * inch], rowHeights=[2.6],
          style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)])),
    Spacer(1, 26),
    Paragraph(f"Application build <b>{BUILD}</b>", Body),
    Paragraph("Installed as a PWA. Works offline once cached.", Body),
    Spacer(1, 40),
    Paragraph("<b>Contents</b>", H2),
    Spacer(1, 4),
]
toc = [
    ("Part one — Setting up in the field", None),
    ("1", "Clearing the app cache"),
    ("2", "Attaching the IFC model"),
    ("3", "Starting the AR view"),
    ("4", "Correcting for geoid height differences"),
    ("5", "Turning on GPS"),
    ("Part two — What the app can do", None),
    ("6", "Tagging photos to model elements"),
    ("7", "Geolocating photos"),
    ("8", "AprilTags: scale and measurement"),
    ("9", "Pier scanning for photogrammetry"),
]
rows = []
for a, b in toc:
    if b is None:
        rows.append([Paragraph(f"<b>{a}</b>", TocItem), ""])
    else:
        rows.append([Paragraph(f"<font color='#2563eb'><b>{a}</b></font>&nbsp;&nbsp;&nbsp;{b}",
                               TocItem), ""])
story.append(Table(rows, colWidths=[CONTENT_W * 0.75, CONTENT_W * 0.25],
                   style=TableStyle([
                       ("LEFTPADDING", (0, 0), (-1, -1), 0),
                       ("TOPPADDING", (0, 0), (-1, -1), 1),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                   ])))
story += [NextPageTemplate("body"), PageBreak()]

# ── 1. Clearing the app cache ────────────────────────────────────────────────
story += heading(1, "Clearing the app cache")
story += [
    Paragraph(
        "The app is a PWA. A service worker precaches every file it needs — HTML, "
        "CSS, JavaScript, the three.js and web-ifc libraries — so it keeps working "
        "with no signal under a bridge. The cost of that is that a browser reload "
        "does not necessarily fetch new code: the service worker answers from its "
        "cache first, and only swaps in a new cache when it sees a new build.", Body),
    Paragraph(
        "Clearing the cache forces a clean download of the whole app.", Body),
    Paragraph("When to clear it", H2),
    bullets([
        "A new build has been pushed and the version in the header has not changed. "
        "The build number is shown next to the app title in the header, as "
        "<b>build " + BUILD + "</b> plus a timestamp — check it against what you expect.",
        "A control described in this guide is missing, or a button does nothing.",
        "The app behaves inconsistently after an update — half-old, half-new code is "
        "the usual cause.",
        "Rendering or geometry looks wrong in a way that a reload does not fix.",
    ]),
    Paragraph("It is not a fix for a bad GPS fix, a wrong heading, or a model in the "
              "wrong place. Those are covered in sections 3 to 5.", Body),
    Paragraph("How to clear it", H2),
    steps([
        "Open <b>Settings</b> from the header.",
        "Find the <b>App cache</b> card at the top of the settings panel.",
        "Tap <b>Clear cache &amp; reload</b>.",
        "Wait for the app to reload, then confirm the build number in the header has "
        "changed.",
    ]),
    shot("01-clear-cache", "The App cache card in Settings. Clearing the cache does not "
         "touch your data."),
    callout("Your data is safe",
            "Bridges, photos, tags, annotations and scan sets live in IndexedDB, not in "
            "the file cache, so clearing the cache leaves all of them alone. If you want "
            "a backup anyway, use <b>Download ZIP</b> on a bridge before you clear.",
            "note"),
    callout("Do this before you leave signal",
            "Clearing the cache requires a connection — it deletes the cached app and "
            "immediately re-downloads it. Do it in the truck or at the office, never "
            "standing under the structure you came to inspect.",
            "warn"),
]
# ── 2. Attaching the IFC ─────────────────────────────────────────────────────
story += heading(2, "Attaching the IFC model")
story += [
    Paragraph(
        "The IFC is loaded into the 3D viewer, and everything else — the AR overlay, "
        "element tagging, the plan view — reads from that one loaded model. Load it "
        "once per session.", Body),
    steps([
        "Open the <b>3D View</b>.",
        "Tap <b>Upload IFC file</b> and pick the .ifc from your device, or drag the "
        "file onto the viewer area.",
        "Leave <b>Skip rebar for faster loading/rendering</b> ticked unless you "
        "specifically need reinforcement geometry. Rebar can be most of the element "
        "count in a bridge model and it is the difference between a model that loads "
        "on a phone and one that does not.",
        "Wait for the status line to read <b>Loaded: &lt;filename&gt;</b>.",
    ]),
    shot("02-ifc-upload", "The upload controls. The status line underneath is the "
         "confirmation that the model is in — until it says Loaded, nothing downstream "
         "will work."),
    Paragraph("Georeferencing", H2),
    Paragraph(
        "For the AR overlay to put the model in the right place on the ground, the "
        "file has to say where in the world it is. The app reads, in this order:", Body),
    bullets([
        "<b>IfcProjectedCRS</b> — which coordinate system the model's numbers are in.",
        "<b>IfcMapConversion</b> — the eastings/northings, rotation and scale that put "
        "the model's local origin into that system.",
        "<b>IfcSite</b> RefLatitude / RefLongitude / RefElevation — the fallback "
        "position, and the source of the model's ground elevation.",
    ]),
    Paragraph(
        "The projected CRS has to be one the app knows. The supported list is currently "
        "EPSG:7062 (Nebraska LDP, ftUS), EPSG:2264 and EPSG:32119 (North Carolina, ftUS "
        "and metric), and EPSG:2263 and EPSG:32118 (New York Long Island, ftUS and "
        "metric). A model in any other CRS will load and display, but it will not "
        "georeference, and the AR view will have nothing to anchor to.", Body),
    callout("Test models",
            "The repository ships georeferenced test files under <b>test-models/</b> — "
            "a 12&nbsp;ft cube and the InfraBridge model, each built for a specific "
            "site and named for it. Use one of those to prove the workflow before you "
            "trust a production model on site.",
            "note"),
]
# ── 3. Starting the AR view ──────────────────────────────────────────────────
story += heading(3, "Starting the AR view")
story += [
    Paragraph(
        "The AR view draws the loaded model over the live camera feed, positioned from "
        "your GPS fix and oriented from the phone's compass and accelerometers. It is a "
        "sensor-driven overlay, not a tracked AR session, so it is only ever as good as "
        "the fix and the compass — which is what the controls in this section and the "
        "next two are for.", Body),
    steps([
        "Load the IFC first (section 2). Without a model there is nothing to overlay.",
        "From the main screen, tap <b>Augmented reality view</b>.",
        "Allow camera access when prompted, and location access if you have not already.",
        "Confirm the header reads <b>Camera: On</b>.",
    ]),
    shot("04-ar-button", "The entry point on the main screen."),
    shot("05-ar-header", "The AR header. <b>Use current location</b> drives the eye "
         "position from live GPS; <b>Select location</b> lets you drop a point on a map "
         "instead, which is how you rehearse a site from the office."),
    Paragraph("The on-screen controls", H2),
    Paragraph(
        "The view follows the phone by default. The control cluster at the bottom lets "
        "you nudge it when the sensors are not enough:", Body),
    bullets([
        "<b>Elevation</b> — raise or lower the eye point.",
        "<b>Turn</b> — rotate the view left or right.",
        "<b>Forward</b> — step the eye point forward or back along the view direction.",
        "<b>Reset</b>, the circular arrow — discard every manual pan, elevation, turn "
        "and zoom so "
        "the view follows the phone again. It does not re-frame the model and it keeps "
        "your heading trim.",
        "<b>Trim</b>, the compass icon — clear the standing heading correction and go "
        "back to "
        "the raw compass.",
    ]),
    shot("07-ar-controls", "Reset and Trim are deliberately separate. Reset undoes what "
         "you did this minute; Trim undoes the compass correction you calibrated earlier "
         "and probably want to keep."),
    Paragraph("Heading trim", H2),
    Paragraph(
        "Phone compasses read magnetic north and are pulled around by the steel you are "
        "standing next to. If the overlay is rotated off the real structure, turn it "
        "onto alignment with the <b>Turn</b> buttons — while the view is live, those "
        "nudges are folded into a saved heading trim rather than a temporary offset. "
        "The trim survives closing and reopening the view, so you calibrate once per "
        "site. Use <b>Trim</b> to throw it away when you move to a different structure.",
        Body),
    Paragraph("Camera field of view", H2),
    Paragraph(
        "The overlay's perspective has to match the real lens, or the model will slide "
        "against the world as you pan even when the position and heading are right. The "
        "default is 82° horizontal, which is the main rear lens on a typical phone.",
        Body),
    bullets([
        "<b>Measure</b> opens a WebXR session for a moment, reads the device's own "
        "camera projection matrix, and sets the FOV from it. Use this first — it is the "
        "only measurement that is not a guess.",
        "The slider is the manual fallback: pan across a recognisable edge and trim "
        "until the overlay stops sliding.",
        "The circular-arrow button at the end of the row discards the saved value and "
        "returns to the 82° default.",
    ]),
    callout("The camera is pinned to 1.0×",
            "The AR feed requests 1.0× zoom, which keeps it on the main lens. This "
            "matters: asking for the minimum available zoom would select the 0.5× "
            "ultrawide, whose field of view is nearer 120°, and the 82° default "
            "would then be badly wrong. If you trimmed the FOV slider before this was "
            "the case, hit the circular-arrow reset and re-measure.",
            "note"),
]
# ── 4. Geoid ─────────────────────────────────────────────────────────────────
story += heading(4, "Correcting for geoid height differences")
story += [
    Paragraph("Why the model floats or sinks", H2),
    Paragraph(
        "A phone's <font face='Courier'>getAltitude()</font> returns height above the "
        "<b>WGS84 ellipsoid</b> — a smooth mathematical figure. Survey and bridge plan "
        "elevations are <b>orthometric</b>, measured from the geoid, which is what "
        "NAVD88 approximates. The two differ by the geoid separation <i>N</i>, and "
        "across the continental US <i>N</i> is negative and large: roughly "
        "-22&nbsp;m to -34&nbsp;m.", Body),
    Paragraph(
        "The relationship is <b>H = h - N</b>, where <i>h</i> is the phone's "
        "ellipsoidal height and <i>H</i> is the orthometric elevation your model is "
        "drawn to. Uncorrected, the phone thinks it is roughly 30&nbsp;m — about "
        "100&nbsp;ft — higher than it really is, and the model appears far below you.",
        Body),
    shot("06b-ground-datum", "The Ground datum row in the AR heads-up panel. It reads "
         "<b>uncalibrated</b> until you set an offset."),
    Paragraph("Three ways to fix it", H2),
    Paragraph("All three write the same stored offset. It is regional — one value "
              "covers your whole working area — and it persists between sessions.", Body),
    bullets([
        "<b>Set here</b> — the field method. Stand on ground whose true elevation "
        "you know, tap it, and enter that elevation in feet. The app shows what the "
        "phone currently reports and stores the difference. When the model's ground came "
        "from IfcSite, it pre-fills that as a suggestion.",
        "<b>Geoid</b> — looks up <i>N</i> for your position from the NOAA NGS "
        "geoid API. Needs a connection, and covers the US.",
        "<b>N…</b> — type the separation directly, in metres, negative across the "
        "continental US. Get it from any geoid calculator before you leave the office. "
        "This is the one that works with no signal.",
    ]),
    Paragraph("The circular-arrow button at the end of the row clears the stored offset "
              "and goes back to the phone's raw altitude.", Body),
    callout("Use ground you can trust",
            "“Set here” calibrates from the ground under your feet, so pick a "
            "benchmark, a known deck elevation, or a surveyed point — not a guess off a "
            "topo map. And note the app deliberately does <i>not</i> suggest the model's "
            "lowest geometry as your standing elevation: a model with piles or footings "
            "has its minimum well below grade, and accepting that would calibrate your "
            "datum underground.",
            "warn"),
    shot("06-ar-hud", "The full heads-up panel: model opacity, camera FOV, and the "
         "ground datum row. It scrolls if it runs out of room."),
    Paragraph("Checking it worked", H2),
    Paragraph(
        "The readout at the top left shows your position and the eye elevation the app "
        "is actually using. After calibrating, that elevation should agree with the "
        "site's real elevation, and the model should sit on the ground rather than "
        "floating above or below it.", Body),
    shot("07b-ar-location", "Position and eye elevation, top left of the AR view."),
]
# ── 5. GPS ───────────────────────────────────────────────────────────────────
story += heading(5, "Turning on GPS")
story += [
    Paragraph(
        "The AR view can take its eye position from live GPS or from a point you pick on "
        "a map. Live GPS is what you want on site.", Body),
    steps([
        "Open the AR view.",
        "Tick <b>Use current location</b> in the header.",
        "Grant location permission if the browser asks. On Android, choose "
        "<b>Precise</b> — approximate location is useless for this.",
        "Watch the readout at the top left. It will show your latitude, longitude and "
        "accuracy once a fix arrives.",
    ]),
    shot("05-ar-header", "<b>Use current location</b> is remembered — tick it once and "
         "it stays ticked the next time you open the AR view."),
    shot("07b-ar-location", "A good fix. The ± figure is the accuracy the phone "
         "reports; if it is tens of metres, the overlay will be tens of metres out."),
    Paragraph("If it will not pick up a fix", H2),
    bullets([
        "The app requests a high-accuracy watch with a 30&nbsp;second timeout and no "
        "cached positions, so the first fix outdoors can genuinely take half a minute. "
        "Give it time before deciding it has failed.",
        "Stand in the open, away from the structure, until the first fix lands. Under a "
        "deck or between piers you are shielded from most of the sky.",
        "Check the site permission in the browser — a denied location permission is "
        "silent from inside the page. In Chrome: the padlock in the address bar, then "
        "Permissions.",
        "Location requires a secure context. Over HTTPS or from localhost it works; over "
        "plain HTTP it will not.",
        "Turn the phone's own Location Services on. The browser cannot override it.",
    ]),
    Paragraph("Working without GPS", H2),
    Paragraph(
        "Untick <b>Use current location</b> and tap <b>Select location</b> to drop your "
        "eye position on a map instead. This is how you rehearse a site before you get "
        "there, and it is the fallback when the fix is too poor to use — a point you "
        "place by eye off a satellite image is often better than a 40&nbsp;m fix.", Body),
    Paragraph("The plan view", H2),
    Paragraph(
        "The plan view in the bottom left corner shows the model from above with your "
        "position and view direction on it. Drag the orange dot to move yourself; drag "
        "the green dot to change the direction you are looking. Moving your position "
        "leaves the view angle alone, and vice versa. Pinch to zoom. The "
        "<b>satellite</b> button toggles an Esri satellite basemap underneath, which "
        "makes it obvious whether the model is sitting where the structure actually is "
        "— it uses mobile data.", Body),
    Paragraph("The capture screen readout", H2),
    Paragraph(
        "Outside the AR view, the main toolbar shows the same location and heading that "
        "will be written into the next photo you take.", Body),
    shot("08-capture-row", "Location, accuracy, direction and attitude, live on the "
         "main toolbar."),
]
story.append(PageBreak())

# ── Part two divider ─────────────────────────────────────────────────────────
story += [
    Spacer(1, 0.9 * inch),
    Paragraph("Part two", Sub),
    Paragraph("What the app can do", Title),
    Spacer(1, 8),
    Table([[""]], colWidths=[2.2 * inch], rowHeights=[2.6],
          style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)])),
    Spacer(1, 18),
    Paragraph(
        "Everything in part one exists to get the model standing in the right place. "
        "This part covers what that buys you: photos that know which element they are "
        "of, photos that know where they were taken, measurements off a photo with no "
        "tape, and image sets a photogrammetry pipeline can actually use.", Lead),
    PageBreak(),
]

# ── 6. Tagging ───────────────────────────────────────────────────────────────
story += heading(6, "Tagging photos to model elements")
story += [
    Paragraph(
        "A photo of a crack is worth much more when the report knows it is "
        "<i>Pier 3 Column</i> and not just a photo of concrete. Tagging links a photo to "
        "one or more IFC elements, and the link is stored with the photo.", Body),
    Paragraph("The fast path: straight after the shot", H2),
    Paragraph(
        "Take a picture and a follow-up bar appears under the toolbar. You do not have "
        "to go back through the gallery to find the photo you just took.", Body),
    shot("09-post-capture", "<b>Tag elements in 3D</b> opens the viewer with this photo "
         "already linked; <b>AR view</b> opens the overlay instead."),
    Paragraph("Selecting the elements", H2),
    steps([
        "In the 3D viewer, tap <b>Snap view to me</b>. This puts the 3D camera where you "
        "are standing, looking the way the phone is pointing — so the model on screen "
        "matches what you were photographing, and you can recognise the element you want.",
        "Click elements in the model to add them to the selection. Click again to remove "
        "one. The status line keeps a running count.",
        "Tap <b>Tag selected elements to photo</b>.",
    ]),
    shot("03-tagging-buttons", "The tagging row at the bottom of the 3D viewer."),
    shot("03b-selected-element", "The selection status line."),
    Paragraph(
        "<b>Set photo location from camera</b> does the opposite of Snap view to me: it "
        "writes the 3D camera's current position back onto the photo. Use it when you "
        "know where you were standing better than the GPS did — position the 3D view at "
        "the real spot and push that position onto the photo.", Body),
    Paragraph("Where the tags end up", H2),
    Paragraph(
        "Tagged element names are shown on the photo card and carry through into the "
        "exported report, alongside the timestamp, any comment, and any AprilTag "
        "detected in the frame.", Body),
    shot("14b-photo-meta", "A photo card's metadata: time, comment, detected tag, and "
         "the linked elements."),
]
# ── 7. Geolocating photos ────────────────────────────────────────────────────
story += heading(7, "Geolocating photos")
story += [
    Paragraph(
        "Every photo is stamped with the position and the direction the phone was "
        "pointing when it was taken. That is what lets a photo be placed on a map, "
        "matched against the model, and found again on the next inspection cycle.", Body),
    Paragraph("What is captured", H2),
    bullets([
        "<b>Position</b> — latitude, longitude and the accuracy the phone reported, from "
        "the same GPS watch the AR view uses.",
        "<b>Direction</b> — compass heading, as degrees and a cardinal point.",
        "<b>Attitude</b> — whether the phone was level, tilted up or tilted down.",
        "<b>Time</b> — capture timestamp.",
    ]),
    shot("08-capture-row", "The toolbar shows exactly what will be stamped onto the next "
         "photo. Check the accuracy figure before a shot you care about."),
    Paragraph("Reviewing and correcting it", H2),
    Paragraph(
        "Each photo card carries its own actions. <b>View/Edit map &amp; direction</b> "
        "puts the photo on a map where you can drag the position and swing the direction "
        "arrow — which is how you fix a shot taken on a poor fix, or one taken with the "
        "phone in a pocket. <b>3D View</b> opens the model from that photo's viewpoint.",
        Body),
    shot("14-photo-actions", "Per-photo actions."),
    callout("Correct the fix, not the photo",
            "If the accuracy figure was poor for a whole run of photos, it is usually "
            "faster to fix the position on the map afterwards than to stand around "
            "waiting for a better fix at the time. The direction arrow is normally "
            "right even when the position is not.",
            "note"),
]
# ── 8. AprilTag ──────────────────────────────────────────────────────────────
story += heading(8, "AprilTags: scale and measurement")
story += [
    Paragraph(
        "An AprilTag is a printed fiducial marker. Put one of known size in the frame "
        "and the photo carries its own scale bar — you can measure off the image "
        "afterwards without having held a tape against the defect.", Body),
    Paragraph("Detection", H2),
    Paragraph(
        "The app detects the <b>36h11</b> family. Detection runs live on the camera "
        "preview, so you can see before you press the shutter whether the tag is being "
        "picked up, and it runs again on the captured image and on imported images. "
        "Detected IDs are stored with the photo.", Body),
    shot("10-apriltag", crop_w=470, caption="Live detection status over the camera preview. It reports the "
         "tag IDs it can see, or that it sees none."),
    Paragraph("Setting scale and measuring", H2),
    steps([
        "Print a 36h11 tag and note the width of its <b>black square</b> — not the white "
        "paper margin around it.",
        "Photograph the defect with the tag in frame, as close to the same plane as the "
        "surface you want to measure as you can manage.",
        "Open the photo and choose annotation.",
        "Enter the tag width and its units in the toolbar, then tap "
        "<b>Set scale from tag</b>. The scale readout will show the resolved "
        "pixels-per-unit.",
        "Use <b>Measure line</b>, <b>Measure curve</b> or <b>Measure area</b> on the "
        "image. Results come out in the units you entered.",
    ]),
    shot("13-annot-toolbar", "The annotation toolbar. Tag width and units on the middle "
         "row, the measurement tools on the top row, and the resolved scale reported at "
         "the bottom left."),
    Paragraph(
        "<b>Reset scale</b> clears the calibration. Pen, text callouts, colours and the "
        "eraser are all available on the same toolbar, and the overlay is stored "
        "separately from the photo — the original image is never modified, and you can "
        "remove the overlay later.", Body),
    callout("Accuracy depends on the plane",
            "Scale from a tag is exact only in the tag's own plane. A tag lying flat on a "
            "deck will not correctly scale a crack on a vertical face, and a tag well in "
            "front of or behind the surface of interest introduces perspective error. "
            "Get the tag onto, or as near as possible to, the surface you are measuring.",
            "warn"),
    Paragraph("When you cannot place a target", H2),
    Paragraph(
        "For surfaces where you cannot fix a large physical target, the app also has a "
        "<b>grid rectify</b> tool: project a laser dot grid onto the surface, drag the "
        "on-screen grid nodes onto the dots, enter the real dot spacing in millimetres, "
        "and the image is un-skewed into a metric orthophoto. If your laser's spec sheet "
        "gives a corner-to-corner fan angle, enter it — a grid laser emits equal "
        "<i>angles</i>, so its dots spread as tan(angle) on a flat surface rather "
        "than evenly, and supplying the fan angle removes that error.", Body),
]
# ── 9. Pier scanning ─────────────────────────────────────────────────────────
story += heading(9, "Pier scanning for photogrammetry")
story += [
    Paragraph(
        "Pier scanning captures an overlapping image set of a surface for reconstruction "
        "in a photogrammetry pipeline. Rather than making you judge overlap by eye, the "
        "app watches the motion between frames and fires the shutter itself when you "
        "have moved the right amount.", Body),
    Paragraph("How it works", H2),
    bullets([
        "It tracks frame-to-frame motion at about 11&nbsp;Hz and takes a shot once the "
        "view has moved roughly a quarter of a frame — an overlap target of about 75%.",
        "Every candidate frame is checked for sharpness, and blurred frames are rejected "
        "rather than saved.",
        "Zoom, focus and exposure are locked at the start of the session where the "
        "camera supports it, so the whole set shares one set of intrinsics. This matters "
        "a great deal to the reconstruction.",
    ]),
    Paragraph("Running a scan", H2),
    steps([
        "Tap <b>Start scan</b> on the main toolbar.",
        "Let the camera settle and the locks apply.",
        "Pan slowly and steadily across the surface, keeping roughly the same standoff "
        "distance. Watch the guidance line — it will tell you if you are moving too fast.",
        "Use <b>Force frame</b> if you want a shot the automatic trigger did not take.",
        "Tap <b>Finish scan</b> when you have covered the surface.",
    ]),
    shot("12-scan-start", "<b>Start scan</b> on the main toolbar."),
    shot("11-scan-hud", "The scan HUD: guidance, frame count, a sharpness verdict, and "
         "how far you have moved towards the next automatic frame."),
    Paragraph("Getting the set out", H2),
    Paragraph(
        "Finished scans are listed under <b>Pier scans</b> on the main screen with a "
        "thumbnail strip, the frame count, the capture time and the image dimensions, "
        "and a note of whether the camera was successfully locked. "
        "<b>Download COLMAP set</b> exports the frames in the layout COLMAP expects, "
        "ready to feed straight into a reconstruction.", Body),
    callout("Technique matters more than the app",
            "Keep the standoff distance constant, keep the surface filling the frame, "
            "move slowly and steadily, and avoid changing your own shadow across the "
            "surface as you go. Two slow passes at different heights beat one fast pass. "
            "The automatic trigger cannot rescue a set shot too quickly from too many "
            "distances.",
            "note"),
]

# ── Build ────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)


def make_doc(path):
    doc = BaseDocTemplate(path, pagesize=letter,
                          leftMargin=MARGIN, rightMargin=MARGIN,
                          topMargin=MARGIN, bottomMargin=MARGIN,
                          title="Bridge Inspector - Field Guide",
                          author="Bridge Inspector")
    doc.addPageTemplates([
        PageTemplate(id="cover",
                     frames=[Frame(MARGIN, MARGIN, CONTENT_W, PH - 2 * MARGIN, id="cover")],
                     onPage=cover),
        PageTemplate(id="body",
                     frames=[Frame(MARGIN, MARGIN, CONTENT_W, PH - 2 * MARGIN - 6, id="body")],
                     onPage=chrome),
    ])
    return doc


# Pass 1 discovers which page each section lands on; pass 2 draws the running
# header from that. Building consumes the story, so each pass gets a copy.
import copy
make_doc("/dev/null").build(copy.deepcopy(story))
make_doc(OUT).build(copy.deepcopy(story))
print("wrote", OUT, "-", len(PAGE_SECTION), "sections mapped")
