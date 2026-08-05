# Layout prototype

Goal: find out what actually reads well on this panel — font sizes, symbols,
shapes, density, fake greys — before committing to a dashboard design.

## Approach

The prototype stays awake and auto-cycles through a fixed list of demo pages.
Deep sleep is deliberately absent: holding `PanelPower` high for the whole
session removes the truncated-refresh failure mode entirely, so pages render
back to back and the only delay needed is viewing time. The timer-driven sleep
loop is preserved in commit `a505344` and comes back once a layout is chosen.

Each page draws a footer with its index, name and the build timestamp, because
an unchanged e-ink screen is never evidence that a render happened.

## Panel facts that constrain the design

- 800×480 across 4.26" is ~218 ppi. Fine detail resolves well; 1px hairlines
  are visible but light.
- 1 bit per pixel. There is no grey — only dither patterns. Page 4 measures
  which densities read as flat tone and which moiré.
- Bundled Adafruit GFX fonts cover **ASCII 0x20–0x7E only**. No `°`, no `±`,
  no arrows, no box drawing. Every symbol is a drawn primitive. Page 5 builds
  the icon set this way.
- Largest bundled size is 24pt (~34px cap height). Anything bigger is either a
  scaled GFX font (chunky but smooth-ish outline) or the scaled 5×7 builtin
  (very blocky). Page 2 compares them at matched heights.
- Library timings: full refresh 1600 ms, partial 600 ms, and the panel reports
  `hasFastPartialUpdate`. Worth exploiting later now that the power rail can
  stay up.

## Pages

| # | Page | Question it answers |
| --- | --- | --- |
| 1 | Typography ladder | Which bundled face/size is legible at glance distance? Prints measured ink height per row. |
| 2 | Big number ladder | How do we get a headline number bigger than 24pt, and which scaling looks least bad? |
| 3 | Shapes and rules | Which primitives look crisp: strokes, radii, fills, dashes, rings. |
| 4 | Tone and texture | Dither densities and hatch patterns — what passes as grey at this ppi. |
| 5 | Symbols | Drawn icon set at 16/28/48px, plus the full ASCII glyph map proving what the fonts do and do not contain. |
| 6 | Dashboard: hero | One big value plus supporting stats. Tests a glanceable layout. |
| 7 | Dashboard: dense | Agenda-style rows. Tests minimum comfortable row height and how much data fits. |
| 8 | Charts | Bars, sparkline, progress bars, ring gauge — do data marks survive 1 bit? |

## Structure

- `include/DemoPage.h` — `DemoPage { name, render }`, ink constants, screen
  geometry. Renderers take `Adafruit_GFX &` so page code knows nothing about
  GxEPD2 or the panel type.
- `src/DemoPages.cpp` — the eight renderers plus local drawing helpers
  (dither fills, drawn icons, dashed lines, right-aligned text).
- `src/main.cpp` — panel bring-up and the cycling loop only.

## Previewing without the panel

`Adafruit_GFX` is portable enough to run on the host, so the page renderers can
be compiled against a small Arduino shim and dumped straight to BMP. That turns
a 15 s round trip on the panel into a sub-second one, and it counts writes that
land outside the 800×480 canvas — which is how the clipped text and the
half-off-screen gauge below were found.

The harness lives in the scratchpad rather than the repo:
`.../scratchpad/preview/` (`shim/`, `render_pages.cpp`, `build.sh`, `crop.py`).
Worth moving into `host/` if we keep iterating on layout.

It cannot tell us anything about contrast, ghosting or how tone actually looks
at 218 ppi. Those need the panel.

## Findings from the previews

Already settled, before the panel is even involved:

- **Bundled fonts are ASCII 0x20–0x7E.** Confirmed against the font headers,
  not assumed. Every symbol on page 5 is drawn, including the degree ring.
- **A scaled GFX font beats the scaled built-in font decisively.** At a matched
  ~70 px, `FreeSansBold24pt7b` at `setTextSize(2)` keeps its letterforms while
  the built-in 5×7 at `x9` quantises them. Same font data, same flash, so there
  is no reason to use the built-in font for anything large.
- **White type needs 13/16 tone behind it.** At 10/16 it is marginal and at
  6/16 unreadable. 5×7 white type needs solid black. Corollary applied on the
  dense page: knock pill and card backgrounds out to white rather than setting
  small type on tone.
- **Black type on light tone is fine.** 12pt on a 2/16 row band reads cleanly,
  which is what makes the alternating rows work.
- **Arcs must be scan converted, not stroked.** Walking the angle and plotting
  points leaves rounding pinholes that read as moiré at any thickness above 1.
  `drawArc` tests every pixel in the bounding box against the radii instead,
  with a half-pixel tolerance so 1 px rings stay continuous.
- **Overlapping lobes need a union silhouette.** Drawing three arcs for a cloud
  leaves the arcs that fall inside neighbouring lobes visible.
  `drawLobedSilhouette` strokes the union boundary and knocks out the interior,
  which is also what puts the sun behind the cloud.
- 11 agenda rows at 32 px fill the height; 24 px would fit 15 and still read.

## Notes to fill in from looking at the screen

- Smallest comfortable body size:
- Smallest legible icon size (16 px looks marginal in preview):
- Dither densities that read as flat tone rather than pattern:
- Whether the line textures moiré on real hardware:
- Whether the continuous sweep bands:
- Chosen headline treatment:
