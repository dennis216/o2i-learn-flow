#!/usr/bin/env python3
"""Rebuilds the Chinese pixel font from the characters used in zh-CN.json.

Needs fonttools and a full Cubic 11 font (https://github.com/ACh-K/Cubic-11):
python3 scripts/arena/subset-zh-font.py <Cubic_11.ttf>
"""
import json
import sys
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

here = Path(__file__).parent
dictionary = json.loads((here / "zh-CN.json").read_text(encoding="utf8"))
text = "".join(dictionary["strings"].values()) + "".join(dictionary["static"].values())
text += "中文"  # the language button in the English interface
characters = sorted({ch for ch in text if ord(ch) > 0x2E7F})

font = TTFont(sys.argv[1])
subsetter = subset.Subsetter(subset.Options(hinting=False, layout_features=[]))
subsetter.populate(unicodes=[ord(ch) for ch in characters])
subsetter.subset(font)
font.flavor = "woff"
font.save(here / "fonts" / "cubic-zh-subset.woff")
(here / "fonts" / "cubic-zh-subset.chars.txt").write_text("".join(characters), encoding="utf8")
print(f"{len(characters)} characters")
