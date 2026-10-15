"""Export and check an alternative with less material on the internal faces."""

import json
import re
import zipfile
from pathlib import Path

import cadquery as cad
from case import (
    DEFAULTS,
    block,
    build_parts,
    build_screen_carrier,
    carrier_beam,
    export_files,
    reflect,
    rounded_plate,
)
from update_preview import mesh_data
from validate import validate


def disc(horizontal, vertical, radius, back, front):
    return (
        cad.Workplane("XY")
        .center(horizontal, vertical)
        .circle(radius)
        .extrude(front - back)
        .translate((0, 0, back))
        .val()
    )


def build_low_material_parts(originals):
    frame_pocket = rounded_plate(114, 68, 3, DEFAULTS.bezel_back, 10.5)
    for horizontal in [-20, 20]:
        for side in [-1, 1]:
            frame_pocket = frame_pocket.cut(
                block((horizontal, side * 32.8, 9.5), (10, 4, 4))
            )
    for horizontal in [-56.2, 51.25]:
        for vertical in [-18, 18]:
            frame_pocket = frame_pocket.cut(
                block((horizontal, vertical, 9.5), (3.5, 10, 4))
            )

    cover_pocket = rounded_plate(
        110, 64, 2, DEFAULTS.back + 1.5, DEFAULTS.cover_front + 0.01
    )
    for horizontal in [-48, 48]:
        for vertical in [-26, 26]:
            cover_pocket = cover_pocket.cut(
                disc(horizontal, vertical, 7.5, DEFAULTS.back, DEFAULTS.cover_front + 1)
            )
    for size in [(2, 74, 4), (120, 2, 4)]:
        cover_pocket = cover_pocket.cut(block((0, 0, DEFAULTS.back + 1), size))
    return {
        "front-frame": originals["front-frame"].cut(frame_pocket).clean(),
        "internal-carrier": build_screen_carrier(),
        "rear-cover": originals["rear-cover"].cut(cover_pocket).clean(),
    }


def protected_regions():
    regions = {
        "front-frame": [],
        "internal-carrier": [],
        "rear-cover": [],
    }
    for horizontal in [-37, 37]:
        for side in [-1, 1]:
            regions["front-frame"].append(
                block((horizontal, side * 35, -12), (12, 10, 12))
            )
            regions["rear-cover"].append(
                block((side * 30, horizontal, -13), (30, 10, 12))
            )
    for horizontal in [-20, 20]:
        for side in [-1, 1]:
            regions["front-frame"].append(
                block((horizontal, side * 32.8, 7.4), (8, 2, 2.6))
            )
    for horizontal in [-56.2, 51.25]:
        for vertical in [-18, 18]:
            regions["front-frame"].append(
                block((horizontal, vertical, 7.6), (1.5, 8, 2.2))
            )
    for side in [-1, 1]:
        regions["internal-carrier"].append(
            cad.Compound.makeCompound(
                [reflect(carrier_beam(), horizontal, side) for horizontal in [-1, 1]]
            )
        )
        regions["rear-cover"].append(
            block((0, side * 33.4, DEFAULTS.cover_front + 3), (95, 5, 6))
        )
    for horizontal in [-48, 48]:
        for vertical in [-26, 26]:
            regions["rear-cover"].append(
                disc(horizontal, vertical, 6.5, DEFAULTS.back, DEFAULTS.back + 5)
            )
    return regions


def main():
    root = Path(__file__).resolve().parents[1]
    output = root / "print/low-material"
    originals = build_parts()
    parts = build_low_material_parts(originals)
    export_files(output, parts)
    if not validate(output, parts):
        raise SystemExit("The alternative fails the CAD checks.")

    report_path = output / "validation.json"
    report = json.loads(report_path.read_text())
    carrier = parts["internal-carrier"]
    opening = block((DEFAULTS.panel_center, 0, 5.35), (96, 54, 20))
    report["checks"].extend(
        [
            {
                "check": "screen carrier: open centre",
                "passed": carrier.intersect(opening).Volume() < 1e-5,
                "evidence": {"clear_rectangle_mm": [96, 54]},
            },
            {
                "check": "screen carrier: rim thickness",
                "passed": abs(carrier.BoundingBox().zlen - 1.5) < 1e-5,
                "evidence": {"depth_mm": round(carrier.BoundingBox().zlen, 4)},
            },
        ]
    )
    for name, regions in protected_regions().items():
        for number, region in enumerate(regions, start=1):
            removed = originals[name].cut(parts[name]).intersect(region).Volume()
            report["checks"].append(
                {
                    "check": f"{name}: protected feature {number}",
                    "passed": removed < 1e-5,
                    "evidence": {"removed_mm3": round(removed, 7)},
                }
            )
    report["status"] = (
        "pass" if all(check["passed"] for check in report["checks"]) else "fail"
    )
    report["unverified"].append("Stiffness and print distortion of the thinner panels")
    report["unverified"].append("Movement and insulation of the loose electronics")
    report_path.write_text(json.dumps(report, indent=2) + "\n")
    if report["status"] != "pass":
        raise SystemExit("A protected feature changes in the alternative.")

    comparison = {
        "units": "mm",
        "parts": [
            {
                "part": name,
                "original_cm3": round(originals[name].Volume() / 1000, 3),
                "alternative_cm3": round(shape.Volume() / 1000, 3),
                "material_reduction_percent": round(
                    100 * (1 - shape.Volume() / originals[name].Volume()), 1
                ),
            }
            for name, shape in parts.items()
        ],
        "total_material_reduction_percent": round(
            100
            * (
                1
                - sum(shape.Volume() for shape in parts.values())
                / sum(shape.Volume() for shape in originals.values())
            ),
            1,
        ),
        "price_reduction": "Unknown. Get separate-file quotes with the same material and finish.",
    }
    (output / "comparison.json").write_text(json.dumps(comparison, indent=2) + "\n")
    source = (root / "case-mockup.html").read_text()
    source = re.sub(
        r'(<script id="cad-parts" type="application/json">).*?(</script>)',
        lambda match: (
            match[1] + json.dumps(mesh_data(output), separators=(",", ":")) + match[2]
        ),
        source,
        flags=re.DOTALL,
    )
    source = source.replace("Fit prototype</span>", "Low-material prototype</span>")
    source = source.replace(
        "Household display — case study", "Household display — low-material prototype"
    )
    source = source.replace(
        "The carrier holds the panel\n            and electronics.",
        "The carrier holds the panel. The electronics have no printed mounts.",
    )
    source = source.replace(
        "The carrier holds the hardware; the ribbon stays connected.",
        "The carrier holds the screen. The electronics rest loose behind it; the ribbon stays connected.",
    )
    source = source.replace(
        "an independent internal carrier,",
        "an independent screen carrier with an open centre and four clips,",
    )
    (output / "case-mockup.html").write_text(source)

    for filename, directory in [
        ("case-original-separate-stls.zip", root / "print"),
        ("case-low-material-separate-stls.zip", output),
    ]:
        with zipfile.ZipFile(
            root / filename, "w", compression=zipfile.ZIP_DEFLATED
        ) as archive:
            for name in originals:
                archive.write(directory / f"{name}.stl", f"{name}.stl")
        with zipfile.ZipFile(root / filename) as archive:
            if archive.testzip() is not None:
                raise SystemExit("The archive integrity check fails.")
    print(json.dumps(comparison, indent=2))
    print(f"{len(report['checks'])} alternative checks pass")


if __name__ == "__main__":
    main()
