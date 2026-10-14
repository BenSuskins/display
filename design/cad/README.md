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
validator reads the exported files and writes `design/print/validation.json`.
The preview script embeds the exported STEP meshes in the standalone HTML.
It does not need a CDN or a web server.

Open `design/print/case-assembly.step` in a CAD application to inspect the
three parts together. The STEP files contain editable boundary geometry.
The Python source retains the construction parameters.
