"""Package the validated case files, source, preview, and assembly guide."""

import hashlib
import json
import zipfile
from pathlib import Path


def main():
    root = Path(__file__).resolve().parents[1]
    report = json.loads((root / "print/validation.json").read_text())
    if report["status"] != "pass":
        raise SystemExit("The CAD checks must pass before the files are packaged.")
    files = [root / name for name in ["README.md", "ASSEMBLY.md", "case-mockup.html"]]
    for directory in ["cad", "print"]:
        files.extend(
            path
            for path in (root / directory).iterdir()
            if path.is_file()
            and path.suffix in {".py", ".txt", ".md", ".step", ".stl", ".json", ".png"}
            and path.name != "manifest.json"
        )
    manifest = {
        "units": "mm",
        "case_mm": [120, 74, 30],
        "status": "Fit prototype; no physical validation performed",
        "material": "Unfilled PA12 nylon, MJF preferred",
        "finish": "Vapour smoothing, subject to supplier review",
        "checks_passed": len(report["checks"]),
        "files": [
            {
                "path": str(path.relative_to(root)),
                "bytes": path.stat().st_size,
                "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
            }
            for path in sorted(files)
        ],
    }
    manifest_path = root / "print/manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    files.append(manifest_path)
    destination = root / "display-case-files.zip"
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, Path("design") / path.relative_to(root))
    with zipfile.ZipFile(destination) as archive:
        if archive.testzip() is not None:
            raise SystemExit("The archive integrity check failed.")
    print(
        f"Packaged {len(files)} files: {destination.name} ({destination.stat().st_size:,} bytes)"
    )


if __name__ == "__main__":
    main()
