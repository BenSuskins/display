"""Embed the exported STEP geometry in the offline HTML preview."""

import json
import re
from pathlib import Path

import cadquery as cad


def mesh_data(directory):
    result = {}
    for name in ["front-frame", "internal-carrier", "rear-cover"]:
        shape = cad.importers.importStep(str(directory / f"{name}.step")).val()
        vertices, triangles = shape.tessellate(0.05, angularTolerance=0.16)
        result[name] = {
            "vertices": [
                [round(value, 5) for value in vertex.toTuple()] for vertex in vertices
            ],
            "triangles": triangles,
        }
    return result


def main():
    root = Path(__file__).resolve().parents[1]
    path = root / "case-mockup.html"
    source = path.read_text()
    source = re.sub(
        r'\s*(?:<!-- prettier-ignore -->\s*)?<script id="cad-parts" type="application/json">.*?</script>',
        "",
        source,
        flags=re.DOTALL,
    )
    data = json.dumps(mesh_data(root / "print"), separators=(",", ":"))
    source = source.replace(
        '    <script>\n      "use strict";',
        f'    <!-- prettier-ignore -->\n    <script id="cad-parts" type="application/json">{data}</script>\n    <script>\n      "use strict";',
        1,
    )
    if "const CAD_PARTS" not in source:
        source = source.replace(
            "      const DEFAULTS =",
            '      const CAD_PARTS = JSON.parse(document.getElementById("cad-parts").textContent);\n      const DEFAULTS =',
            1,
        )
        source = source.replace(
            "      function shade(color, normal) {",
            CAD_RENDERER + "\n      function shade(color, normal) {",
            1,
        )
        source = source.replace(
            "      function shade(color, normal) {",
            "      function shade(color, normal) {",
            1,
        )
        boundary = "      }\n      function appendCadParts("
        source = source.replace(
            boundary,
            "        replacePrintedFaces(carrierOffset, coverOffset);\n" + boundary,
            1,
        )
    source = source.replace("Design concept</span>", "Fit prototype</span>")
    source = source.replace(
        "This file is a visual guide, not a print file.",
        "The printed parts in this view use the exported CAD geometry. Validate the first print before fitting the panel.",
    )
    source = source.replace(
        "Clip shape and movement are\n          illustrative.",
        "The CAD clip has a long arm along the cover edge. This section illustrates the hook movement.",
    )
    if "replacePrintedFaces(carrierOffset, coverOffset);" not in source:
        source = re.sub(
            r"(?m)^      }\n\s*(?=      function appendCadParts)",
            "        replacePrintedFaces(carrierOffset, coverOffset);\n      }\n\n",
            source,
            count=1,
        )
    path.write_text(source)
    print(f"Embedded STEP meshes in {path.name}")


CAD_RENDERER = """
      function appendCadParts(name, depthOffset, horizontalOffset, opacity) {
        const mesh = CAD_PARTS[name];
        const colors = { "front-frame": "#cfdbd7", "internal-carrier": "#81a9b3", "rear-cover": "#cad7dd" };
        const vertices = mesh.vertices.map(point => {
          let vertical = point[1];
          if (name === "internal-carrier" && Math.abs(point[0]) > 22 && Math.abs(point[0]) < 46.5 && Math.abs(vertical) > 30.6 && point[2] > 4.5) {
            const deflection = state.progress > 1 && state.progress < 2 ? Math.sin((state.progress - 1) * Math.PI) * 0.8 : 0;
            vertical -= Math.sign(vertical) * deflection * smooth((Math.abs(point[0]) - 22) / 23.5);
          }
          if (name === "rear-cover" && Math.abs(point[0]) > 23 && Math.abs(point[0]) < 41 && Math.abs(vertical) > 32 && point[2] > -13.7) {
            const closing = smooth((state.progress - 4) / 0.82);
            const deflection = state.releaseGuide && point[0] > 0 && vertical > 0 ? 0.7 : Math.sin(closing * Math.PI) * 0.7;
            vertical -= Math.sign(vertical) * deflection * smooth((Math.abs(point[0]) - 23) / 17.5);
          }
          return [point[0] + horizontalOffset, vertical, point[2] + depthOffset];
        });
        for (const triangle of mesh.triangles) {
          const points = triangle.map(index => vertices[index]);
          const first = points[1].map((value, coordinate) => value - points[0][coordinate]);
          const second = points[2].map((value, coordinate) => value - points[0][coordinate]);
          const normal = [first[1]*second[2]-first[2]*second[1],first[2]*second[0]-first[0]*second[2],first[0]*second[1]-first[1]*second[0]];
          const length = Math.hypot(...normal);
          if (length > 0.000001) addFace(points,normal.map(value => value / length),colors[name],opacity);
        }
      }
      function replacePrintedFaces(carrierOffset, coverOffset) {
        const printedColors = new Set(["#cfdbd7", "#81a9b3", "#638e99", "#b1c7bc", "#a6beb3", "#cad7dd", "#9cb8c6", "#839fac", "#a0adb4", "#63747c", "#4c5d5b"]);
        faces = faces.filter(face => !printedColors.has(face.color));
        appendCadParts("front-frame",0,0,state.transparent ? 0.17 : 1);
        appendCadParts("internal-carrier",carrierOffset,0,1);
        appendCadParts("rear-cover",coverOffset,-state.serviceAmount*160,state.transparent ? 0.38 : 1);
        for (const horizontal of [-48,48]) for (const vertical of [-26,26]) ring(8,8,3.99,0,0,0,-12.9+coverOffset,-15.9+coverOffset,"#a0adb4",0,1,0,horizontal-state.serviceAmount*160,vertical);
      }
"""


if __name__ == "__main__":
    main()
