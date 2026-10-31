const { app } = window.comfyAPI?.app;

// ── Separators (DOM-based for Nodes 2.0 stability) ──

const SEP_LABELS = [
  "═══ ASPECT RATIO (Preset 1) ═══",
  "═══ PRESET 2 ═══",
  "═══ PRESET 3 ═══",
  "═══ PRESET 4 ═══",
];

// Original (pre-insertion) indices for each separator
const GROUP_START = [1, 4, 6, 8];

function makeSepDOM(label) {
  const el = document.createElement("div");
  el.className = "degg-res-sep";
  el.style.cssText = [
    "box-sizing:border-box",
    "height:22px",
    "display:flex",
    "align-items:center",
    "padding:0 8px",
    "margin:2px 0",
    "border-top:1px solid rgba(120,120,120,0.25)",
    "background:rgba(50,50,50,0.04)",
    "color:#888",
    "font:bold 10px sans-serif",
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "pointer-events:none",
  ].join(";");
  el.textContent = label;
  return el;
}

// ── Per-preset size preview (DOM rows for presets 2-4) ──
// Preset 1 shows the native ResolutionPreview row. That component can only
// COMPUTE a size from aspect_ratio + megapixels + multiple, so it cannot
// display the literal manual w/h of presets 2-4. These DOM rows read the w/h
// sibling widgets directly and show exactly what the node feeds downstream.

const RES_PREVIEWS = [
  { key: "__res_preview_2", w: "w1", h: "h1", preset: 2 },
  { key: "__res_preview_3", w: "w2", h: "h2", preset: 3 },
  { key: "__res_preview_4", w: "w3", h: "h3", preset: 4 },
];

/** Is this widget name wired (converted to an input that has a live link)? */
function isInputWired(node, name) {
  const inp = (node.inputs || []).find((i) => i && i.name === name);
  return !!(inp && inp.link != null);
}

/** Normalize the `degg_res_size` ui payload -> {select, w, h} | null.
 *
 * ComfyUI's ui channel is ALWAYS a list per key: execution.py merges batched
 * calls with `{k: [y for x in uis for y in x[k]] for k in uis[0].keys()}`, so
 * a dict value arrives as `[{select, w, h}]` — and a bare dict would be
 * iterated into its keys. A plain dict is still accepted (older payloads).
 */
function normalizeSize(payload) {
  if (!payload) return null;
  const v = Array.isArray(payload) ? payload[0] : payload;
  if (!v || typeof v !== "object") return null;
  const select = Number(v.select);
  const w = Number(v.w);
  const h = Number(v.h);
  if (![select, w, h].every(Number.isFinite)) return null;
  return { select, w, h };
}

/** Last size the node really produced: own run, else restored node outputs. */
function lastResolvedSize(node) {
  if (node.__deggResLast) return node.__deggResLast;
  let out = null;
  try {
    const outputs = app?.nodeOutputs;
    out = outputs?.[node.id] ?? outputs?.[String(node.id)];
  } catch (_) {
    out = null;
  }
  return normalizeSize(out?.degg_res_size);
}

function makeResPreviewDOM() {
  const el = document.createElement("div");
  el.className = "degg-res-preview";
  // Same look as the native WidgetResolutionPreview row (h-6 / 12px / themed).
  el.style.cssText = [
    "box-sizing:border-box",
    "height:24px",
    "display:flex",
    "align-items:center",
    "justify-content:center",
    "gap:8px",
    "padding:0 8px",
    "margin:1px 0",
    "border-radius:6px",
    "background:var(--component-node-widget-background, rgba(128,128,128,0.12))",
    "color:var(--component-node-foreground, #ddd)",
    "font:12px sans-serif",
    "white-space:nowrap",
    "overflow:hidden",
    "text-overflow:ellipsis",
    "pointer-events:none",
  ].join(";");
  el.textContent = "—";
  return el;
}

/** Show `W × H` for the active manual preset, "—" for the inactive ones. */
function updatePresetPreviews(node, selectVal) {
  selectVal = Number(selectVal);
  const els = node.__deggResPreviews;
  if (!els) return;
  const last = lastResolvedSize(node);
  for (const spec of RES_PREVIEWS) {
    const el = els[spec.key];
    if (!el) continue;
    if (selectVal !== spec.preset) {
      el.textContent = "—";
      continue;
    }
    const wv = Number(getWidget(node, spec.w)?.value);
    const hv = Number(getWidget(node, spec.h)?.value);
    if (!Number.isFinite(wv) || !Number.isFinite(hv)) {
      el.textContent = "—";
      continue;
    }
    // A wired input overrides the widget on the server, so the widget pair
    // alone is a lie: show the size that really goes downstream next to it.
    // Before the first run that value does not exist anywhere (the source may
    // compute it at run time) -> "…" until `executed` brings it.
    if (!isInputWired(node, spec.w) && !isInputWired(node, spec.h)) {
      el.textContent = `${wv} × ${hv}`;
      continue;
    }
    const resolved =
      last && last.select === spec.preset ? `${last.w} × ${last.h}` : "…";
    el.textContent = `${wv} × ${hv}  ←  ${resolved}`;
  }
}

/** Live refresh when the user edits a manual w/h (covers legacy + Nodes 2.0). */
function hookSizeWidgets(node) {
  ["w1", "h1", "w2", "h2", "w3", "h3"].forEach((name) => {
    const w = getWidget(node, name);
    if (!w || w.__deggResHooked) return;
    w.__deggResHooked = true;
    const orig = w.callback;
    w.callback = function (val) {
      updatePresetPreviews(node, getWidget(node, "select")?.value);
      if (orig) return orig.apply(this, arguments);
    };
  });
}

/** Create the three DOM rows once; idempotent (also re-run from loadedGraphNode). */
function ensurePresetPreviews(node) {
  if (!node.__deggResPreviews) node.__deggResPreviews = {};

  // Descending order: inserting under h3 first keeps h2/h1 indices valid.
  for (let i = RES_PREVIEWS.length - 1; i >= 0; i--) {
    const spec = RES_PREVIEWS[i];
    if (node.__deggResPreviews[spec.key]) continue;

    const el = makeResPreviewDOM();
    const added = node.addDOMWidget(spec.key, "div", el, {
      serialize: false,
      hideInPanel: true,
      getValue: () => null,
      setValue: () => {},
    });

    // addDOMWidget returns the widget on current frontends; older ones only
    // append it. Either way we need the object that is in `node.widgets`.
    const domWidget =
      added && node.widgets.includes(added)
        ? added
        : node.widgets[node.widgets.length - 1];
    if (!domWidget) continue;
    // The serializer filters on the PROPERTY; `options.serialize` is not read,
    // so without this "" lands in widgets_values / widgets_values_named.
    domWidget.serialize = false;

    const at = node.widgets.indexOf(domWidget);
    if (at !== -1) node.widgets.splice(at, 1);
    const hIdx = node.widgets.findIndex((w) => w.name === spec.h);
    node.widgets.splice(hIdx >= 0 ? hIdx + 1 : node.widgets.length, 0, domWidget);

    node.__deggResPreviews[spec.key] = el;
  }

  hookSizeWidgets(node);
  updatePresetPreviews(node, getWidget(node, "select")?.value);
}

// ── Widget helpers ──

/** Get a widget by name from the node */
function getWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

/** Enable or disable a widget (ComfyUI-safe, handles v0.27+ readonly getter) */
function setWidgetDisabled(w, disabled) {
  if (!w) return;
  if (w.options) w.options.disabled = disabled; // ComboWidget: disabled читается из options
  try {
    w.disabled = disabled; // fallback для старых версий
  } catch (_) {}
}

/** Update widget enabled/disabled state based on select value */
function updateWidgetState(node, selectVal) {
  // Values can arrive from workflow JSON as strings ("1"): compare numbers,
  // otherwise preset 1 would look inactive and the preview stays "—".
  selectVal = Number(selectVal);

  const ar = getWidget(node, "aspect_ratio");
  const mp = getWidget(node, "megapixels");
  const mult = getWidget(node, "multiple");
  const w1 = getWidget(node, "w1");
  const h1 = getWidget(node, "h1");
  const w2 = getWidget(node, "w2");
  const h2 = getWidget(node, "h2");
  const w3 = getWidget(node, "w3");
  const h3 = getWidget(node, "h3");

  // Preview line: live "W × H  MP" only for preset 1 (it reads the
  // aspect_ratio sibling); any other preset -> dead sibling name -> "—".
  const prev = getWidget(node, "preview");
  if (prev && prev.options) {
    prev.options.ratio_widget =
      selectVal === 1 ? "aspect_ratio" : "__preset_off__";
  }

  // Disable all preset-specific widgets first
  [ar, mp, mult].forEach((w) => setWidgetDisabled(w, true));
  [w1, h1, w2, h2, w3, h3].forEach((w) => setWidgetDisabled(w, true));

  // Enable only the active preset's widgets
  if (selectVal === 1) {
    [ar, mp, mult].forEach((w) => setWidgetDisabled(w, false));
  } else if (selectVal === 2) {
    [w1, h1].forEach((w) => setWidgetDisabled(w, false));
  } else if (selectVal === 3) {
    [w2, h2].forEach((w) => setWidgetDisabled(w, false));
  } else if (selectVal === 4) {
    [w3, h3].forEach((w) => setWidgetDisabled(w, false));
  }

  // Manual presets show their own "W × H" row; the others stay "—".
  updatePresetPreviews(node, selectVal);
}

// ── ResolutionPreview: native Vue widget showing "W × H  MP" ──
// Same component as the standard ResolutionSelector node; computes the
// preset-1 size live from aspect_ratio/megapixels/multiple siblings.
// Type MUST be the canonical registry key 'resolutionpreview':
// addWidget stores type.toLowerCase(), and widgetRegistry resolves
// 'resolutionpreview' (alias 'RESOLUTION_PREVIEW' is case-sensitive) —
// "RESOLUTION_PREVIEW" lowercases to 'resolution_preview', resolves to
// nothing and the row renders blank.
//
// ⛔ Created on the NEXT tick, never inside onNodeCreated: there the node has
// no id and is not in a graph yet, and the Vue preview resolves its host node
// ONCE and non-reactively (computed(() => resolveNode(nodeId))). A row mounted
// before the node joins the graph caches "no host", so its sibling lookups
// never run and it renders "—" forever (only a browser reload heals it).
function createPreview(node) {
  // Manual-preset rows (2-4) are independent of the native row and idempotent.
  ensurePresetPreviews(node);

  if (getWidget(node, "preview")) return; // already created

  const selectWidget = getWidget(node, "select");
  const selectVal = Number(selectWidget?.value);

  const previewWidget = node.addWidget(
    "resolutionpreview",
    "preview",
    null,
    () => {},
    {
      serialize: false,
      hideInPanel: true,
      canvasOnly: false,
      ratio_widget: selectVal === 1 ? "aspect_ratio" : "__preset_off__",
      megapixels_widget: "megapixels",
      multiple_widget: "multiple",
    }
  );
  previewWidget.serialize = false;

  // Move directly below the `multiple` widget (separators already placed)
  const multIdx = node.widgets.findIndex((w) => w.name === "multiple");
  if (multIdx >= 0) {
    const at = node.widgets.indexOf(previewWidget);
    if (at !== -1) node.widgets.splice(at, 1);
    node.widgets.splice(multIdx + 1, 0, previewWidget);
  }

  updateWidgetState(node, selectVal);
}

// ── Extension ──

app.registerExtension({
  name: "degg.res_set",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DeggResSet") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const ret = origOnNodeCreated?.apply(this, arguments);

      // Insert DOM separators (in reverse order to preserve indices)
      for (let i = GROUP_START.length - 1; i >= 0; i--) {
        const idx = GROUP_START[i];
        if (idx < 0 || idx > this.widgets.length) continue;
        const sepEl = makeSepDOM(SEP_LABELS[i]);
        this.addDOMWidget(`__grp_${i}`, "div", sepEl, {
          serialize: false,
          hideInPanel: true,
          getValue: () => null,
          setValue: () => {},
        });
        // Move the DOM widget to the correct position
        const sepWidget = this.widgets[this.widgets.length - 1];
        this.widgets.splice(this.widgets.length - 1, 1);
        this.widgets.splice(idx, 0, sepWidget);
      }

      // Adjust node height for extra separators (22px each + margins),
      // the native preview row, and the 3 manual-preset preview rows.
      this.setSize([
        this.size[0],
        this.size[1] + 26 * (GROUP_START.length + 1 + RES_PREVIEWS.length) + 16,
      ]);

      // ── ResolutionPreview row: deferred (see createPreview above) ──
      // At this point the node is not attached yet, so the row must wait one
      // tick. The creation is idempotent and also re-run from loadedGraphNode
      // in case the timer is throttled away.
      setTimeout(() => createPreview(node), 0);

      // ── Hook up select widget callback for enable/disable ──
      const node = this;
      const selectWidget = getWidget(node, "select");
      if (selectWidget) {
        const origCallback = selectWidget.callback;
        selectWidget.callback = function (val) {
          // Apply disable logic (use `node`, not `this` — `this` is the widget!)
          updateWidgetState(node, val);
          if (origCallback) origCallback.call(this, val);
        };
        // Apply initial state
        updateWidgetState(node, selectWidget.value);
      }

      return ret;
    };

    // ── Effective size of the last run (ui channel) ──
    // `process` returns {"ui": {"degg_res_size": {select, w, h}}}; the frontend
    // hands it to node.onExecuted(output) and also keeps it in app.nodeOutputs
    // (restored from cache / changeTracker, so the row survives a tab switch).
    const origOnExecuted = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (output) {
      const ret = origOnExecuted?.apply(this, arguments);
      const size = normalizeSize(output?.degg_res_size);
      if (size) {
        this.__deggResLast = size;
        updatePresetPreviews(this, getWidget(this, "select")?.value);
      }
      return ret;
    };

    // Live: wiring/unwiring w* / h* changes what the server actually uses.
    const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const ret = origOnConnectionsChange?.apply(this, arguments);
      updatePresetPreviews(this, getWidget(this, "select")?.value);
      return ret;
    };

    // ── Re-apply disabled state after deserialization ──
    // When switching tabs (or loading a workflow) LiteGraph re-runs `configure`
    // which resets widgets to disabled=false without firing the callback, so the
    // correct preset lock is lost. Here we re-apply it based on the current select.
    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const ret = origOnConfigure?.apply(this, arguments);
      const selectWidget = getWidget(this, "select");
      if (selectWidget) updateWidgetState(this, selectWidget.value);
      return ret;
    };
  },

  // Runs after a saved graph is loaded (tab switch / open workflow),
  // when widget values are already restored.
  loadedGraphNode(node) {
    if (node.comfyClass !== "DeggResSet") return;
    // Graph is fully attached here — safe place to (re)build the preview row
    // if its deferred creation was throttled away.
    createPreview(node);
    const selectWidget = getWidget(node, "select");
    if (selectWidget) updateWidgetState(node, selectWidget.value);
  },
});
