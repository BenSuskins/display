# Display case

Open `case-mockup.html` in a browser with WebGL support. The file contains all
scripts, styles, and geometry. It makes no network requests.

Drag the case to rotate it. Scroll to zoom. Use the view buttons to inspect
the front, rear, side, or separate parts. Use the assembly slider to inspect
each step. Select **Open cover** to expose the electronics without moving the
panel or its ribbon. Select **Clip section** to inspect closure and release.
Select **Release slots** to inspect the openings and the plastic tool.

Two 9 × 4 mm slots pass through the top wall. Two pass through the bottom
wall. Each slot aligns with a cover clip. Remove the device from the fridge.
Insert a small plastic tool through a slot. Press the clip toward the centre
of the case. Lift that cover edge as the hook clears the ledge. Repeat for
the other clips. The model shows the tool holding one clip clear of its ledge.

The CAD and print files are in `print/`. Read [the assembly guide](ASSEMBLY.md)
before ordering. The editable source is in [cad/](cad/README.md).

Use [all-parts.stl](print/all-parts.stl) for one upload. It contains the three
case parts and both clip coupons, spaced 10 mm apart on the print bed.
Set the units to millimetres. Keep the parts at 100% scale.

The case has three printed parts and an outer size of 120 × 74 × 30 mm. Its
right border is wider to hold the ribbon channel. The panel geometry follows
the [Waveshare drawing](https://files.waveshare.com/wiki/4.26inch-e-Paper-HAT/4.26inch_e-Paper_User_Manual.pdf).
The [battery](https://thepihut.com/products/500mah-3-7v-lipo-battery) cell is
35 × 30 × 5 mm. The panel uses example content, not live household data.

The exploded view disconnects the ribbon. The assembled view includes a
provisional adapter and extension behind the battery. Cover removal keeps
that connection in place. The carrier and cover use separate clips.
The extra 5 mm of depth sits behind the electronics. The front frame,
panel, and carrier keep their previous positions.

The printed parts in the HTML use meshes from the exported STEP files.
The hardware blocks show approximate envelopes. The XIAO points USB-C toward
the centre of the open rear. Long clip arms run along the carrier and cover
edges. The clip section illustrates their hook movement.

The files describe a fit prototype. Confirm the wired hardware, finish, clip
force, and magnet grip on a physical print. The stated depth is the outer
depth, not the internal clearance.

## Browser checks

The checks use Playwright from the Render Service and an installed Chrome.
From the repository root, run:

```sh
NODE_PATH="$PWD/apps/server/node_modules" node apps/server/node_modules/playwright/cli.js test --config design/test/playwright.config.cjs
```

Install the Render Service dependencies first if they are absent. The checks
write results to the system temporary directory. They do not need the Render
Service to run.
