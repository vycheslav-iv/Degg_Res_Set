#!/usr/bin/env python3
"""Red test: live ResolutionPreview line under the `multiple` widget.

Adds the native Vue widget directly below `multiple`, keeps it out of prompt
and workflow serialization, makes it show "—" when select != 1, and aligns the
Python calculation with the standard node (Python round, not floor).

The addWidget type MUST be 'resolutionpreview' — the canonical registry key:
LGraphNode.addWidget stores type.toLowerCase(), and widgetRegistry resolves
via case-sensitive aliasMap/widgets lookups ('resolutionpreview' key,
alias 'RESOLUTION_PREVIEW'). A literal "RESOLUTION_PREVIEW" becomes
'resolution_preview' after toLowerCase, matches neither, getComponent returns
null and the row renders blank — this was the live "no line" bug.
"""
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
JS = ROOT / "web" / "js" / "deg_res_set.js"
PY = ROOT / "deg_res_set.py"


def load_node():
    spec = importlib.util.spec_from_file_location("deg_res_set", PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DeggResSet()


def main():
    fails = []
    src = JS.read_text(encoding="utf-8")

    # 1. Native preview widget created with the canonical registry key
    #    'resolutionpreview' (uppercase type renders blank — see docstring)
    m = re.search(r"addWidget\(\s*[\"']resolutionpreview[\"']", src)
    if not m:
        fails.append(
            "addWidget('resolutionpreview', ...) not found — widget type would "
            "not resolve in widgetRegistry (blank row)"
        )

    # 2. Excluded from prompt + workflow persistence (both channels)
    if m:
        block = src[m.start() : m.start() + 600]
        if not re.search(r"serialize\s*:\s*false", block):
            fails.append("options.serialize: false missing in preview addWidget")
        if not re.search(r"hideInPanel\s*:\s*true", block):
            fails.append("options.hideInPanel: true missing in preview addWidget")
        if "ratio_widget" not in block:
            fails.append("ratio_widget option not passed to preview widget")
    if not re.search(r"previewWidget\.serialize\s*=\s*false", src):
        fails.append("previewWidget.serialize = false missing — widget would be saved in widgets_values")

    # 3. Widget is moved directly below `multiple`
    if not re.search(
        r"findIndex\(\s*\(\s*w\s*\)\s*=>\s*w\.name\s*===\s*[\"']multiple[\"']\s*\)", src
    ):
        fails.append("findIndex for 'multiple' not found — no repositioning below multiple")
    if not re.search(r"splice\(\s*multIdx\s*\+\s*1\s*,\s*0\s*,\s*previewWidget\s*\)", src):
        fails.append("splice(multIdx + 1, 0, previewWidget) not found — preview not placed under multiple")

    # 4. updateWidgetState switches ratio_widget so the line shows "—"
    #    for every preset except 1
    ms = re.search(r"function updateWidgetState\(node, selectVal\)\s*\{", src)
    if not ms:
        fails.append("updateWidgetState() not found")
    else:
        body = src[ms.start() :]
        end = body.find("\n}")
        body = body[:end] if end != -1 else body
        if not re.search(
            r"ratio_widget\s*=\s*selectVal\s*===\s*1\s*\?\s*[\"']aspect_ratio[\"']\s*:\s*[\"']__preset_off__[\"']",
            body,
        ):
            fails.append(
                "updateWidgetState does not switch ratio_widget for select != 1"
            )

    # 5. Python math parity with standard ResolutionSelector (round, not floor)
    node = load_node()
    got16 = node.process(1, "16:9 (Widescreen)", 2.0, 8, 512, 512, 768, 768, 1024, 1024)
    if got16 != (1928, 1088):
        fails.append(f"16:9/2.0MP/mult 8 -> {got16}, expected (1928, 1088) — floor instead of round")
    got32 = node.process(1, "3:2 (Photo)", 2.0, 8, 512, 512, 768, 768, 1024, 1024)
    if got32 != (1776, 1184):
        fails.append(f"3:2/2.0MP/mult 8 -> {got32}, expected (1776, 1184) — floor instead of round")

    # 6. Regression guard: select != 1 passes manual sizes through unchanged
    got2 = node.process(2, "1:1 (Square)", 2.0, 8, 640, 360, 768, 768, 1024, 1024)
    if got2 != (640, 360):
        fails.append(f"select=2 -> {got2}, expected (640, 360)")

    if fails:
        print(f"FAIL: {len(fails)}")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    print("OK: resolution preview line implemented (create/place/hide/parity)")
    sys.exit(0)


if __name__ == "__main__":
    main()
