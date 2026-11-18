#!/usr/bin/env python3
"""Rebuilds the Chinese pixel font from the shipped game and zh-CN.json.

Needs fonttools and a full Cubic 11 font (https://github.com/ACh-K/Cubic-11):
python3 scripts/arena/subset-zh-font.py <Cubic_11.ttf>
"""
import json
import re
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

here = Path(__file__).parent
dictionary = json.loads((here / "zh-CN.json").read_text(encoding="utf8"))
text = "".join(dictionary["strings"].values()) + "".join(dictionary["static"].values())
# Include new UI strings in the shipped standalone game, not only the initial dictionary.
game = (here.parent.parent / "public/games/limit-arena.html").read_text(encoding="utf8")
game = re.sub(r"\\u([0-9a-fA-F]{4})", lambda match: chr(int(match[1], 16)), game)
text += game + "中文"
characters = sorted({ch for ch in text if ord(ch) > 0x2E7F})

font = TTFont(sys.argv[1])
missing = [ch for ch in characters if ord(ch) not in font.getBestCmap()]
if missing:
    raise ValueError(f"Source pixel font is missing characters: {''.join(missing)}")
subsetter = subset.Subsetter(subset.Options(hinting=False, layout_features=[]))
subsetter.populate(unicodes=[ord(ch) for ch in characters])
subsetter.subset(font)
font.flavor = "woff"
font.save(here / "fonts" / "cubic-zh-subset.woff")
(here / "fonts" / "cubic-zh-subset.chars.txt").write_text("".join(characters), encoding="utf8")
print(f"{len(characters)} characters")
