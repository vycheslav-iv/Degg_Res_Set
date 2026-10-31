#!/usr/bin/env python3
"""Red test: the node reports the size it ACTUALLY feeds downstream.

Why: when a widget is converted to an input and wired (w1/h1 <- GetImageSize),
ComfyUI ignores the widget value and passes the upstream value into
`process(...)`. The widget value is therefore a lie, and the frontend cannot
know the wired value before execution (GetImageSize computes it from the image
at run time, it has no widgets at all).

So `process` must return the resolved size in the `ui` channel:

    {"ui": {"degg_res_size": [{"select": N, "w": W, "h": H}]}, "result": (W, H)}

The value is a ONE-ELEMENT LIST, not a dict: ComfyUI's ui channel is a list per
key (execution.py merges batched calls with
`ui = {k: [y for x in uis for y in x[k]] for k in uis[0].keys()}`), so a dict
value is iterated and reaches the client as its KEYS — live symptom
`512 × 512  ←  …` with `"degg_res_size": ["select", "w", "h"]` in /history.

ComfyUI emits that `ui` dict in the `executed` event -> `node.onExecuted(output)`,
and stores it in `app.nodeOutputs` (also restored from cache / changeTracker).
The JS row then shows `widget_pair  ←  resolved_pair`.

Checks:
  1-3. every preset returns a dict (not a bare tuple) with `ui` + `result`;
  4.   `ui.degg_res_size` is a LIST (ComfyUI's ui channel is list-per-key) and
       carries the executed preset and the same numbers as `result`;
  4b.  the payload SURVIVES execution.py's merge of `uis` (the live bug: a dict
       value degraded to `["select", "w", "h"]`);
  5.   preset 1 reports the COMPUTED size (aspect/megapixels/multiple);
  6.   the wired values win over the widget values (that is the whole point);
  7.   the ui payload survives json.dumps (ComfyUI serializes `ui` verbatim);
  8.   RETURN_TYPES/RETURN_NAMES are unchanged (width, height).

Run:  cd Degg_Res_Set && python tests/_test_process_ui.py
"""
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

try:  # messages contain '—' / '×'; cp1251 console would mangle them
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PY = ROOT / "deg_res_set.py"


def load_node():
    spec = importlib.util.spec_from_file_location("deg_res_set", PY)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod.DeggResSet()


def call(node, select, w=(512, 512, 768, 768, 1024, 1024)):
    """process(select, aspect, mp, multiple, w1,h1, w2,h2, w3,h3)"""
    return node.process(select, "16:9 (Widescreen)", 1.0, 8, *w)


def main():
    fails = []
    node = load_node()

    def check(label, cond, extra=""):
        if not cond:
            fails.append(f"{label}{('  [' + str(extra) + ']') if extra else ''}")

    # 1-3. Все пресеты возвращают dict с ui + result
    for select in (1, 2, 3, 4):
        out = call(node, select)
        check(f"preset {select}: process -> dict", isinstance(out, dict), type(out).__name__)
        if not isinstance(out, dict):
            continue
        check(f"preset {select}: есть ключ ui", isinstance(out.get("ui"), dict), out.get("ui"))
        check(f"preset {select}: есть ключ result", isinstance(out.get("result"), tuple), out.get("result"))

    # 4. ui.degg_res_size совпадает с result и несёт номер пресета.
    #    Значение — СПИСОК: ComfyUI склеивает ui по ключам списками.
    def size_of(out):
        """-> dict {select,w,h} | None, разворачивая list-обёртку ui-канала."""
        if not isinstance(out, dict):
            return None
        ui = (out.get("ui") or {}).get("degg_res_size")
        if isinstance(ui, list):
            ui = ui[0] if ui else None
        return ui if isinstance(ui, dict) else None

    for select, expect in ((2, (512, 512)), (3, (768, 768)), (4, (1024, 1024))):
        out = call(node, select)
        raw = (out.get("ui") or {}).get("degg_res_size") if isinstance(out, dict) else None
        check(f"preset {select}: ui.degg_res_size — список", isinstance(raw, list), raw)
        ui = size_of(out)
        if ui is None:
            fails.append(f"preset {select}: в ui нет dict с размером  [{raw}]")
            continue
        check(f"preset {select}: ui.select == {select}", ui.get("select") == select, ui.get("select"))
        check(
            f"preset {select}: ui == result {expect}",
            (ui.get("w"), ui.get("h")) == expect and out.get("result") == expect,
            (ui.get("w"), ui.get("h"), out.get("result")),
        )

    # 4b. Ровно то, что делает execution.py при отправке `executed`.
    out = call(node, 2, w=(3240, 4320, 768, 768, 1024, 1024))
    uis = [out.get("ui")]
    merged = {k: [y for x in uis for y in x[k]] for k in uis[0].keys()}
    check(
        "ui переживает merge execution.py (числа, а не ключи)",
        size_of({"ui": merged}) == {"select": 2, "w": 3240, "h": 4320},
        merged.get("degg_res_size"),
    )

    # 5. Пресет 1 — расчётный размер (16:9, 1.0 MP, multiple 8)
    out = call(node, 1)
    ui = size_of(out)
    check("preset 1: ui.select == 1", isinstance(ui, dict) and ui.get("select") == 1, ui)
    check(
        "preset 1: ui == расчёт 1368 × 768",
        isinstance(ui, dict) and (ui.get("w"), ui.get("h")) == (1368, 768),
        ui,
    )
    check(
        "preset 1: result == расчёт 1368 × 768",
        isinstance(out, dict) and out.get("result") == (1368, 768),
        out.get("result") if isinstance(out, dict) else out,
    )

    # 6. Пришедшее по проводу значение важнее виджета
    out = call(node, 2, w=(1600, 1920, 768, 768, 1024, 1024))
    ui = size_of(out)
    check(
        "провод 1600×1920 побеждает виджет 512×512",
        isinstance(ui, dict) and (ui.get("w"), ui.get("h")) == (1600, 1920)
        and out.get("result") == (1600, 1920),
        ui,
    )

    # 7. ui сериализуется в JSON как есть (ComfyUI отправляет его в `executed`)
    try:
        dumped = json.dumps((call(node, 2) or {}).get("ui"), ensure_ascii=False)
        check("ui -> json без ошибок", dumped.startswith("{"))
    except Exception as exc:  # noqa: BLE001
        fails.append(f"ui не сериализуется в JSON: {exc}")

    # 8. Контракт выходов не изменился
    check("RETURN_TYPES == (INT, INT)", node.RETURN_TYPES == ("INT", "INT"), node.RETURN_TYPES)
    check("RETURN_NAMES == (width, height)", node.RETURN_NAMES == ("width", "height"), node.RETURN_NAMES)

    if fails:
        print(f"FAIL: {len(fails)}")
        for f in fails:
            print(f"  - {f}")
        return 1
    print("TEST OK: process() reports the effective size via ui.degg_res_size")
    return 0


if __name__ == "__main__":
    sys.exit(main())
