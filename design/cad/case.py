"""Generate the three case parts in assembly coordinates, in millimetres."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path

import cadquery as cad


@dataclass(frozen=True)
class Dimensions:
    width: float = 120.0
    height: float = 74.0
    depth: float = 30.0
    wall: float = 2.0
    outer_radius: float = 6.0
    mating_clearance: float = 0.4
    front: float = 12.5
    bezel_back: float = 8.5
    opening_width: float = 93.6
    opening_height: float = 56.48
    opening_center: float = -6.0
    panel_width: float = 105.33
    panel_height: float = 62.37
    panel_thickness: float = 0.926
    panel_center: float = -2.475
    panel_back: float = 6.6
    carrier_back: float = 4.6
    carrier_front: float = 6.1
    magnet_diameter: float = 8.0
    magnet_thickness: float = 3.0
    magnet_clearance: float = 0.3
    magnet_floor: float = 1.5
    clip_thickness: float = 1.5
    release_width: float = 9.0
    release_height: float = 4.0

    @property
    def back(self) -> float:
        return self.front - self.depth

    @property
    def cover_front(self) -> float:
        return self.back + self.wall


DEFAULTS = Dimensions()


def block(center, size) -> cad.Shape:
    return cad.Workplane("XY").box(*size).translate(center).val()


def rounded_plate(width, height, radius, back, front, center=(0.0, 0.0)) -> cad.Shape:
    return (
        cad.Workplane("XY")
        .rect(width, height)
        .extrude(front - back)
        .edges("|Z")
        .fillet(radius)
        .translate((*center, back))
        .val()
    )


def combine(base: cad.Shape, additions) -> cad.Shape:
    return base.fuse(*additions).clean() if additions else base


def hook(horizontal, inner, outer, back, front, side, width=7.0) -> cad.Shape:
    profile = [
        (side * (inner - 0.05), back),
        (side * outer, back),
        (side * outer, back + 0.7),
        (side * inner, front),
    ]
    return (
        cad.Workplane("YZ", origin=(horizontal - width / 2, 0, 0))
        .polyline(profile)
        .close()
        .extrude(width)
        .val()
    )


def reflect(shape: cad.Shape, horizontal=1, vertical=1) -> cad.Shape:
    result = shape.mirror("YZ") if horizontal == -1 else shape
    return result.mirror("XZ") if vertical == -1 else result


def build_frame(dimensions=DEFAULTS) -> cad.Shape:
    body = rounded_plate(
        dimensions.width,
        dimensions.height,
        dimensions.outer_radius,
        dimensions.cover_front,
        dimensions.front,
    )
    cavity = rounded_plate(
        dimensions.width - 2 * dimensions.wall,
        dimensions.height - 2 * dimensions.wall,
        dimensions.outer_radius - dimensions.wall,
        dimensions.cover_front - 1,
        dimensions.bezel_back,
    )
    opening = rounded_plate(
        dimensions.opening_width,
        dimensions.opening_height,
        1.1,
        dimensions.bezel_back - 0.1,
        dimensions.front + 1,
        (dimensions.opening_center, 0),
    )
    body = body.cut(cavity).cut(opening)
    for horizontal in [-37, 37]:
        for side in [-1, 1]:
            slot = block(
                (horizontal, side * 36, dimensions.cover_front + 3.5),
                (dimensions.release_width, 6, dimensions.release_height),
            )
            body = body.cut(slot)
    additions = []
    for horizontal in [-37, 37]:
        for side in [-1, 1]:
            additions.append(
                block(
                    (horizontal, side * 35.775, dimensions.cover_front + 0.75),
                    (9, 2.45, 1.5),
                )
            )
    for horizontal in [-42, 42]:
        for side in [-1, 1]:
            additions.append(block((horizontal, side * 34.65, 3.45), (8, 1.5, 1.5)))
    for horizontal in [-20, 20]:
        for side in [-1, 1]:
            additions.append(block((horizontal, side * 32.8, 7.4), (8, 2, 2.6)))
    for horizontal in [-56.2, 51.25]:
        for vertical in [-18, 18]:
            additions.append(block((horizontal, vertical, 7.6), (1.5, 8, 2.2)))
    return combine(body, additions)


def carrier_beam(dimensions=DEFAULTS) -> cad.Shape:
    beam = block((32.75, 32.35, 5.35), (25.5, dimensions.clip_thickness, 1.5))
    return beam.fuse(hook(42, 33.1, 34.5, 4.6, 6.1, 1)).clean()


def build_carrier(dimensions=DEFAULTS) -> cad.Shape:
    outer = rounded_plate(
        110,
        67,
        3,
        dimensions.carrier_back,
        dimensions.carrier_front,
        (dimensions.panel_center, 0),
    )
    inner = rounded_plate(
        99,
        57,
        1,
        dimensions.carrier_back - 1,
        dimensions.carrier_front + 1,
        (dimensions.panel_center, 0),
    )
    carrier = outer.cut(inner)
    additions = []
    # The rails reach the carrier rim and leave the soldered battery pads accessible.
    for horizontal in [-44, 8]:
        additions.append(block((horizontal, 12, 3.4), (6, 39, 2.6)))
    for horizontal in [-43, -35]:
        additions.append(block((horizontal, -20, 3.1), (5, 27, 3.2)))
    additions.append(block((-3, -21, 3.5), (100, 5, 2.4)))
    additions.append(block((20, -22, 2.95), (32, 12.5, 3.5)))
    battery_floor = rounded_plate(39.2, 34.2, 1.5, 2.2, 4.7, (35, 12))
    battery_inside = rounded_plate(36.2, 31.2, 0.6, -4, 2.3, (35, 12))
    battery_rim = rounded_plate(39.2, 34.2, 1.5, -3.7, 2.3, (35, 12)).cut(
        battery_inside
    )
    # The pouch has side clearance. A soft strap provides retention instead of a rigid clamp.
    additions.extend(
        [
            battery_floor,
            battery_rim,
            block((35, -6.5, 3.45), (8, 7, 2.5)),
            block((35, 29, 3.45), (8, 5, 2.5)),
        ]
    )
    carrier = combine(carrier, additions)
    for horizontal, vertical in [
        (-44, -6),
        (-44, 30),
        (8, -6),
        (8, 30),
        (-43, -32),
        (-43, -8),
        (35, -7),
        (35, 29),
    ]:
        carrier = carrier.cut(block((horizontal, vertical, 3.8), (5, 2.8, 9)))
    cutters = []
    for horizontal in [-1, 1]:
        for vertical in [-1, 1]:
            cutter = rounded_plate(24.2, 3.1, 0.5, -0.1, 6.3, (34.1, 32.25))
            cutters.append(reflect(cutter, horizontal, vertical))
    for cutter in cutters:
        carrier = carrier.cut(cutter)
    beam = carrier_beam(dimensions)
    carrier = combine(
        carrier,
        [
            reflect(beam, horizontal, vertical)
            for horizontal in [-1, 1]
            for vertical in [-1, 1]
        ],
    )
    return carrier.clean()


def cover_clip(dimensions=DEFAULTS) -> cad.Shape:
    front = dimensions.cover_front
    stem = block((21.5, 33.4, front + 1.95), (3, 2.5, 4.1))
    beam = block((30.25, 33.4, front + 2.9), (20.5, dimensions.clip_thickness, 2))
    clip_hook = hook(37, 34.15, 34.85, front + 1.9, front + 4.6, 1)
    return combine(stem, [beam, clip_hook])


def build_cover(dimensions=DEFAULTS) -> cad.Shape:
    cover = rounded_plate(119.2, 73.2, 5.6, dimensions.back, dimensions.cover_front)
    additions = [
        reflect(cover_clip(dimensions), horizontal, vertical)
        for horizontal in [-1, 1]
        for vertical in [-1, 1]
    ]
    lip = rounded_plate(
        115.2, 69.2, 3.6, dimensions.cover_front - 0.1, dimensions.cover_front + 1.5
    )
    lip = lip.cut(
        rounded_plate(
            112.2, 66.2, 2.1, dimensions.cover_front - 0.2, dimensions.cover_front + 1.6
        )
    )
    for horizontal in [-37, 37]:
        for side in [-1, 1]:
            lip = lip.cut(
                block(
                    (horizontal, side * 34.8, dimensions.cover_front + 0.75),
                    (9.8, 4, 2),
                )
            )
    additions.append(lip)
    # The pocket floor meets the 1.5 mm wall target for the requested finish.
    for horizontal in [-48, 48]:
        for vertical in [-26, 26]:
            radius = (dimensions.magnet_diameter + dimensions.magnet_clearance) / 2
            boss = (
                cad.Workplane("XY")
                .center(horizontal, vertical)
                .circle(radius + 1.5)
                .extrude(dimensions.magnet_floor + dimensions.magnet_thickness + 0.3)
                .translate((0, 0, dimensions.back))
                .val()
            )
            additions.append(boss)
    cover = combine(cover, additions)
    for horizontal in [-48, 48]:
        for vertical in [-26, 26]:
            pocket = (
                cad.Workplane("XY")
                .center(horizontal, vertical)
                .circle((dimensions.magnet_diameter + dimensions.magnet_clearance) / 2)
                .extrude(dimensions.magnet_thickness + 0.3)
                .translate((0, 0, dimensions.back + dimensions.magnet_floor))
                .val()
            )
            cover = cover.cut(pocket)
    return cover.clean()


def build_parts(dimensions=DEFAULTS) -> dict[str, cad.Shape]:
    return {
        "front-frame": build_frame(dimensions),
        "internal-carrier": build_carrier(dimensions),
        "rear-cover": build_cover(dimensions),
    }


def hardware_envelopes(dimensions=DEFAULTS) -> dict[str, cad.Shape]:
    return {
        "panel": block(
            (
                dimensions.panel_center,
                0,
                dimensions.panel_back + dimensions.panel_thickness / 2,
            ),
            (
                dimensions.panel_width,
                dimensions.panel_height,
                dimensions.panel_thickness,
            ),
        ),
        "driver-hat": block((-18, 12, 0.8), (65, 30.2, 1.6)),
        "battery": block((35, 12, -0.8), (35, 30, 5)),
        "xiao": block((-39, -20, 0.3), (17.8, 21, 1.4)),
        "usb-port": block((-30, -20, -1.4), (6.8, 8.6, 3.2)),
        "usb-plug-clearance": block((-19.1, -20, -1.4), (15, 12, 6)),
        "antenna": block((20, -22, -0.1), (30, 10.5, 0.8)),
        "header-and-plugs": block((-18, 22, -4.9), (52, 5.3, 11.8)),
        "ribbon-side-clearance": block((55.2, 0, 2.2), (0.4, 12, 9.8)),
        "ribbon-rear-clearance": block((45, 0, -5), (20, 12, 0.4)),
        "ribbon-extension-clearance": block((26, 2, -6), (27, 12, 0.4)),
    }


def build_coupons(parts, dimensions=DEFAULTS) -> dict[str, cad.Shape]:
    region = block((31, 33.6, dimensions.cover_front + 3.25), (30, 10, 10.5))
    frame = parts["front-frame"].intersect(region).clean()
    cover = parts["rear-cover"].intersect(region).clean()
    return {"clip-coupon-frame": frame, "clip-coupon-cover": cover}


def print_position(shape: cad.Shape, name: str) -> cad.Shape:
    positioned = (
        shape.rotate((0, 0, 0), (1, 0, 0), 180) if name == "front-frame" else shape
    )
    bounds = positioned.BoundingBox()
    return positioned.translate((-bounds.xmin, -bounds.ymin, -bounds.zmin))


def export_files(output: Path, parts, dimensions=DEFAULTS) -> None:
    output.mkdir(parents=True, exist_ok=True)
    coupons = build_coupons(parts, dimensions)
    for name, shape in {**parts, **coupons}.items():
        cad.exporters.export(shape, str(output / f"{name}.step"))
        cad.exporters.export(
            print_position(shape, name),
            str(output / f"{name}.stl"),
            tolerance=0.025,
            angularTolerance=0.12,
        )
    assembly = cad.Assembly(name="household-display-case")
    colors = {
        "front-frame": (0.81, 0.86, 0.84),
        "internal-carrier": (0.5, 0.66, 0.7),
        "rear-cover": (0.79, 0.84, 0.87),
    }
    for name, shape in parts.items():
        assembly.add(shape, name=name, color=cad.Color(*colors[name]))
    assembly.export(str(output / "case-assembly.step"))
    (output / "dimensions.json").write_text(
        json.dumps(asdict(dimensions), indent=2) + "\n"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output", type=Path, default=Path(__file__).resolve().parents[1] / "print"
    )
    arguments = parser.parse_args()
    parts = build_parts()
    for name, shape in parts.items():
        print(
            f"{name}: {len(shape.Solids())} solids, valid={shape.isValid()}, {shape.Volume():.1f} mm³"
        )
    export_files(arguments.output, parts)


if __name__ == "__main__":
    main()
