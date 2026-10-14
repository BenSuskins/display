"""Check the generated parts, exported files, and nominal assembly clearances."""

from __future__ import annotations

import argparse
import json
from itertools import combinations
from pathlib import Path

import cadquery as cad
import trimesh
from case import DEFAULTS, block, build_coupons, build_parts, hardware_envelopes


def dimensions(shape):
    bounds = shape.BoundingBox()
    return [round(bounds.xlen, 4), round(bounds.ylen, 4), round(bounds.zlen, 4)]


def collision_volume(first, second):
    return round(first.intersect(second).Volume(), 7)


def validate(output):
    parts = build_parts()
    all_parts = {**parts, **build_coupons(parts)}
    checks = []

    def record(name, passed, evidence):
        checks.append({"check": name, "passed": bool(passed), "evidence": evidence})

    for name, shape in all_parts.items():
        record(
            f"{name}: CAD solid",
            shape.isValid() and len(shape.Solids()) == 1,
            {
                "valid": shape.isValid(),
                "solids": len(shape.Solids()),
                "volume_mm3": round(shape.Volume(), 3),
                "bounds_mm": dimensions(shape),
            },
        )
        exported = cad.importers.importStep(str(output / f"{name}.step")).val()
        relative_difference = abs(exported.Volume() - shape.Volume()) / shape.Volume()
        record(
            f"{name}: STEP round trip",
            exported.isValid()
            and len(exported.Solids()) == 1
            and relative_difference < 1e-6,
            {"relative_volume_difference": relative_difference},
        )
        mesh = trimesh.load_mesh(output / f"{name}.stl")
        record(
            f"{name}: STL mesh",
            mesh.is_watertight
            and mesh.is_winding_consistent
            and mesh.volume > 0
            and len(mesh.split()) == 1,
            {
                "watertight": mesh.is_watertight,
                "winding_consistent": mesh.is_winding_consistent,
                "connected_parts": len(mesh.split()),
                "triangles": len(mesh.faces),
                "bounds_mm": mesh.extents.round(4).tolist(),
                "minimum_z_mm": float(mesh.bounds[0, 2]),
            },
        )
        record(
            f"{name}: print bed",
            abs(mesh.bounds[0, 2]) < 1e-5,
            {"minimum_z_mm": float(mesh.bounds[0, 2])},
        )
    for (first_name, first), (second_name, second) in combinations(parts.items(), 2):
        volume = collision_volume(first, second)
        record(
            f"{first_name} / {second_name}: assembly",
            volume < 1e-5,
            {"intersection_mm3": volume},
        )
    assembly = cad.importers.importStep(str(output / "case-assembly.step")).val()
    assembly_difference = abs(
        assembly.Volume() - sum(shape.Volume() for shape in parts.values())
    )
    record(
        "assembly STEP round trip",
        assembly.isValid()
        and len(assembly.Solids()) == 3
        and assembly_difference < 0.01,
        {
            "valid": assembly.isValid(),
            "solids": len(assembly.Solids()),
            "volume_difference_mm3": assembly_difference,
        },
    )
    all_depths = [
        (shape.BoundingBox().zmin, shape.BoundingBox().zmax) for shape in parts.values()
    ]
    outer_depth = max(pair[1] for pair in all_depths) - min(
        pair[0] for pair in all_depths
    )
    record(
        "outer case dimensions",
        abs(outer_depth - 30) < 1e-5
        and dimensions(parts["front-frame"])[:2] == [120.0, 74.0],
        {"width_mm": 120, "height_mm": 74, "depth_mm": outer_depth},
    )
    for name, envelope in hardware_envelopes().items():
        for part_name, shape in parts.items():
            volume = collision_volume(shape, envelope)
            record(
                f"{name} / {part_name}: nominal clearance",
                volume < 1e-5,
                {"intersection_mm3": volume},
            )
    for horizontal in [-37, 37]:
        for side in [-1, 1]:
            blade = block(
                (horizontal, side * 37, DEFAULTS.cover_front + 3.2), (3, 8, 0.8)
            )
            frame_volume = collision_volume(parts["front-frame"], blade)
            clip_volume = collision_volume(parts["rear-cover"], blade)
            record(
                f"release slot {horizontal}, {side}",
                frame_volume < 1e-5 and clip_volume > 0,
                {
                    "wall_intersection_mm3": frame_volume,
                    "clip_contact_mm3": clip_volume,
                },
            )
    for horizontal in [-48, 48]:
        for vertical in [-26, 26]:
            magnet = (
                cad.Workplane("XY")
                .center(horizontal, vertical)
                .circle(4)
                .extrude(3)
                .translate((0, 0, DEFAULTS.back + DEFAULTS.magnet_floor + 0.1))
                .val()
            )
            volume = collision_volume(parts["rear-cover"], magnet)
            record(
                f"magnet pocket {horizontal}, {vertical}",
                volume < 1e-5,
                {
                    "intersection_mm3": volume,
                    "magnet_mm": [8, 3],
                    "floor_mm": DEFAULTS.magnet_floor,
                },
            )
    frame_coupon, cover_coupon = build_coupons(parts).values()
    volume = collision_volume(frame_coupon, cover_coupon)
    record("clip coupon assembly", volume < 1e-5, {"intersection_mm3": volume})
    report = {
        "status": "pass" if all(check["passed"] for check in checks) else "fail",
        "units": "mm",
        "material_default": "Unfilled PA12 nylon, MJF or SLS",
        "finish_request": "Vapour smoothing; supplier review of 1.5 mm clips and fit coupon",
        "physical_validation": "Not performed. The files describe a fit prototype.",
        "checks": checks,
        "unverified": [
            "Actual connector heights and jumper-wire bends",
            "Ribbon length, adapter and bend radius",
            "Antenna envelope and assembled Wi-Fi performance",
            "USB cable hood dimensions",
            "Clip force, finish effects and repeated release",
            "Magnet strength on the actual fridge",
        ],
    }
    (output / "validation.json").write_text(json.dumps(report, indent=2) + "\n")
    for check in checks:
        if not check["passed"]:
            print(f"FAIL: {check['check']}: {check['evidence']}")
    print(f"{sum(check['passed'] for check in checks)}/{len(checks)} checks pass")
    return report["status"] == "pass"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).resolve().parents[1] / "print"
    )
    arguments = parser.parse_args()
    raise SystemExit(0 if validate(arguments.output) else 1)


if __name__ == "__main__":
    main()
