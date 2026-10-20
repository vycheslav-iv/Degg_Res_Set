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

Checks 7-12 pin the mount-race fix: the row is built by an idempotent
createPreview(node) on the NEXT tick (a node has no id and is outside the graph
during onNodeCreated, and the Vue preview resolves its host once and
non-reactively -> "—" forever after a workflow reload).
"""
import importlib.util
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:  # messages contain '—' / '×'; cp1251 console would mangle them
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass
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

    # 7. Preview row is created on the NEXT tick, not inside onNodeCreated.
    #    At onNodeCreated the node has no id and is not in a graph yet; the Vue
    #    preview resolves its host node once, non-reactively
    #    (computed(() => resolveNode(nodeId))), so a row mounted before the node
    #    joins the graph caches "no host" and renders "—" forever.
    if not re.search(r"function createPreview\(node\)\s*\{", src):
        fails.append(
            "createPreview(node) not found — preview creation must be a "
            "separate, re-runnable step"
        )
    if not re.search(r"setTimeout\(\s*\(\s*\)\s*=>\s*createPreview\(node\)", src):
        fails.append(
            "preview not deferred (setTimeout -> createPreview) — row mounts "
            "before the node is attached and shows '—'"
        )
    if re.search(
        r"^\s*const previewWidget = this\.addWidget\(\s*[\"']resolutionpreview",
        src,
        re.M,
    ):
        fails.append(
            "addWidget('resolutionpreview') still runs synchronously in "
            "onNodeCreated — node has no id yet"
        )

    # 8. Idempotent: created once even if onConfigure/loadedGraphNode re-run
    cp = re.search(r"function createPreview\(node\)\s*\{([\s\S]*?)\n\}", src)
    if not cp:
        fails.append("createPreview() body not found")
    elif not re.search(r"if \(getWidget\(node, [\"']preview[\"']\)\) return;", cp.group(1)):
        fails.append("createPreview() is not idempotent (no 'already exists' guard)")

    # 9. Loaded graph also ensures the row (covers a dropped timer)
    lg = re.search(r"loadedGraphNode\(node\)\s*\{([\s\S]*?)\n  \}", src)
    if not lg:
        fails.append("loadedGraphNode(node) not found")
    elif "createPreview(node)" not in lg.group(1):
        fails.append("loadedGraphNode does not call createPreview(node)")

    # 10. Widget values may arrive as strings from workflow JSON — the preset
    #     test must compare numbers (Number('1') === 1)
    if not re.search(r"selectVal = Number\(selectVal\)", src):
        fails.append(
            "selectVal is not normalized with Number() — '1' would disable preset 1"
        )

    # 11. No synchronous createPreview() left in onNodeCreated: any call must
    #     sit inside the deferred callback (same line as setTimeout).
    onc = re.search(
        r"prototype\.onNodeCreated = function \(\) \{([\s\S]*?)\n    \};", src
    )
    if not onc:
        fails.append("onNodeCreated override not found")
    else:
        eager = [
            ln
            for ln in onc.group(1).splitlines()
            if "createPreview(" in ln and "setTimeout" not in ln
        ]
        if eager:
            fails.append(
                "createPreview() called synchronously in onNodeCreated "
                f"({len(eager)} line(s)) — node is not attached yet"
            )

    # 12. onConfigure must NOT create the row: it runs inside LGraph.configure,
    #     i.e. before graph.add(node) — the exact window this bug comes from.
    oc = re.search(
        r"prototype\.onConfigure = function \(\) \{([\s\S]*?)\n    \};", src
    )
    if not oc:
        fails.append("onConfigure override not found")
    elif "createPreview(" in oc.group(1):
        fails.append(
            "createPreview() called from onConfigure — node is not attached yet "
            "(same mount-race); use loadedGraphNode instead"
        )

    if fails:
        print(f"FAIL: {len(fails)}")
        for f in fails:
            print(f"  - {f}")
        sys.exit(1)
    print("OK: resolution preview line implemented (create/place/hide/parity)")
    sys.exit(0)


if __name__ == "__main__":
    main()
