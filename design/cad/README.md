# Editable CAD

`case.py` is the parameter-based CadQuery source. It generates the three
case parts and two clip coupons. All coordinates and exports use millimetres.
The `Dimensions` data class holds the main case, panel, clearance, and magnet
parameters. Component positions and clip profiles are named in the source.
Size changes can require changes to those positions. Run all checks after
an edit.

Use Python 3.12. Install the packages in `requirements.txt` in a virtual
environment. From the repository root, run:

```sh
python design/cad/case.py
python design/cad/validate.py
python design/cad/update_preview.py
python design/cad/package.py
```

The generator exports STEP files in assembly coordinates. It exports each
STL in a separate print orientation with its lowest point at Z=0. The
`all-parts.stl` file contains all five parts in those same orientations,
with a 10 mm gap between parts. Its print layout uses two rows.
The validator reads the exported files and writes `design/print/validation.json`.
The preview script embeds the exported STEP meshes in the standalone HTML.
It does not need a CDN or a web server.

Open `design/print/case-assembly.step` in a CAD application to inspect the
three parts together. The STEP files contain editable boundary geometry.
The Python source retains the construction parameters.

Run `python design/cad/low_material.py` to export and validate the alternative
with pockets on the internal faces. It writes separate files and an HTML
preview to `design/print/low-material/`. It also creates two archives with
three separate STL files each. Read [the cost guide](../COST.md).
