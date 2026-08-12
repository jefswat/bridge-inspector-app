# Field guide build

Generates `docs/Bridge-Inspector-Field-Guide.pdf` from the live UI, so the
screenshots in the guide are always the app as it currently looks rather than
stale crops.

Two steps.

## 1. Capture the screenshots

Serve the repo root, then drive it with Playwright:

```sh
npx http-server . -p 8099 &
node tools/guide/capture-shots.cjs 8099
```

Writes PNGs into `tools/guide/shots/`, one per UI element the guide references.
Captures are at `deviceScaleFactor: 2`, and `build-guide.py` halves them back to
points — so they land in the PDF at roughly native size and stay sharp.

If `playwright` is not resolvable from the repo, point at it:

```sh
PLAYWRIGHT_MODULE=/path/to/node_modules/playwright node tools/guide/capture-shots.cjs
```

The script unhides modals and injects representative text (a location fix, a
frame count, a filename) because a headless browser has no camera, no GPS and no
loaded model. Everything else — layout, colours, fonts, button states — is the
real thing.

Two capture quirks worth knowing, both handled in the script:

- The AR panels are translucent over a camera feed that does not exist headless,
  so they are shot one at a time with the others hidden. Otherwise the move
  controls bleed through the heads-up panel.
- `#scanHud` sits inside two hidden ancestors; unhiding it alone gives a null
  bounding box.

## 2. Build the PDF

```sh
pip install reportlab pillow
python3 tools/guide/build-guide.py
```

The build number on the cover and in the page footer is read from
`BUILD_VERSION` at the top of `app.js`, so it tracks the app automatically.

The document is built twice. The first pass records which page each section
starts on; the second draws the running header from that map. Without it every
page carries the last section's title.

## Editing the content

Prose lives in `build-guide.py` as one `story` list, in reading order.

One constraint: the PDF uses Helvetica, whose WinAnsi encoding has no glyph for
arrows, emoji, Greek letters or the U+2212 minus sign — ReportLab silently draws
a black box for each. Name controls in words instead of pasting their icon
("the circular-arrow button", not "↺"). Em dashes, curly quotes, `·`, `°`, `±`
and `×` are all fine.
