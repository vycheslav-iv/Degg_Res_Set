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

      // Adjust node height for extra separators (22px each + margins) + preview row
      this.setSize([this.size[0], this.size[1] + 26 * (GROUP_START.length + 1) + 16]);

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
