const { app } = window.comfyAPI?.app;

const SEP_LABELS = [
  "\u2550\u2550\u2550 PRESET 1 \u2550\u2550\u2550",
  "\u2550\u2550\u2550 PRESET 2 \u2550\u2550\u2550",
  "\u2550\u2550\u2550 PRESET 3 \u2550\u2550\u2550",
];
const GROUP_START = [1, 3, 5];
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

app.registerExtension({
  name: "degg.res_set",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== "DeggResSet") return;

    const origOnNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const ret = origOnNodeCreated?.apply(this, arguments);

      for (let i = GROUP_START.length - 1; i >= 0; i--) {
        const idx = GROUP_START[i];
        if (idx < 0 || idx > this.widgets.length) continue;
        this.widgets.splice(idx, 0, makeSep(SEP_LABELS[i], i));
      }

      this.setSize([this.size[0], this.size[1] + SEP_H * GROUP_START.length + 16]);
      return ret;
    };
  },
});
