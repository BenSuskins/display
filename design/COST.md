# Lower-cost case

The reported Craftcloud quote is £102. Its material, finish, shipping, and
part count are not confirmed. The following changes provide files for a
new quote. They do not predict a price.

## Upload separate parts

Craftcloud requires one part per file. Its guidance also warns that a file
with several parts can increase the quote because of the space between them.
[Read the Craftcloud guidance](https://blog.craftcloud3d.com/cancelled-orders-multiple-models-in-one-file/).

Extract one of these archives. Upload the three STL files individually.
Set the units to **millimetres** and keep the scale at **100%**.

- `case-original-separate-stls.zip`: the original three case parts.
- `case-low-material-separate-stls.zip`: the lighter three case parts.

The archives exclude the optional clip coupons. Quote the two coupon files
separately for a trial print. Do not upload `all-parts.stl` to Craftcloud.

## Alternative geometry

The alternative keeps the 120 × 74 × 30 mm case size. Pockets on the internal
faces reduce material. The visible front and rear faces stay closed.

| Part             | Original material | Alternative material | Reduction |
| ---------------- | ----------------: | -------------------: | --------: |
| Front frame      |        32.121 cm³ |           27.702 cm³ |     13.8% |
| Internal carrier |        10.863 cm³ |            2.429 cm³ |     77.6% |
| Rear cover       |        18.860 cm³ |           15.845 cm³ |     16.0% |
| Total            |        61.844 cm³ |           45.976 cm³ |     25.7% |

The front face stays 2 mm thick above the pockets. Columns retain the panel
supports. The carrier is a 1.5 mm screen rim with four clips. It has no
component trays, rails, shelves, or strap slots. The rear face stays 1.5 mm
thick inside the pockets. Cross ribs and
solid areas around the magnet pockets retain more material.

The clips, release paths, panel supports, and magnet pockets retain their
original geometry. All 105 CAD and mesh checks pass. They include checks for
unchanged features, separate solids, mesh integrity, and nominal clearance.

This is a fit prototype for **unfilled PA12**. The checks do not measure
stiffness, distortion, clip force, or print quality. Ask the supplier to review
the thinner panels and the requested finish. Print the clip pair first.
The original design stays available for comparison.

The electronics have no printed mounts in this version. Use insulation
between the boards. Keep the battery pouch clear of sharp pins and clip arms.
Keep the wires clear of the cover clips. Check that movement does not pull
the ribbon connector or prevent cover release.

Follow assembly steps 1–7 in `ASSEMBLY.md` for the screen. Replace steps 8–11
with placement of the insulated electronics behind the screen carrier.
Resume at step 12. The antenna and battery have no shelves or straps.

The alternative files and interactive preview are in `print/low-material/`.
Open its `case-mockup.html` to inspect the actual alternative geometry.

## Compare quotes

Use the same supplier, material, finish, quantity, and delivery option for
both designs. Compare the total price, including shipping and tax. The front
frame and rear cover retain their outer dimensions. The carrier becomes much
thinner. A price based mainly on frame and cover dimensions or a
minimum order charge may change little when material volume decreases.

Also compare a quote without vapour smoothing. This sacrifices the smooth
finish. A PETG version needs a separate process review; the PA12 clip checks
do not prove its performance in PETG.

Run `python design/cad/low_material.py` to rebuild and check the alternative.
Run `python design/cad/package.py` to rebuild the full delivery archive.
