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
# keepWithNext stops a subheading stranding itself at the foot of a page.
H2 = S("H2", ss["Heading2"], fontName="Helvetica-Bold", fontSize=11.5, leading=15,
       textColor=INK, spaceBefore=12, spaceAfter=4, keepWithNext=1)
Cap = S("Cap", Body, fontSize=8.3, leading=11.5, textColor=MUTED, spaceBefore=4,
        spaceAfter=13)
Li = S("Li", Body, spaceAfter=4)
Note = S("Note", Body, fontSize=9.2, leading=13.2, spaceAfter=0)
Title = S("Title2", ss["Title"], fontName="Helvetica-Bold", fontSize=27, leading=32,
          textColor=INK, alignment=TA_LEFT, spaceAfter=6)
Sub = S("Sub", Body, fontSize=12.5, leading=17, textColor=MUTED, spaceAfter=2)
TocItem = S("TocItem", Body, fontSize=9, leading=14.5, spaceAfter=0)


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
    Spacer(1, 1.05 * inch),
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
    Spacer(1, 26),
    Paragraph("<b>Contents</b>", H2),
    Spacer(1, 4),
]
toc = [
    ("Part one — Setting up in the field", None),
    ("1", "Bridges: the unit of work"),
    ("2", "Clearing the app cache"),
    ("3", "Attaching the IFC model"),
    ("4", "Starting the AR view"),
    ("5", "Camera field of view"),
    ("6", "Correcting for geoid height differences"),
    ("7", "Turning on GPS"),
    ("Part two — What the app can do", None),
    ("8", "Tagging photos to model elements"),
    ("9", "Condition ratings and compliant IFC export"),
    ("10", "Geolocating photos"),
    ("11", "AprilTags: scale and measurement"),
    ("12", "Automatic crack detection"),
    ("13", "Pier scanning for photogrammetry"),
    ("14", "Stereo capture and depth maps"),
    ("15", "Report logging"),
    ("16", "Working as a pair: transferring between devices"),
    ("Part three — The rest of the toolbox", None),
    ("17", "CAD overlays (KML / KMZ)"),
    ("18", "Sketches, installing, and the debug console"),
]
# Eighteen sections plus three part headings no longer fit one column on the
# cover, so the contents runs in two: down the left, then down the right.
def toc_cell(a, b):
    if b is None:
        return Paragraph(f"<b>{a}</b>", TocItem)
    return Paragraph(
        f"<font color='#2563eb'><b>{a}</b></font>&nbsp;&nbsp;&nbsp;{b}", TocItem)


cells = [toc_cell(a, b) for a, b in toc]
split = (len(cells) + 1) // 2
left, right = cells[:split], cells[split:]
right += [""] * (len(left) - len(right))
story.append(Table(list(zip(left, right)),
                   colWidths=[CONTENT_W * 0.5, CONTENT_W * 0.5],
                   style=TableStyle([
                       ("LEFTPADDING", (0, 0), (0, -1), 0),
                       ("LEFTPADDING", (1, 0), (1, -1), 12),
                       ("RIGHTPADDING", (0, 0), (-1, -1), 0),
                       ("TOPPADDING", (0, 0), (-1, -1), 1),
                       ("BOTTOMPADDING", (0, 0), (-1, -1), 1),
                       ("VALIGN", (0, 0), (-1, -1), "TOP"),
                   ])))
story += [NextPageTemplate("body"), PageBreak()]

# ── 1. Bridges ───────────────────────────────────────────────────────────────
story += heading(1, "Bridges: the unit of work")
story += [
    Paragraph(
        "Nothing in the app is loose. Every photo, sketch, scan set, tag, IFC model, "
        "CAD overlay and report belongs to a <b>bridge</b>, and you work inside one "
        "at a time. The first screen is the list of them.", Body),
    shot("25-bridges-actions", "The four ways to get a bridge into the app."),
    Paragraph("Four ways in", H2),
    bullets([
        "<b>New bridge</b> — a blank one with a title and description you type. Fine "
        "for a structure you are only visiting once.",
        "<b>Import by NBI #</b> — pull it straight out of the National Bridge "
        "Inventory. The fastest correct option when you have the structure number.",
        "<b>Bridges Near Me</b> — for when you do not. Uses your GPS and the NBI "
        "coordinates to list what is around you.",
        "<b>Import ZIP</b> — restore a bridge someone else archived, or one from a "
        "previous device. This is the lossless path: photos, tags, comments, "
        "locations, headings, AprilTag detections, annotations and the CAD overlay "
        "all come back.",
    ]),
    Paragraph("Importing from the NBI", H2),
    steps([
        "Tap <b>Import by NBI #</b>.",
        "Pick the state. The count beside each is how many structures it holds.",
        "Paste the structure number, or several — one per line or comma separated.",
        "Tap <b>Look up</b>, check the matches, then <b>Import selected</b>.",
    ]),
    shot("27-nbi-import", "Several numbers at once is the normal case — build the "
         "day's route in one go before you leave."),
    Paragraph(
        "An imported bridge arrives titled from the NBI record, described as "
        "<i>feature crossed &middot; year built &middot; NBI number</i>, and carries "
        "the inventory coordinates as its location — which is what puts it on the map "
        "before you have taken a single photo.", Body),
    Paragraph("Finding what is around you", H2),
    Paragraph(
        "<b>Bridges Near Me</b> takes your current fix and searches the inventory "
        "around it. Set a radius in miles and a result cap; the scope defaults to "
        "auto-detecting your state, and widens to all states if you are near a line. "
        "Results come back on a map and as a list — pick one and import it.", Body),
    shot("28-nbi-near", "Radius, result cap and scope."),
    callout("The inventory is bundled, not fetched",
            "NBI data ships with the app as per-state files, so both of these work "
            "with no connection once the app is cached. The consequence is that it is "
            "a snapshot: as current as the build you are running, not as current as "
            "the FHWA's servers.",
            "note"),
    Paragraph("Working inside a bridge", H2),
    Paragraph(
        "Opening one swaps to the workspace. The banner across the top is where the "
        "bridge-level actions live.", Body),
    shot("26-bridge-banner", "Back to the list, edit the title and description, "
         "archive the whole thing to ZIP, open the 3D model, or open the "
         "device-to-device transfer panel."),
    callout("Deleting a bridge deletes its contents",
            "Removing a bridge removes its photos, sketches, scans and its stored IFC "
            "with it. The app confirms with the photo count in the prompt, but there "
            "is no undo — take a ZIP first if there is any doubt.",
            "warn"),
]

# ── 2. Clearing the app cache ────────────────────────────────────────────────
story += heading(2, "Clearing the app cache")
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
              "wrong place. Those are covered in sections 4 to 7.", Body),
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
# ── 3. Attaching the IFC ─────────────────────────────────────────────────────
story += heading(3, "Attaching the IFC model")
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
        "The projected CRS has to be one the app knows — it is a fixed list in the "
        "code, not a lookup. Currently: EPSG:7062 (Nebraska LDP, ftUS); EPSG:2264 "
        "and EPSG:32119 (North Carolina, ftUS and metric); EPSG:2263 and EPSG:32118 "
        "(New York Long Island, ftUS and metric); and EPSG:3418 and EPSG:26976 "
        "(Iowa South, ftUS and metric). A model in any other CRS will load and "
        "display, but it will not georeference, and the AR view will have nothing "
        "to anchor to — adding a zone is a code change, not a setting.", Body),
    callout("Test models",
            "The repository ships georeferenced test files under <b>test-models/</b> — "
            "a 12&nbsp;ft cube and the InfraBridge model, each built for a specific "
            "site and named for it. Use one of those to prove the workflow before you "
            "trust a production model on site.",
            "note"),
]
# ── 4. Starting the AR view ──────────────────────────────────────────────────
story += heading(4, "Starting the AR view")
story += [
    Paragraph(
        "The AR view draws the loaded model over the live camera feed, positioned from "
        "your GPS fix and oriented from the phone's compass and accelerometers. It is a "
        "sensor-driven overlay, not a tracked AR session, so it is only ever as good as "
        "the fix and the compass — which is what the controls in this section and the "
        "next two are for.", Body),
    steps([
        "Load the IFC first (section 3). Without a model there is nothing to overlay.",
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
    Paragraph(
        "One more thing has to be right before the overlay will hold still: the "
        "camera's field of view. That has a section of its own, next.", Body),
]

# ── 5. Camera field of view ──────────────────────────────────────────────────
story += heading(5, "Camera field of view")
story += [
    Paragraph(
        "Position tells the app where you are. Heading tells it which way you are "
        "looking. Field of view tells it <i>how much of the world fits on the "
        "screen</i> — and it is the setting people skip, because a wrong FOV does "
        "not look wrong when you hold still. It only shows up when you move.",
        Body),
    Paragraph("What a wrong FOV looks like", H2),
    Paragraph(
        "The renderer draws the model through a virtual camera. If that virtual "
        "camera's cone is wider than the real lens, everything in the overlay is "
        "drawn smaller and closer to the centre of frame than it should be; if it is "
        "narrower, larger and further out. Centre a pier and it will look fine. "
        "Then pan.", Body),
    bullets([
        "<b>The overlay slides the way you pan and lags behind</b> — the virtual "
        "camera is too wide. The model appears painted on a pane of glass held in "
        "front of you rather than fixed to the world.",
        "<b>The overlay runs ahead of the world</b> — too narrow. Features at the "
        "edge of frame separate from their real counterparts first.",
        "<b>The centre lines up and the edges do not</b> — this is the tell.",
    ]),
    Paragraph(
        "That last point is the diagnostic worth remembering. A position error moves "
        "the whole model together. A heading error rotates it. An FOV error is zero "
        "at the centre of the screen and grows towards the edges — so if it sits "
        "dead on the structure in the middle of frame and splays apart at the "
        "corners, stop adjusting position and heading and fix the FOV.", Body),
    shot("06c-fov-row", "The Camera FOV row in the heads-up panel. The read-out "
         "shows the angle in use and where it came from."),
    Paragraph("Measure it, do not guess", H2),
    Paragraph(
        "No web API reports a camera's field of view. "
        "<font face='Courier'>getUserMedia</font> hands back a video stream and "
        "nothing about the optics — <font face='Courier'>getSettings()</font> and "
        "<font face='Courier'>getCapabilities()</font> simply have no such member. "
        "That is why the app ships an 82° horizontal default, which is a spec-sheet "
        "figure for a typical main rear lens and not a measurement of yours.", Body),
    Paragraph(
        "<b>Measure</b> gets around it. WebXR does expose the real optics: an "
        "<font face='Courier'>immersive-ar</font> session hands back a projection "
        "matrix built from the device's own camera intrinsics, and the field of view "
        "falls straight out of two of its terms. The button opens a session for a "
        "moment, reads one frame, and closes it again. Do this once per phone — the "
        "value is saved.", Body),
    bullets([
        "It needs a user gesture, which is why it is a button rather than something "
        "that happens automatically at start-up.",
        "On Android it needs ARCore (Google Play Services for AR). Without it the "
        "button reports <i>immersive-ar unsupported</i> and you fall back to the "
        "slider.",
        "The screen flashes into an AR session and straight back out. That is "
        "expected, not a crash.",
        "One caveat: this is the FOV of the <i>XR</i> view, which need not exactly "
        "equal the video stream's — the two can pick different sensor crops. It is a "
        "far better starting point than a spec sheet, but the slider is still there "
        "to trim.",
    ]),
    Paragraph("Trimming it by hand", H2),
    Paragraph(
        "When Measure is unavailable, or afterwards to fine-tune, calibrate against "
        "the world:", Body),
    steps([
        "Find a long straight edge you can identify in both the model and the real "
        "structure — a girder, a barrier, a deck joint.",
        "Line the overlay up on it with the edge at the <b>centre</b> of the screen, "
        "using position and heading, not the FOV slider.",
        "Pan slowly so that edge travels out towards the side of the screen.",
        "If the overlay's edge falls behind the real one on the way out, the FOV is "
        "too wide — reduce it. If it runs ahead, increase it.",
        "Repeat until the edge tracks from centre to corner without separating.",
    ]),
    Paragraph(
        "The circular-arrow button at the end of the row discards the saved value "
        "and returns to the 82° default.", Body),
    callout("The camera is pinned to 1.0×",
            "The AR feed explicitly requests 1.0× zoom, which keeps it on the main "
            "lens. This matters more than it sounds: asking for the minimum "
            "available zoom would select the 0.5× ultrawide on a modern phone, whose "
            "field of view is nearer 120°. The 82° default would then be wildly "
            "wrong, and the overlay would swim about while every other setting was "
            "correct. If you trimmed the FOV slider at some earlier point, reset it "
            "and re-measure.",
            "note"),
    Paragraph("What the app derives from the number", H2),
    Paragraph(
        "What you set is the horizontal field of view of the lens. That is not what "
        "reaches the renderer — three corrections come first, which is why the "
        "read-out can differ from the figure you entered:", Body),
    bullets([
        "<b>Zoom.</b> Zoom narrows what the lens shows. The feed is normally pinned "
        "at 1.0×, but a device may clamp or refuse that, and the render angle then "
        "has to follow.",
        "<b>Stream shape.</b> A spec FOV is quoted across the sensor's long axis — "
        "vertical for a portrait stream, horizontal for a landscape one — so the "
        "conversion uses the stream's native aspect ratio, not the screen's.",
        "<b>Cover crop.</b> The video is displayed with "
        "<font face='Courier'>object-fit: cover</font>, which crops whichever axis "
        "overflows. A display wider than the stream crops height, and cropped height "
        "changes the visible vertical field of view.",
    ]),
    Paragraph(
        "Only after all three does the result become the renderer's vertical FOV. "
        "The practical consequence: <b>a value trimmed in portrait is not "
        "automatically right in landscape</b>, because the crop differs. If you "
        "rotate the phone and the overlay stops tracking, that is why — trim it in "
        "the orientation you actually work in.", Body),
]
# ── 6. Geoid ─────────────────────────────────────────────────────────────────
story += heading(6, "Correcting for geoid height differences")
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
# ── 7. GPS ───────────────────────────────────────────────────────────────────
story += heading(7, "Turning on GPS")
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
        "of, condition ratings that go back into the IFC, photos that know where they "
        "were taken, measurements off a photograph with no tape, image sets a "
        "photogrammetry pipeline can use — and the report that comes out of all of "
        "it.", Lead),
    PageBreak(),
]

# ── 8. Tagging ───────────────────────────────────────────────────────────────
story += heading(8, "Tagging photos to model elements")
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
# ── 9. Condition ratings ─────────────────────────────────────────────────────
story += heading(9, "Condition ratings and compliant IFC export")
story += [
    Paragraph(
        "Tagging a photo to an element says <i>this is a picture of that column</i>. "
        "Rating an element says <i>that column is a 5</i>. The second is what an "
        "owner's asset system actually wants, and the app writes it back into the IFC "
        "as standard property sets.", Body),
    Paragraph("Rating elements", H2),
    steps([
        "Open the 3D viewer with the model loaded and click the element, or several.",
        "Type the rating in <b>Condition rating</b>. It takes an NBI-style number or "
        "a word — <i>6</i> or <i>Fair</i> both work.",
        "Tap <b>Apply to selected element(s)</b>. The summary line underneath "
        "confirms what was written and to how many elements.",
    ]),
    shot("24-psets", "Element ratings on top, the model-wide inspection record "
         "underneath."),
    Paragraph(
        "That second card is written once per model rather than per element: "
        "inspection date, inspector name and firm. <b>Add inspection property set</b> "
        "attaches it at project level, so the exported file carries who did the "
        "inspection and when.", Body),
    Paragraph("Seeing the ratings", H2),
    Paragraph(
        "<b>Condition assignment view</b> recolours the model by rating, which turns "
        "a column of numbers into something you can read at a glance — and makes it "
        "obvious which elements you have not got to yet.", Body),
    shot("23-condition-view", "The toggle and its legend: 0-3 critical, 4-5 poor, "
         "6-7 fair, 8-9 good."),
    Paragraph("Which elements have photographs", H2),
    Paragraph(
        "<b>Tagged elements</b> on the toolbar lists every element in the bridge that "
        "has photos tagged to it, with a thumbnail strip and a count against each. "
        "Click a thumbnail to jump to the photo. It is the quickest way to see the "
        "coverage you have — and the gaps.", Body),
    shot("29-tagged-elements", "Empty until you tag something; section 8 covers the "
         "tagging itself."),
    Paragraph("Exporting", H2),
    Paragraph(
        "<b>Export compliant IFC</b> takes the original model text and appends real "
        "IFC entities to it — an <font face='Courier'>IfcPropertySet</font> plus an "
        "<font face='Courier'>IfcRelDefinesByProperties</font> per write. Element "
        "ratings go out as "
        "<font face='Courier'>Pset_BridgeInspectionElementCondition</font> attached to "
        "the element; the inspection record goes out as "
        "<font face='Courier'>Pset_BridgeInspection</font> attached to the project.",
        Body),
    steps([
        "Tap <b>Export compliant IFC</b>.",
        "Check the preview — it says how many project-level and element-level sets "
        "are about to be written.",
        "Confirm. The file downloads as "
        "<i>&lt;bridge&gt;-inspection-psets-&lt;date&gt;.ifc</i>.",
    ]),
    callout("It needs the original file, and something to write",
            "The export re-reads the source IFC text so the output is the real model "
            "with your property sets added, not a stripped-down re-emit — so have the "
            "original to hand. And it refuses to run with nothing to export: add at "
            "least one condition rating or the inspection metadata first, or you get "
            "<i>No IFC property sets to export yet</i>.",
            "note"),
]

# ── 10. Geolocating photos ────────────────────────────────────────────────────
story += heading(10, "Geolocating photos")
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
    Paragraph("Seeing the whole day at once", H2),
    Paragraph(
        "<b>Map summary</b> in the header opens every geolocated photo in the bridge "
        "on one satellite map. Each photo is an arrow pointing the way the camera was "
        "facing, so the coverage pattern is visible at a glance — which faces you "
        "worked and which you circled without shooting. Click a marker to open the "
        "photo with its metadata beside it.", Body),
    Paragraph(
        "It also draws the loaded IFC's footprint and its projection onto the map, and "
        "restores the bridge's CAD overlay underneath — so photo positions can be read "
        "against the model and the drawing rather than against bare imagery. "
        "Overlays are covered in section 17.", Body),
    shot("36-header", "Map summary sits next to the build number in the header."),
]
# ── 11. AprilTag ──────────────────────────────────────────────────────────────
story += heading(11, "AprilTags: scale and measurement")
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
# ── 12. Crack detection ──────────────────────────────────────────────────────
story += heading(12, "Automatic crack detection")
story += [
    Paragraph(
        "Every photo card carries a <b>Cracks</b> button. It runs a detector over the "
        "image, paints what it finds in red on top, and reports the cracked area as a "
        "percentage of the frame.", Body),
    shot("30-crack-bar", "The control strip, over the photo. The percentage is live — "
         "it re-runs as you move the sensitivity slider."),
    bullets([
        "<b>Sensitivity</b> — the whole point of the slider is that you sweep it. "
        "Wind it up until noise appears, back off until only the real features "
        "survive, and read the number there.",
        "<b>Ignore vertical lines</b> — on by default. Form lines, lift joints and "
        "conduit runs are vertical and get picked up as cracks otherwise. Turn it off "
        "when you are actually looking at vertical cracking.",
        "<b>Save</b> — composites the red overlay onto the full-resolution photo and "
        "downloads it. The original photo in the app is untouched.",
        "<b>Hide</b> / <b>Show</b> — toggle the overlay so you can compare against the "
        "bare image.",
    ]),
    Paragraph(
        "It runs on whichever version of the photo is on display, so if you have "
        "rectified a shot with the grid tool the detector sees the rectified image — "
        "which is the one you want, because in a rectified frame the percentage means "
        "something geometrically.", Body),
    callout("A screening aid, not a measurement",
            "The percentage is cracked <i>area of the frame</i>, so it depends on how "
            "close you stood and what else is in shot. It is good for ranking which "
            "faces need attention and for showing that something changed between "
            "cycles at the same standoff. It is not a crack width, and it should not "
            "go into a report as one. For widths, put an AprilTag in frame and "
            "measure off the photo — section 11.",
            "warn"),
]

# ── 13. Pier scanning ─────────────────────────────────────────────────────────
story += heading(13, "Pier scanning for photogrammetry")
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


# ── 14. Stereo and depth ─────────────────────────────────────────────────────
story += heading(14, "Stereo capture and depth maps")
story += [
    Paragraph(
        "With a second camera attached, the app can capture a stereo pair and turn it "
        "into a depth map and a point cloud stored alongside the photograph. This is "
        "the most involved feature in the app and the one with a hard external "
        "dependency, so read the box below before you plan a day around it.", Body),
    callout("This needs a depth server running",
            "The stereo pipeline does not run in the browser. It talks to a local "
            "depth server over a WebSocket on <font face='Courier'>localhost:8765</font>, "
            "and that server is a separate program that is <b>not</b> shipped in this "
            "repository. Without it, Depth map mode connects to nothing and the depth "
            "controls do nothing. Everything else in this guide works standalone; this "
            "section does not.",
            "warn"),
    Paragraph("Setting the cameras up", H2),
    steps([
        "Open <b>Settings</b>, then the <b>Camera</b> card.",
        "Pick the <b>Main camera</b> if the device offers more than one. "
        "<b>Flip camera</b> swaps front and rear.",
        "Pick the <b>2nd camera</b> and tap <b>Start 2nd</b>. Its preview appears "
        "beside the main one.",
        "Tick <b>Depth map mode</b>. The second camera is treated as the right eye, "
        "so mount it to the right of the main one.",
    ]),
    shot("31-camera-depth", "The Camera card with a second camera running and depth "
         "mode on."),
    bullets([
        "<b>Depth detail</b> — sharp against filled. Sharp keeps edges honest and "
        "leaves holes where the match failed; filled interpolates across them and "
        "looks better at the cost of inventing surface.",
        "<b>Depth cutoff</b> — 0.25 m to 4 m. Everything beyond it is discarded, which "
        "keeps a pier face from being buried under the background behind it.",
    ]),
    Paragraph("Calibrating the pair", H2),
    Paragraph(
        "Stereo depth is metric only if the geometry of the pair is known. Two ways "
        "to supply it:", Body),
    shot("32-stereo-calib", "Enter known intrinsics, or let the checkerboard routine "
         "solve for them."),
    bullets([
        "<b>Type the numbers</b> — focal length in pixels, baseline in millimetres, "
        "the principal point, and the disparity search range. Use this when you have "
        "a spec sheet or a previous calibration.",
        "<b>Auto-calibrate with checkerboard</b> — show a <b>9&times;6 inner-corner</b> "
        "checkerboard (that is 10&times;7 squares) to <b>both</b> lenses at once. It "
        "collects 15 frames; tilt and move the board between them rather than holding "
        "it still, and fill different parts of the frame.",
    ]),
    Paragraph(
        "Baseline is the measurement people get wrong: it is the distance between the "
        "two lens centres, and an error there scales every depth you produce.", Body),
    Paragraph("What a capture stores", H2),
    Paragraph(
        "In depth mode a capture writes three things against one record — the "
        "photograph, the depth map as an image, and a PLY point cloud. All three go "
        "into the bridge ZIP, the depth map under "
        "<font face='Courier'>images/</font> and the cloud under "
        "<font face='Courier'>pointclouds/</font>, so the pair can be taken into "
        "whatever you use downstream. The report generator can also export the depth "
        "map instead of the photo for a given figure, which is occasionally the "
        "clearer illustration of a spall.", Body),
]

# ── 15. Report logging ───────────────────────────────────────────────────────
story += heading(15, "Report logging")
story += [
    Paragraph(
        "Photos belong to a bridge, and the report is generated per bridge, from "
        "the photos in it. The generator is not a dumb photo dump: it sorts the "
        "photos into report sections and writes a caption for each one, both "
        "driven by the tags you put on the photo. Tagging as you shoot is what "
        "makes the report come out right.", Body),
    Paragraph("Tag as you go", H2),
    Paragraph("Four tag groups. Two of them decide the report's structure.", Body),
    bullets([
        "<b>General</b> - Elevation, Approach, Isometric. Any of these sends the "
        "photo to the front of the report.",
        "<b>Issues</b> - General Defect, Spalling, Cracking, Delamination, Joint "
        "damage, Impact. Any of these sends the photo to the defects section.",
        "<b>Structure in Photo</b> - Substructure, Superstructure, Deck, Barrier, "
        "Joints, Guardrail, Approach Slab, Drainage. Recorded on the photo, not "
        "used for sorting.",
        "<b>Direction</b> - the eight compass points. Feeds the \u201clooking "
        "North\u201d half of a general-view caption and the arrow on the location "
        "map. If you leave it blank the photo\u2019s own compass heading is used, "
        "so it is only worth setting when the heading is wrong or missing.",
    ]),
    shot("15-tag-picker", "The tag picker. Tags are multi-select - a photo can be "
         "both Substructure and Spalling."),
    Paragraph("How photos are sorted and captioned", H2),
    Paragraph(
        "Each photo lands in exactly one section, in this priority order:", Body),
    bullets([
        "<b>General Views</b> - anything with a General tag, ordered Elevation, "
        "then Approach, then Isometric, then by capture time. Caption: "
        "\u201cBridge Elevation View looking North\u201d and the like, built from "
        "the General tag and the direction.",
        "<b>Observed Defects</b> - anything left with an Issues tag. Caption: "
        "<b>your comment, used verbatim</b>. With no comment it falls back to "
        "\u201cDefect: Spalling, Cracking\u201d - readable, but not a finding. "
        "This is the single highest-value habit in the app: write the comment on "
        "the defect photo and the report writes itself.",
        "<b>Additional Photographs</b> - everything else. Caption: the comment, "
        "else \u201cView looking Southwest\u201d, else \u201cSite photograph\u201d.",
    ]),
    Paragraph("Preview and reorder before generating", H2),
    steps([
        "Tap <b>Word Report</b> on the toolbar. It opens a preview rather than "
        "generating straight away.",
        "Set the bridge name / subtitle if you want one on the title block.",
        "Tick <b>Include a location map</b> to put a satellite thumbnail with a "
        "camera-direction arrow under every photo.",
        "Adjust the running order: the arrows reorder within a section, the "
        "section menu moves a photo to a different one, the image menu picks which "
        "capture is exported when a photo has more than one, and the cross leaves a "
        "photo out entirely.",
        "Tap <b>Generate .docx</b>.",
    ]),
    shot("16-report-toolbar", "The report toolbar."),
    shot("17-report-options", "Title-block subtitle and the location-map toggle."),
    shot("18-report-sections", "The ordering view. Note the captions: they are "
         "derived, and they re-derive when you move a photo to another section - "
         "drop a general view into Observed Defects and its caption becomes the "
         "comment."),
    callout("Save the layout",
            "<b>Save layout</b> stores the running order on the bridge. Next time "
            "you open the report it is reused, as long as the set of photos is "
            "exactly the same. Add or delete a photo and the layout is rebuilt from "
            "the tags, so save the layout last.",
            "note"),
    Paragraph("What comes out", H2),
    Paragraph(
        "A .docx, generated entirely on the device - nothing is uploaded. US "
        "Letter, one-inch margins, Calibri, images fitted to about 480 by 600 "
        "points, figures numbered per section. It opens in Word for editing, which "
        "is the point: the app produces the photo log, you write the assessment "
        "around it.", Body),
    callout("Location maps need a connection",
            "The map thumbnails are Esri satellite tiles at zoom 18 with the "
            "roads and place-names overlays composited on top, fetched at "
            "generation time. Generate the report in signal. Without a connection "
            "each map degrades to a schematic direction arrow on a plain "
            "background rather than failing the export, and a photo with no GPS "
            "location gets no map at all.",
            "warn"),
    Paragraph("The raw archive", H2),
    Paragraph(
        "<b>Download ZIP</b> on the bridge banner is the other half of reporting. "
        "It writes out every image - primary, secondary, depth map, deskewed "
        "versions, annotation overlays - plus point clouds, any KML overlay, and "
        "both a <font face='Courier'>metadata.json</font> and a "
        "<font face='Courier'>metadata.csv</font> carrying comment, tags, location, "
        "heading, attitude and AprilTag detections for every photo. That is the "
        "file to keep for the record, and the one to hand to anyone who wants the "
        "data rather than the document.", Body),
]

# ── 16. Transfer between devices ─────────────────────────────────────────────
story += heading(16, "Working as a pair: transferring between devices")
story += [
    Paragraph(
        "The intended two-person setup: the lead inspector works the structure with "
        "a phone, taking photographs; a note taker follows with a tablet, receiving "
        "each photo as it is taken and writing it up on a bigger screen while the "
        "lead keeps moving. The link is direct between the two devices over WebRTC "
        "- the photos never touch a server.", Body),
    Paragraph("Roles", H2),
    callout("The receiver is the Base",
            "This trips people up. <b>Base</b> is the <i>receiver</i> and drives "
            "the pairing; <b>Rover</b> is the <i>sender</i>. So the note taker\u2019s "
            "tablet is the Base, and the lead inspector\u2019s phone - the one "
            "actually taking pictures - is the Rover.",
            "note"),
    shot("19-transfer-role", "Set the role first. Everything else is greyed or "
         "refused until the role matches what you are trying to do."),
    Paragraph("Pairing the two devices", H2),
    Paragraph(
        "There is no signalling server, so the two devices have to exchange their "
        "connection descriptions by hand. The QR route is much faster than typing.",
        Body),
    steps([
        "Both devices: open <b>Transfer</b> and set the role - tablet to Base, "
        "phone to Rover.",
        "<b>Tablet (Base):</b> tap <b>1) Create offer</b>, then "
        "<b>Show local as QR</b>.",
        "<b>Phone (Rover):</b> tap <b>Scan QR to remote</b> and read the "
        "tablet\u2019s code, then <b>2) Apply offer + create answer</b>, then "
        "<b>Show local as QR</b>.",
        "<b>Tablet (Base):</b> tap <b>Scan QR to remote</b>, read the phone\u2019s "
        "code, then <b>3) Apply answer</b>.",
        "Watch the status line settle on <b>Transfer link: connected</b>.",
    ]),
    shot("20-transfer-steps", "The three pairing steps, in order. Each device only "
         "uses the ones for its role."),
    shot("22-transfer-state", "Connected. The log pane underneath records every "
         "state change and every file, which is where to look when it does not."),
    Paragraph(
        "If a camera will not read the code, <b>Copy local SDP</b> and paste it "
        "into the other device\u2019s <b>Remote SDP</b> box by any means you like. "
        "<b>Reset transfer session</b> tears everything down so you can start the "
        "sequence again, which is usually quicker than debugging a half-open link.",
        Body),
    Paragraph("Sending photos", H2),
    Paragraph(
        "The moment the link opens, the Base sends the active bridge across and the "
        "Rover opens it - creating it locally first if the phone has never seen it. "
        "Both devices are then filing into the same bridge. <b>Sync bridge to "
        "rover</b> re-sends it if the lead switches bridges.", Body),
    Paragraph("On the phone, the sending device:", Body),
    bullets([
        "<b>Auto-send new captures</b> - the setting that makes the workflow work. "
        "Every photo goes across as it is saved, with no extra tap. The choice is "
        "remembered between sessions.",
        "<b>Send from app photos</b> - pick from what is already stored, for "
        "catching the tablet up on a backlog.",
        "<b>Select photos to send</b> - send files from the device that were never "
        "captured in the app.",
    ]),
    shot("21-transfer-send", "The sender controls. These appear only in the Rover "
         "role."),
    Paragraph(
        "Files are chunked with backpressure handling, so a big photo will not "
        "swamp the channel, and each one is hashed - re-sending the same image to "
        "the same bridge is skipped rather than duplicated.", Body),
    callout("Only the image crosses the link",
            "This is the one thing to plan around. The transfer carries the image "
            "bytes and the capture time - <b>not</b> the GPS location, the heading, "
            "the tags, or the AprilTag detections. A received photo lands on the "
            "tablet with no position, no tags, and a placeholder comment of "
            "\u201cTransferred from rover: \u2026\u201d. So a report generated on "
            "the tablet will have no location maps and no "
            "\u201clooking North\u201d captions for transferred photos unless the "
            "note taker fills them in.",
            "warn"),
    Paragraph("So decide which device holds the record", H2),
    Paragraph(
        "Two workable patterns, and it is worth picking one before you start rather "
        "than discovering the difference at the end of the day:", Body),
    bullets([
        "<b>Tablet writes the report.</b> The note taker is going to be typing "
        "anyway - so they type the comment, which becomes the defect caption "
        "verbatim, and set the tags, which decide the sections. Accept that "
        "transferred photos carry no GPS. This is the faster pattern and it is what "
        "the live link is for.",
        "<b>Phone holds the record.</b> Use the tablet as a live second screen for "
        "review only, and at the end of the day move the whole bridge across with "
        "<b>Download ZIP</b> on the phone and <b>Import ZIP</b> on the tablet. That "
        "path is lossless - locations, headings, tags, comments, AprilTags, "
        "annotations and overlays all come with it - and it is the one to use when "
        "the report needs location maps.",
    ]),
    callout("It works with no signal",
            "The link is peer-to-peer. It tries a public STUN server while "
            "gathering candidates, but gives up after eight seconds and proceeds "
            "regardless - so two devices on the same Wi-Fi, or on one phone\u2019s "
            "hotspot, pair and transfer with no internet at all. Which is the point, "
            "under a bridge.",
            "note"),
]

# ── Part three divider ───────────────────────────────────────────────────────
story.append(PageBreak())
story += [
    Spacer(1, 0.9 * inch),
    Paragraph("Part three", Sub),
    Paragraph("The rest of the toolbox", Title),
    Spacer(1, 8),
    Table([[""]], colWidths=[2.2 * inch], rowHeights=[2.6],
          style=TableStyle([("BACKGROUND", (0, 0), (-1, -1), ACCENT)])),
    Spacer(1, 18),
    Paragraph(
        "Smaller things that do not belong to any one workflow, but that you will "
        "want at some point: getting your own drawings onto the maps, drawing a "
        "sketch when a photograph will not do, installing the app properly, and "
        "getting an error log out of it when something misbehaves.", Lead),
    PageBreak(),
]

# ── 17. CAD overlays ─────────────────────────────────────────────────────────
story += heading(17, "CAD overlays (KML / KMZ)")
story += [
    Paragraph(
        "You can drop your own drawing onto every map in the app — a general "
        "arrangement, a deck plan, a scour survey, anything you can get out of CAD or "
        "GIS as KML or KMZ. Once loaded it appears under the bridge map, under the "
        "photo location editor, and on the map summary, so photo positions can be "
        "read against the drawing rather than against bare satellite imagery.", Body),
    shot("33-kml-overlay", "The CAD Overlay card in Settings."),
    steps([
        "Open <b>Settings</b> and find <b>CAD Overlay (KML / KMZ)</b>.",
        "Tap <b>Load file</b> and pick a .kml or .kmz.",
        "Set the opacity so the imagery still reads underneath. The setting is "
        "remembered.",
    ]),
    Paragraph("What it handles", H2),
    bullets([
        "<b>KMZ</b> is unpacked in the browser. Images inside it are extracted and "
        "embedded, so a KMZ with a raster ground overlay works offline afterwards — "
        "nothing is fetched at draw time.",
        "<b>Ground overlays</b> both ways: an axis-aligned "
        "<font face='Courier'>LatLonBox</font>, including its rotation, and a "
        "four-corner <font face='Courier'>gx:LatLonQuad</font> for a drawing that is "
        "not north-up.",
        "<b>Vector features</b> — paths and placemarks drawn over the map.",
    ]),
    Paragraph(
        "The overlay is stored against the bridge, so each structure carries its own "
        "drawing and switching bridges switches drawings. It is included in "
        "<b>Download ZIP</b> — the original file where one was supplied, so what comes "
        "out is what went in.", Body),
    callout("Georeference it before you load it",
            "The app places the overlay exactly where the KML says to. If the drawing "
            "lands in the wrong field, the problem is upstream in whatever exported "
            "it, and no control here will fix it. Check it against the satellite "
            "basemap the first time you load it, at low opacity, before you rely on "
            "it in the field.",
            "warn"),
]

# ── 18. Odds and ends ────────────────────────────────────────────────────────
story += heading(18, "Sketches, installing, and the debug console")
story += [
    Paragraph("Sketches", H2),
    Paragraph(
        "<b>Sketch</b> on the main toolbar opens a blank canvas. Draw with a finger or "
        "a stylus — swatches, a custom colour, brush size, eraser, undo, clear.", Body),
    shot("35-sketch-toolbar", "The sketch toolbar."),
    Paragraph(
        "The important part is what happens on save: a sketch is stored as a "
        "<b>photo record</b>, with the same comment, tags and location as a "
        "photograph. So it sorts into the report through exactly the same rules — tag "
        "it with an Issue and it lands in Observed Defects with your comment as its "
        "caption. Use it for the things a camera cannot capture: a crack map across a "
        "whole face, a sketch of what is behind the fascia, a detail you can see but "
        "not photograph.", Body),
    Paragraph("Installing the app", H2),
    Paragraph(
        "<b>Install App</b> appears in the header when the browser offers it. "
        "Installing makes it a standalone app with its own icon, and it is what makes "
        "offline reliable rather than merely likely — an installed PWA keeps its cache "
        "and its stored data rather than competing with the browser's own housekeeping.",
        Body),
    shot("36-header", "The header: build number beside the title, the map summary "
         "link, Settings, Transfer, and Install App when it is available."),
    Paragraph(
        "The build number next to the title is worth knowing where to find. It is the "
        "first thing to check when something described in this guide is not where it "
        "should be — see section 2.", Body),
    Paragraph("The debug console", H2),
    Paragraph(
        "Errors that would normally land in a browser console are invisible on a "
        "phone. <b>Show error log</b> in Settings puts them on screen in a panel at "
        "the bottom, with <b>Copy</b> to put the whole log on the clipboard and "
        "<b>Clear</b> to start a fresh one.", Body),
    shot("34-debug-console", "Off by default. Turn it on before reproducing a "
         "problem, not after."),
    Paragraph(
        "When something misbehaves in the field, the useful sequence is: turn the log "
        "on, do the thing that fails, copy the log, and send it with a note of the "
        "build number. That is usually enough to identify the fault without anyone "
        "having to reproduce it on the structure.", Body),
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
