#!/usr/bin/env python3
"""Red test: DOM separators instead of canvas widgets.

Canvas-based separators with draw() are fragile in Nodes 2.0 — they render
with artifacts and break easily. DOM separators via addDOMWidget are stable.
"""
import re
import sys
from pathlib import Path

JS = Path(__file__).resolve().parent.parent / "web" / "js" / "deg_res_set.js"

def main():
    src = JS.read_text(encoding="utf-8")
    fails = []

    # 1. DOM separator helper must exist
    if "function makeSepDOM" not in src:
        fails.append("makeSepDOM() not found — DOM separator helper missing")

    # 2. Must use addDOMWidget, not custom widget splice
    if "addDOMWidget" not in src:
        fails.append("addDOMWidget not used — still canvas custom widget")
    if "makeSep(" in src and "makeSepDOM(" not in src:
        fails.append("Old makeSep() canvas function still present")

    # 3. Canvas draw() in separator must be removed
    if re.search(r"type:\s*[\"']separator[\"']", src):
        fails.append("type: 'separator' found — old canvas widget still present")

    # 4. DOM element styles must exist
    if "border-top" not in src and "borderTop" not in src:
        fails.append("No border-top style — separator visual missing")

    if fails:
        print(f"FAIL: {len(fails)}")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    else:
        print("OK: DOM separators implemented")
        sys.exit(0)

if __name__ == "__main__":
    main()
