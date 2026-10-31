// JS-смоук Degg_Res_Set: строка-превью «W × H» под КАЖДЫМ ручным пресетом.
//
// Задача: под w/h пресетов 2-4 добавить такую же строку, как у пресета 1,
// но показывающую ИМЕННО те числа, которые нода подаёт на выход
// (формат: `1080 × 1080`). Нативный WidgetResolutionPreview так не умеет — он
// считает размер только из aspect_ratio + megapixels + multiple, поэтому для
// ручных пресетов строка сделана DOM-виджетом, читающим w/h sibling'и.
//
// Проверки:
//   • 3 строки (по одной на пресет 2/3/4), каждая сразу под своим h;
//   • не сериализуются (widget.serialize=false, НЕ options) и скрыты из панели;
//   • активный пресет показывает `W × H`, неактивный — «—» (как пресет 1);
//   • правка w/h живым callback'ом обновляет строку;
//   • смена select переключает, какая строка живая;
//   • повторный вызов (loadedGraphNode) не дублирует строки;
//   • ⭐ подключённый w/h (сконвертирован в input) показывает ОДНО число —
//     фактический размер с провода: `1600 × 1920` (никаких «←» и замещения).
//     Источник — ui-канал своей же ноды
//     (`{"ui": {"degg_res_size": [{select, w, h}]}}` -> node.onExecuted;
//     значение — СПИСОК, execution.py склеивает ui по ключам),
//     до прогона — значение виджета; после загрузки воркфлоу / F5 — из
//     app.nodeOutputs, а если outputs потеряны — из /history;
//   • ⭐ высота каждой DOM-строки объявлена в ОПЦИЯХ addDOMWidget
//     (getMinHeight/getMaxHeight = 26): иначе arrange() считает widget.y по
//     дефолтным 50px, и сокеты w1/h1 рисуются не на своих строках до первого
//     переподключения провода.
//
// Запуск:  cd Degg_Res_Set && node tests/_smoke_res_set_previews.mjs
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const FILE = path.join(ROOT, "web", "js", "deg_res_set.js");

const errors = [];
const check = (label, cond, extra = "") => {
  if (!cond) errors.push(`${label}${extra ? "  [" + extra + "]" : ""}`);
};

let capturedExt = null;
const appInstance = {
  registerExtension: (e) => {
    capturedExt = e;
  },
  nodeOutputs: {},
  graph: { _nodes: [] },
};

// Заглушка /history: после F5 фронтенд outputs НЕ восстанавливает
// (changeTracker живёт только в памяти), поэтому реальный размер с провода
// догоняется запросом истории — как в comfyui-background-run-catchup.
let historyPayload = {};
const apiStub = {
  fetchApi: () => Promise.resolve({ ok: true, json: () => Promise.resolve(historyPayload) }),
};

function fakeEl() {
  return {
    className: "",
    style: { cssText: "" },
    textContent: "",
    appendChild() {},
    setAttribute() {},
  };
}

const timers = [];
const sandbox = {
  console,
  document: { createElement: () => fakeEl() },
  setTimeout: (fn) => {
    timers.push(fn);
    return timers.length;
  },
  clearTimeout: () => {},
  comfyAPI: { app: { app: appInstance }, api: { api: apiStub } },
};
sandbox.globalThis = sandbox;
sandbox.window = sandbox;
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(FILE, "utf8"), sandbox, { filename: "deg_res_set.js" });

check("расширение зарегистрировано", !!capturedExt);
if (!capturedExt) {
  console.log(`FAIL: ${errors.length}`);
  errors.forEach((e) => console.log(`  - ${e}`));
  process.exit(1);
}

const proto = {};
function NodeType() {}
NodeType.prototype = proto;
await capturedExt.beforeRegisterNodeDef(NodeType, { name: "DeggResSet" });
check("onNodeCreated перехвачен", typeof proto.onNodeCreated === "function");

function widget(name, value, options) {
  return { name, value, options: options || {} };
}

function makeNode() {
  const node = Object.create(NodeType.prototype);
  node.comfyClass = "DeggResSet";
  node.type = "DeggResSet";
  node.id = 5;
  node.size = [320, 700];
  node.inputs = [];
  node.widgets = [
    widget("select", 1),
    widget("aspect_ratio", "1:1 (Square)"),
    widget("megapixels", 1.0),
    widget("multiple", 8),
    widget("w1", 512),
    widget("h1", 512),
    widget("w2", 768),
    widget("h2", 768),
    widget("w3", 1024),
    widget("h3", 1024),
  ];
  node.addWidget = function (type, name, value, cb, options) {
    const w = { type: String(type).toLowerCase(), name, value, callback: cb, options: options || {} };
    this.widgets.push(w);
    return w;
  };
  node.addDOMWidget = function (name, type, el, options) {
    const w = { type, name, element: el, options: options || {} };
    this.widgets.push(w);
    return w;
  };
  node.setSize = function (s) {
    this.size = s;
  };
  node.graph = { setDirtyCanvas() {} };
  node.__arrangeCalls = 0;
  node.arrange = function () {
    this.__arrangeCalls++;
  };
  node.setDirtyCanvas = function () {};
  return node;
}

const node = makeNode();
node.onNodeCreated();
// Выполнить отложенное создание (setTimeout(..., 0) в onNodeCreated)
while (timers.length) timers.shift()();

const byName = (n, name) => (n.widgets || []).find((w) => w && w.name === name);
const idx = (n, name) => (n.widgets || []).findIndex((w) => w && w.name === name);

// ── 1. Три строки, каждая сразу под своим h ──────────────────────────────
for (const [key, hName] of [
  ["__res_preview_2", "h1"],
  ["__res_preview_3", "h2"],
  ["__res_preview_4", "h3"],
]) {
  const w = byName(node, key);
  check(`строка ${key} создана`, !!w);
  check(`строка ${key} сразу под ${hName}`, !!w && idx(node, key) === idx(node, hName) + 1);
  check(
    `строка ${key} не сериализуется и скрыта из панели`,
    !!w && w.options && w.options.serialize === false && w.options.hideInPanel === true
  );
  // Фронтенд фильтрует по СВОЙСТВУ widget.serialize (options.serialize он не
  // читает) — иначе "" попадает в widgets_values / widgets_values_named.
  check(`строка ${key} помечена widget.serialize=false`, !!w && w.serialize === false);
  check(`строка ${key} содержит DOM-элемент`, !!w && !!w.element);
}

// ── 2. Неактивные пресеты показывают «—», активный — свои w/h ────────────
const text = (key) => byName(node, key)?.element?.textContent;
const fire = (name, value) => {
  const w = byName(node, name);
  if (!w) return errors.push(`виджет ${name} не найден`);
  if (typeof w.callback !== "function") {
    return errors.push(`у виджета ${name} нет callback — правка не обновит строку`);
  }
  w.value = value; // как во фронтенде: значение меняется ДО callback'а
  w.callback(value);
};
check("select=1: пресет 2 = —", text("__res_preview_2") === "—", text("__res_preview_2"));
check("select=1: пресет 3 = —", text("__res_preview_3") === "—");
check("select=1: пресет 4 = —", text("__res_preview_4") === "—");

// Переключение select = 2 (через живой callback)
fire("select", 2);
check("select=2: пресет 2 = 512 × 512", text("__res_preview_2") === "512 × 512", text("__res_preview_2"));
check("select=2: пресет 3 = —", text("__res_preview_3") === "—");
check("select=2: пресет 4 = —", text("__res_preview_4") === "—");

// ── 3. Живая правка w/h обновляет строку ─────────────────────────────────
byName(node, "w1").value = 640;
byName(node, "h1").value = 360;
fire("w1", 640);
check("правка w1/h1 -> 640 × 360", text("__res_preview_2") === "640 × 360", text("__res_preview_2"));
byName(node, "h1").value = 480;
fire("h1", 480);
check("правка h1 -> 640 × 480", text("__res_preview_2") === "640 × 480", text("__res_preview_2"));

// ── 4. select=4 -> живая строка пресета 4 ────────────────────────────────
fire("select", 4);
check("select=4: пресет 4 = 1024 × 1024", text("__res_preview_4") === "1024 × 1024", text("__res_preview_4"));
check("select=4: пресет 2 = —", text("__res_preview_2") === "—");

const exec = (payload) => {
  if (typeof node.onExecuted !== "function") {
    return errors.push("у ноды нет onExecuted — фактический размер с провода не показать");
  }
  node.onExecuted(payload);
};

// ── 5. Значение, приходящее ПО ПРОВОДУ (w1/h1 сконвертированы в input) ────
// При подключённом входе сервер игнорирует виджет и берёт значение из провода,
// поэтому строка показывает ОДНО число — фактический размер, как только он
// известен (никаких «←» и замещения виджетом). До первого прогона реального
// размера нет ни у кого (источник может считать его на ходу) -> значение виджета.
fire("select", 2);
node.inputs = [{ name: "w1", type: "INT", link: 560 }];
fire("w1", 640); // живая перерисовка (реальный вызов идёт через select/hook)
check(
  "подключён w1, прогона ещё не было -> значение виджета 640 × 480",
  text("__res_preview_2") === "640 × 480",
  text("__res_preview_2")
);
check(
  "в строке нет «←» (замещения виджетом не показываем)",
  !text("__res_preview_2").includes("←"),
  text("__res_preview_2")
);

// Сервер отдаёт фактический размер в ui-канале (executed -> node.onExecuted)
exec({ degg_res_size: [{ select: 2, w: 1600, h: 1920 }] });
check(
  "после прогона -> только фактический 1600 × 1920",
  text("__res_preview_2") === "1600 × 1920",
  text("__res_preview_2")
);

// Размер принадлежит тому пресету, который реально выполнялся
fire("select", 3);
check(
  "select=3: пресет 3 без провода = 768 × 768",
  text("__res_preview_3") === "768 × 768",
  text("__res_preview_3")
);
check("select=3: пресет 2 = —", text("__res_preview_2") === "—");
fire("select", 2);
check(
  "возврат на пресет 2 сохраняет фактический размер",
  text("__res_preview_2") === "1600 × 1920",
  text("__res_preview_2")
);

// Прогон другого пресета не подставляет его размер в строку пресета 2
exec({ degg_res_size: [{ select: 3, w: 2048, h: 2048 }] });
check(
  "прогон другого пресета -> снова значение виджета 640 × 480",
  text("__res_preview_2") === "640 × 480",
  text("__res_preview_2")
);

// Восстановленные выходы (загрузка воркфлоу / кэш ноды) — из app.nodeOutputs
appInstance.nodeOutputs[node.id] = { degg_res_size: [{ select: 2, w: 1111, h: 2222 }] };
node.__deggResLast = null;
capturedExt.loadedGraphNode(node);
while (timers.length) timers.shift()();
check(
  "app.nodeOutputs: восстановленный размер 1111 × 2222",
  text("__res_preview_2") === "1111 × 2222",
  text("__res_preview_2")
);
delete appInstance.nodeOutputs[node.id];
node.__deggResLast = null;

// Провод сняли -> снова только значение виджета
node.inputs = [];
fire("w1", 640);
check("провод снят -> 640 × 480", text("__res_preview_2") === "640 × 480", text("__res_preview_2"));

// Без провода виджет — истина: правка после прогона видна СРАЗУ (не ждёт прогона)
exec({ degg_res_size: [{ select: 2, w: 1600, h: 1920 }] });
fire("w1", 900);
check(
  "без провода правка виджета видна сразу (900 × 480), а не размер прогона",
  text("__res_preview_2") === "900 × 480",
  text("__res_preview_2")
);
fire("w1", 640);

// Живое подключение провода (без правки виджетов) перерисовывает строку.
// Строка до этого — 640 × 480 (виджет), значит перерисовка обязана её сменить.
node.__deggResLast = { select: 2, w: 1600, h: 1920 };
node.inputs = [{ name: "h1", type: "INT", link: 561 }];
if (typeof node.onConnectionsChange !== "function") {
  errors.push("у ноды нет onConnectionsChange — подключение провода не обновит строку");
} else {
  node.onConnectionsChange(1, 1, true);
  check(
    "onConnectionsChange (подключение) -> фактический 1600 × 1920",
    text("__res_preview_2") === "1600 × 1920",
    text("__res_preview_2")
  );
  node.inputs = [];
  node.onConnectionsChange(1, 1, false);
  check(
    "onConnectionsChange (отключение) -> виджет 640 × 480",
    text("__res_preview_2") === "640 × 480",
    text("__res_preview_2")
  );
}
node.__deggResLast = null;

// ── 5c. Раскладка: высота DOM-строк = высоте нативной строки виджета ─────
// Симптом: кружки сокетов w1/h1 нарисованы ВЫШЕ своих строк, провод кончается
// над строкой; расхождение растёт с числом строк. Причина (замер живого DOM,
// user/degg_probe.json): сокет ставится в `widget.y + NODE_SLOT_HEIGHT/2`, где
// widget.y посчитан arrange() по computedHeight, а строка в Vue-сетке получает
// СВОЮ высоту. У нативного виджета обе величины равны 24 (NODE_WIDGET_HEIGHT 20
// + 4), поэтому у нативных строк расхождения нет. Наши строки объявляли 26, а
// в сетке сжимались до 13–15px: обёртка WidgetDOM — `flex flex-col *:flex-1`,
// её `flex:1 1 0%` перебивает height из cssText. Итог: цепочка widget.y (26 на
// строку) и сетка (17.4 на строку) расходятся, сокеты уезжают вверх.
// Контракт: DOM_ROW_H === 24 (как у нативной строки) + элемент не сжимается.
const DOM_ROW_H = 24;
for (const key of [
  "__grp_0",
  "__grp_1",
  "__grp_2",
  "__grp_3",
  "__res_preview_2",
  "__res_preview_3",
  "__res_preview_4",
]) {
  const o = byName(node, key)?.options;
  check(
    `${key}: getMinHeight=${DOM_ROW_H} в опциях`,
    typeof o?.getMinHeight === "function" && o.getMinHeight() === DOM_ROW_H,
    o?.getMinHeight ? String(o.getMinHeight()) : "нет"
  );
  check(
    `${key}: getMaxHeight=${DOM_ROW_H} в опциях`,
    typeof o?.getMaxHeight === "function" && o.getMaxHeight() === DOM_ROW_H,
    o?.getMaxHeight ? String(o.getMaxHeight()) : "нет"
  );
}
check(
  "после создания строк вызван arrange (пересчёт widget.y -> pos сокетов)",
  node.__arrangeCalls > 0,
  String(node.__arrangeCalls)
);

// Элемент обязан противостоять обёртке `flex flex-col *:flex-1` (иначе
// height из cssText игнорируется и строка в сетке ниже, чем в widget.y).
for (const key of [
  "__grp_0",
  "__grp_1",
  "__grp_2",
  "__grp_3",
  "__res_preview_2",
  "__res_preview_3",
  "__res_preview_4",
]) {
  const css = String(byName(node, key)?.element?.style?.cssText || "");
  check(
    `${key}: элемент не сжимается flex-обёрткой (flex:0 0 auto)`,
    /flex:0 0 auto/.test(css),
    css.slice(0, 90)
  );
  check(
    `${key}: height=${DOM_ROW_H}px без вертикальных margin`,
    new RegExp(`(^|;)height:${DOM_ROW_H}px(;|$)`).test(css) && !/margin:(?!0(;|$))/.test(css),
    css.slice(0, 90)
  );
}

check(
  "высота ноды выросла ровно на 24px на строку (+16)",
  node.size[1] - 700 === DOM_ROW_H * (4 + 1 + 3) + 16,
  `${node.size[1]}`
);

// ── 5d. После F5 фактический размер догоняется из /history ────────────────
// Фронтенд outputs после перезагрузки НЕ восстанавливает (changeTracker живёт
// в памяти), поэтому без запроса истории строка показывает значение виджета,
// хотя сервер берёт размер с провода.
historyPayload = {
  p1: { prompt: [1], outputs: { [String(node.id)]: { degg_res_size: [{ select: 2, w: 1080, h: 1440 }] } } },
  p2: { prompt: [2], outputs: { [String(node.id)]: { degg_res_size: [{ select: 2, w: 2048, h: 2731 }] } } },
};
node.inputs = [{ name: "w1", type: "INT", link: 560 }];
node.__deggResLast = null;
capturedExt.loadedGraphNode(node);
while (timers.length) timers.shift()();
await new Promise((r) => setImmediate(r));
check(
  "после F5 (провод) -> фактический из /history, самая свежая запись 2048 × 2731",
  text("__res_preview_2") === "2048 × 2731",
  text("__res_preview_2")
);
node.inputs = [];
fire("w1", 640);
check(
  "без провода история не подменяет виджет (640 × 480)",
  text("__res_preview_2") === "640 × 480",
  text("__res_preview_2")
);

// ── 5e. Возврат на вкладку: ChangeTracker.restore -> app.nodeOutputs ─────
node.inputs = [{ name: "w1", type: "INT", link: 560 }];
node.__deggResLast = null;
appInstance.nodeOutputs[node.id] = { degg_res_size: [{ select: 2, w: 1111, h: 2222 }] };
appInstance.graph._nodes = [node];
if (typeof capturedExt.onNodeOutputsUpdated !== "function") {
  errors.push("нет onNodeOutputsUpdated — возврат на вкладку не обновит строку");
} else {
  capturedExt.onNodeOutputsUpdated(appInstance.nodeOutputs);
  check(
    "onNodeOutputsUpdated -> 1111 × 2222",
    text("__res_preview_2") === "1111 × 2222",
    text("__res_preview_2")
  );
}
delete appInstance.nodeOutputs[node.id];
appInstance.graph._nodes = [];
historyPayload = {};

// ── 5f. Загрузка воркфлоу: после loadedGraphNode раскладка пересчитана ────
node.__arrangeCalls = 0;
capturedExt.loadedGraphNode(node);
while (timers.length) timers.shift()();
check(
  "loadedGraphNode -> arrange (сокеты встают на свои строки)",
  node.__arrangeCalls > 0,
  String(node.__arrangeCalls)
);

// ── 6. Повторный вызов (loadedGraphNode) не дублирует строки ─────────────
capturedExt.loadedGraphNode(node);
while (timers.length) timers.shift()();
const count = (name) => node.widgets.filter((w) => w && w.name === name).length;
for (const key of ["__res_preview_2", "__res_preview_3", "__res_preview_4", "preview"]) {
  check(`повторный loadedGraphNode не дублирует ${key}`, count(key) === 1, String(count(key)));
}

if (errors.length) {
  console.log(`FAIL: ${errors.length}`);
  errors.forEach((e) => console.log(`  - ${e}`));
  process.exit(1);
}
console.log("SMOKE OK: preset 2-4 size preview rows (create/place/hide/live/switch/wired/idempotent)");
process.exit(0);
