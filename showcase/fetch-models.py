#!/usr/bin/env python3
"""Downloads the CC0 candidate models for showcase.html into showcase/models/.

Poly Haven: glTF with 1k textures. Kenney: GLB from the Food and Holiday kits.
Writes showcase/models/manifest.json, which the showcase page reads.
Re-running skips files that already exist.
"""

import io
import json
import urllib.request
import zipfile
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

OUT = Path(__file__).parent / "models"
UA = {"User-Agent": "silhouetto-showcase"}

POLYHAVEN = """
rubber_duck_toy garden_gnome croissant bananas lemon food_apple_01 food_avocado_01
yellow_onion strawberry_chocolate_cake alarm_clock_01 pocket_watch Ukulele_01
wooden_spoon hatchet wooden_axe cross_pein_hammer adjustable_wrench pliers screwdriver
trowel_01 plunger magnifying_glass_01 lightbulb_01 concrete_cat_statue horse_statue_01
bronze_shark_statue bronze_whale_statue lambis_shell street_rat carved_wooden_elephant
bull_head watering_can_metal_01 american_football baseball_bat kite_shield
ornate_medieval_mace Megaphone_01 binoculars round_spectacles Lantern_01
vintage_oil_lamp wooden_candlestick desk_lamp_arm_01 Camera_01 gamepad lifebuoy
rubber_boots fishermans_hat
""".split()

KENNEY = {
    "food": (
        "https://kenney.nl/media/pages/assets/food-kit/83086fa91c-1719418518/kenney_food-kit.zip",
        """
        banana carrot pineapple pear apple cherries strawberry grapes mushroom broccoli corn
        eggplant pumpkin watermelon avocado fish fish-bones mussel-open croissant donut
        cupcake muffin ice-cream-cne popsicle lollypop sundae burger hot-dog taco turkey
        whole-ham meat-ribs cheese loaf-baguette pizza cake-birthday frying-pan rollingPin
        whisk utensil-fork cooking-knife mug cup-tea soda-bottle glass-wine cocktail
        pepper-mill mortar-pestle
        """.split(),
    ),
    "holiday": (
        "https://kenney.nl/media/pages/assets/holiday-kit/3976a6496a-1733923970/kenney_holiday-kit.zip",
        """
        snowman-hat reindeer nutcracker gingerbread-man candy-cane-red sock-red snowflake-a
        tree-decorated present-a-round hanukkah-dreidel lantern sled train-locomotive wreath
        kwanzaa-kinara
        """.split(),
    ),
}


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA)) as r:
        return r.read()


def save(path: Path, url: str):
    if path.exists():
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(get(url))


def polyhaven(asset: str) -> dict:
    info = json.loads(get(f"https://api.polyhaven.com/info/{asset}"))
    gltf = json.loads(get(f"https://api.polyhaven.com/files/{asset}"))["gltf"]["1k"]["gltf"]
    folder = OUT / "polyhaven" / asset
    save(folder / f"{asset}.gltf", gltf["url"])
    for rel, file in gltf["include"].items():
        save(folder / rel, file["url"])
    return {
        "id": f"polyhaven/{asset}",
        "name": info["name"],
        "source": "Poly Haven",
        "author": ", ".join(info["authors"]),
        "page": f"https://polyhaven.com/a/{asset}",
        "file": f"polyhaven/{asset}/{asset}.gltf",
        "tris": info.get("polycount"),
    }


def kenney(kit: str, url: str, names: list[str]) -> list[dict]:
    folder = OUT / f"kenney-{kit}"
    folder.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(io.BytesIO(get(url))) as z:
        for entry in z.namelist():
            if "/GLB format/" not in entry or entry.endswith("/"):
                continue
            rel = entry.split("/GLB format/", 1)[1]
            if rel.startswith("Textures/") or rel.removesuffix(".glb") in names:
                (folder / rel).parent.mkdir(parents=True, exist_ok=True)
                (folder / rel).write_bytes(z.read(entry))
    return [
        {
            "id": f"kenney-{kit}/{name}",
            "name": name.replace("-", " ").replace("cne", "cone").capitalize(),
            "source": "Kenney",
            "author": "Kenney",
            "page": f"https://kenney.nl/assets/{kit}-kit",
            "file": f"kenney-{kit}/{name}.glb",
            "tris": None,
        }
        for name in names
    ]


def main():
    OUT.mkdir(exist_ok=True)
    with ThreadPoolExecutor(8) as pool:
        ph = list(pool.map(polyhaven, POLYHAVEN))
    kn = [m for kit, (url, names) in KENNEY.items() for m in kenney(kit, url, names)]
    (OUT / "manifest.json").write_text(json.dumps(ph + kn, indent=2))
    print(f"{len(ph)} Poly Haven + {len(kn)} Kenney models in {OUT}")


if __name__ == "__main__":
    main()
