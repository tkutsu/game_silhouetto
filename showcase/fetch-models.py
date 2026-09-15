#!/usr/bin/env python3
"""Downloads Kenney's full Food and Holiday kits into showcase/models/ as candidates.

The game's own models live in public/models/; this pulls every other model from the
same kits so showcase.html can show them next to the ones in use.
Writes showcase/models/manifest.json, which the showcase page reads.
"""

import io
import json
import urllib.request
import zipfile
from pathlib import Path

OUT = Path(__file__).parent / "models"

KITS = {
    "food": "https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip",
    "holiday": "https://kenney.nl/media/pages/assets/holiday-kit/3976a6496a-1733923970/kenney_holiday-kit.zip",
}

# Kenney's file name has a typo; the game uses the fixed one
RENAME = {"ice-cream-cne": "ice-cream-cone"}


def main():
    manifest = []
    for kit, url in KITS.items():
        req = urllib.request.Request(url, headers={"User-Agent": "silhouetto-showcase"})
        with urllib.request.urlopen(req) as r, zipfile.ZipFile(io.BytesIO(r.read())) as z:
            for entry in sorted(z.namelist()):
                if "/GLB format/" not in entry or entry.endswith("/"):
                    continue
                rel = entry.split("/GLB format/", 1)[1]
                if rel.endswith(".glb"):
                    name = rel.removesuffix(".glb")
                    name = RENAME.get(name, name)
                    rel = f"{name}.glb"
                    manifest.append({"kit": kit, "name": name, "file": f"{kit}/{rel}"})
                path = OUT / kit / rel
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(z.read(entry))
    (OUT / "manifest.json").write_text(json.dumps(manifest, indent=2))
    print(f"{len(manifest)} models in {OUT}")


if __name__ == "__main__":
    main()
