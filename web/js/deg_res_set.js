const { app } = window.comfyAPI?.app;

// ── Separators ──

const SEP_LABELS = [
  "\u2550\u2550\u2550 ASPECT RATIO (Preset 1) \u2550\u2550\u2550",
  "\u2550\u2550\u2550 PRESET 2 \u2550\u2550\u2550",
  "\u2550\u2550\u2550 PRESET 3 \u2550\u2550\u2550",
  "\u2550\u2550\u2550 PRESET 4 \u2550\u2550\u2550",
];

// Original (pre-insertion) indices for each separator
const GROUP_START = [1, 4, 6, 8];

const SEP_H = 24;

function makeSep(label, groupIdx) {
  return {
    name: "__grp",
    label: label,
    groupIdx: groupIdx,
    value: null,
    disabled: true,
    options: { serialize: false },
    type: "separator",
    computeSize(width) { return [width || 300, SEP_H]; },
    draw(ctx, node, width, y, h) {
      const w = width || node.size[0];
      ctx.save();
      ctx.fillStyle = "rgba(50,50,50,0.04)";
      ctx.fillRect(0, y, w, SEP_H);
      ctx.strokeStyle = "rgba(120,120,120,0.15)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(6, y + 1);
      ctx.lineTo(w - 6, y + 1);
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.font = "bold 10px sans-serif";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(this.label, 10, y + SEP_H / 2 + 2);
      ctx.restore();
    },
    onMouseDown() { return false; },
  };
}

// ── Widget helpers ──

/** Get a widget by name from the node */
function getWidget(node, name) {
  return node.widgets?.find((w) => w.name === name);
}

/** Enable or disable a widget (ComfyUI-safe, handles v0.27+ readonly getter) */
function setWidgetDisabled(w, disabled) {
  if (!w) return;
  try {
    w.disabled = disabled;
  } catch (_) {
    // ComfyUI >= 0.27 may throw if .disabled is a read-only getter
  }
}

/** Update widget enabled/disabled state based on select value */
function updateWidgetState(node, selectVal) {
  const ar = getWidget(node, "aspect_ratio");
  const mp = getWidget(node, "megapixels");
  const mult = getWidget(node, "multiple");
  const w1 = getWidget(node, "w1");
  const h1 = getWidget(node, "h1");
  const w2 = getWidget(node, "w2");
  const h2 = getWidget(node, "h2");
  const w3 = getWidget(node, "w3");
  const h3 = getWidget(node, "h3");

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

// ── Extension ──

app.registerExtension({
  name: "degg.res_set",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DeggResSet") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const ret = origOnNodeCreated?.apply(this, arguments);

      // Insert separators (in reverse order to preserve indices)
      for (let i = GROUP_START.length - 1; i >= 0; i--) {
        const idx = GROUP_START[i];
        if (idx < 0 || idx > this.widgets.length) continue;
        this.widgets.splice(idx, 0, makeSep(SEP_LABELS[i], i));
      }

      // Adjust node height for extra separators
      this.setSize([this.size[0], this.size[1] + SEP_H * GROUP_START.length + 16]);

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
  },
});
