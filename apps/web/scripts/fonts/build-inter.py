"""Builds the Inter weights the editor ships, each one file for every script.

@fontsource/inter has each weight in parts, one per script (Latin, Latin
Extended, Cyrillic, Cyrillic Extended, Greek, Greek Extended, Vietnamese),
as browsers load them. The editor draws text from one font file per weight
(opentype.js), so the parts are merged back into one: Latin text lays out
as it did from the Latin part alone, and Cyrillic, Greek and Vietnamese
text has its letters, as the cloud's server renders (the full Inter 4.001)
have them.

Run from apps/web after `pnpm install` (needs fontTools: pip install fonttools):
    python3 scripts/fonts/build-inter.py
"""

import os
import shutil
import sys
import tempfile

from fontTools.merge import Merger, Options
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
APP = os.path.dirname(os.path.dirname(HERE))
SOURCE = os.path.join(APP, "node_modules", "@fontsource", "inter")
OUT = os.path.join(APP, "src", "assets", "fonts", "inter")

# Latin first: the merged font keeps its tables (metrics, names) as they were
SUBSETS = ["latin", "latin-ext", "cyrillic", "cyrillic-ext", "greek", "greek-ext", "vietnamese"]
WEIGHTS = [100, 200, 300, 400, 500, 600, 700, 800, 900]


def build(weight: int, scratch: str) -> str:
    parts = []
    dated = None
    for subset in SUBSETS:
        part = TTFont(os.path.join(SOURCE, "files", f"inter-{subset}-{weight}-normal.woff"))
        dated = dated or (part["head"].created, part["head"].modified)
        part.flavor = None
        path = os.path.join(scratch, f"{subset}-{weight}.ttf")
        part.save(path)
        parts.append(path)
    font = Merger(options=Options(drop_tables=[])).merge(parts)
    font.flavor = "woff"
    # The same parts give the same file: dated as the Latin part is
    font["head"].created, font["head"].modified = dated
    font.recalcTimestamp = False
    out = os.path.join(OUT, f"inter-{weight}.woff")
    font.save(out)
    return out


def main() -> int:
    if not os.path.isdir(SOURCE):
        print(f"@fontsource/inter isn't installed at {SOURCE}: run pnpm install", file=sys.stderr)
        return 1
    os.makedirs(OUT, exist_ok=True)
    with tempfile.TemporaryDirectory() as scratch:
        for weight in WEIGHTS:
            out = build(weight, scratch)
            print(f"{os.path.relpath(out, APP)}: {os.path.getsize(out)} bytes")
    shutil.copyfile(os.path.join(SOURCE, "LICENSE"), os.path.join(OUT, "OFL.txt"))
    return 0


if __name__ == "__main__":
    sys.exit(main())
