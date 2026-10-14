# Household display case

The case has three printed parts. Its outer size is **120 × 74 × 30 mm**.
The right border has space for the panel ribbon. The rear cover has four
release slots and four magnet pockets.

This is a fit prototype. The CAD checks prove nominal geometry and file
integrity. They do not prove the fit of your wired hardware or the printed
clip force. Print the two clip coupons before the full case if the service
allows a small trial order.

## Files for the print service

Upload these files separately. Set the units to **millimetres**. Order one
copy of each part:

| File                         | Part                                                |
| ---------------------------- | --------------------------------------------------- |
| `print/front-frame.stl`      | Front frame, panel seat, and release openings       |
| `print/internal-carrier.stl` | Panel retainer, component supports, and strap slots |
| `print/rear-cover.stl`       | Cover clips, locating lip, and magnet pockets       |

The `clip-coupon-frame.stl` and `clip-coupon-cover.stl` files form a small
trial pair. They use the same cover clip, retaining ledge, and release slot
as the full case. Print both with the same material and finish as the case.
Check closure and release before you order the full set.

Use **unfilled PA12 nylon**, preferably MJF. Request **vapour smoothing**
for a smoother finish. Request light grey if the supplier offers it. The
supplier must review the 1.5 mm clip arms, 9 × 4 mm release slots, and small
strap slots after the finish. Do not apply a thick coating over the clips.

[Protolabs describes PA12 for enclosures and snap fits](https://www.protolabs.com/en-gb/services/3d-printing/multi-jet-fusion/).
[Xometry describes vapour smoothing for PA12](https://www.xometry.com/capabilities/vapor-smoothing/).
[Formlabs describes the effect of material and clearance on snap fits](https://formlabs.com/blog/designing-3d-printed-snap-fit-enclosures/).

The STL files sit on the print bed. The STEP files retain assembly coordinates.
Do not scale the parts to fit a print bed. Print each part separately.

## Parts to obtain

- Four **8 mm diameter × 3 mm thick** disc magnets.
- Four small cable ties, about **2.5 mm wide**: two for the HAT, one for the
  XIAO, and one for the battery.
- Soft, non-conductive foam: **1 mm** for the front panel pads and **0.5 mm**
  for the rear panel pads and battery bed. Include the adhesive in that thickness.
- Thin adhesive tape for the external antenna.
- Adhesive approved for PA12 and the magnet coating.
- A small flat plastic tool for the release slots.

The magnet pockets have an **8.3 mm diameter**, a **3.3 mm depth**, and a
**1.5 mm floor**. The magnets need adhesive; the pockets do not use a press fit.

## Assemble the case

1. Inspect the printed clips and slots. Remove loose powder or supports.
2. Close and release the empty case. Confirm that all four cover clips return
   to their rest position. Stop if a clip cracks or needs excessive force.
3. Put the front frame face down on a soft surface.
4. Place four 1 mm foam pads on the inactive left and right panel borders.
   Keep the pads clear of the visible area and ribbon bond.
5. Seat the panel with its ribbon on the right. Keep the glass free of rigid pressure.
6. Place four 0.5 mm foam pads on the carrier's matching left and right supports.
7. Insert the carrier. Its separate clips engage the frame. Confirm that the
   panel stays secure when the rear cover is absent.
8. Put the HAT on the two carrier rails. Use the two pairs of strap slots to
   retain it. Leave the header, switches, and ribbon connector accessible.
9. Put the XIAO on its supports. Point USB-C toward the centre of the case.
   Use the strap slots away from RESET and BOOT.
10. Put a 0.5 mm foam pad in the battery bed. Retain the battery with a loose
    strap. Keep the pouch free of pressure from the strap or cover.
11. Attach the antenna to its shelf. Connect the wires and ribbon adapter.
    Keep the ribbon loop rounded. Keep all wires clear of the clips.
12. Test a refresh, the buttons, and USB access with the cover absent.
13. Bond the magnets into the cover pockets. Let the adhesive cure as its
    manufacturer specifies.
14. Align the cover's locating lip. Press the edges until all four hooks engage.
15. Check the magnet grip on the actual fridge. Check Wi-Fi with the case assembled.

The nominal USB plug allowance is **15 × 12 × 6 mm**. Check your cable hood
against it. Check the complete ribbon and adapter route before closing the case.

## Remove the cover

1. Remove the device from the fridge.
2. Insert a small plastic tool through a release slot.
3. Press the clip toward the centre of the case.
4. Lift that cover edge slightly as the hook clears the ledge.
5. Repeat for the other clips. Two slots sit on top; two sit underneath.
6. Lift the cover away. The carrier holds the panel and electronics.

## What the CAD checks

The report in `print/validation.json` records the checks. The checks include
valid single solids, STEP reimports, closed STL meshes, print orientation,
outer dimensions, part intersections, component envelopes, ribbon clearance,
USB plug clearance, magnet pockets, and all four release paths.

Actual connector heights, jumper-wire bends, ribbon length, adapter size,
antenna dimensions, print tolerances, clip life, finish, and magnet grip still
need a physical check. The hardware blocks in the preview show envelopes;
they do not replace the manufacturer's component CAD.
