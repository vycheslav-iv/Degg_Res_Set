# Degg Res Set — SPECIFICATION

## 1. Назначение

Гибридная нода разрешений: **4 пресета**, переключаемых через `select`.

- **Preset 1** — расчёт ширины/высоты из aspect ratio + мегапиксели + кратность (аналог стандартного `ResolutionSelector`).
- **Presets 2-4** — ручной ввод трёх пар ширина/высота (как оригинальная Degg Res Set v1).

## 2. Файлы

| Файл | Назначение |
|------|-----------|
| `deg_res_set.py` | Python-класс `DeggResSet` — 4 пресета, расчёт ResolutionSelector |
| `web/js/deg_res_set.js` | LiteGraph-расширение: 4 визуальных сепаратора, дизейбл/активация виджетов, строка превью ResolutionPreview + 3 DOM-строки «W × H» для ручных пресетов |
| `__init__.py` | Экспорт маппингов, `WEB_DIRECTORY` |
| `tests/_test_preview.py` | Тест превью-строки (канонический тип, serialize×2, позиция, switch, round-паритет, отложенное создание, идемпотентность, `Number(select)`) |
| `tests/_test_dom_sep.py` | Регрессия DOM-сепараторов |
| `tests/_smoke_res_set_previews.mjs` | Смоук строк «W × H» пресетов 2-4 (создание/позиция/hide/live/switch/идемпотентность, фактический размер с провода) |
| `tests/_test_process_ui.py` | Тест `ui`-канала `process()`: фактический размер (в т.ч. пришедший по проводу) уходит в `executed`/`app.nodeOutputs` |

## 3. Python: класс DeggResSet

### INPUT_TYPES

#### Обязательные поля

| Поле | Тип | По умолчанию | Min | Max | Step | Описание |
|------|-----|-------------|-----|-----|------|----------|
| `select` | `INT` | `1` | `1` | `4` | `1` | Выбор активного пресета |
| `aspect_ratio` | `COMBO` | `"1:1 (Square)"` | — | — | — | Соотношение сторон (Preset 1). 8 вариантов (см. ниже) |
| `megapixels` | `FLOAT` | `1.0` | `0.1` | `16.0` | `0.1` | Целевое количество мегапикселей (Preset 1) |
| `multiple` | `INT` | `8` | `8` | `128` | `4` | Кратность выравнивания размера (Preset 1) |
| `w1` / `h1` | `INT` | `512` / `512` | `1` | `16384` | `1` | Ширина/высота Preset 2 |
| `w2` / `h2` | `INT` | `768` / `768` | `1` | `16384` | `1` | Ширина/высота Preset 3 |
| `w3` / `h3` | `INT` | `1024` / `1024` | `1` | `16384` | `1` | Ширина/высота Preset 4 |

#### Варианты aspect_ratio

| Значение | Соотношение | Описание |
|----------|-------------|----------|
| `"1:1 (Square)"` | 1:1 | Квадрат |
| `"2:3 (Portrait Photo)"` | 2:3 | Портретное фото |
| `"3:2 (Photo)"` | 3:2 | Альбомное фото |
| `"3:4 (Portrait Standard)"` | 3:4 | Портретный стандарт |
| `"4:3 (Standard)"` | 4:3 | Стандартный экран |
| `"9:16 (Portrait Widescreen)"` | 9:16 | Портретный широкий |
| `"16:9 (Widescreen)"` | 16:9 | Широкий экран |
| `"21:9 (Ultrawide)"` | 21:9 | Ультраширокий |

### OUTPUT

- `RETURN_TYPES = ("INT", "INT")`
- `RETURN_NAMES = ("width", "height")`
- `OUTPUT_NODE = False`

`process()` возвращает **не голый кортеж**, а dict — размер дублируется в
`ui`-канале, чтобы фронтенд узнал ФАКТИЧЕСКИЙ размер (в т.ч. пришедший по
проводу, см. §4.5):

```python
{"ui": {"degg_res_size": [{"select": 2, "w": 1600, "h": 1920}]},
 "result": (1600, 1920)}
```

⛔ **Значение `ui` — ОДНОЭЛЕМЕНТНЫЙ СПИСОК, не dict.** `execution.py`
склеивает ui батчевых вызовов так:

```python
ui = {k: [y for x in uis for y in x[k]] for k in uis[0].keys()}
```

Dict-значение итерируется → до клиента доезжает список КЛЮЧЕЙ
(`"degg_res_size": ["select", "w", "h"]`), т.е. ровно живой симптом
`512 × 512` без изменений до прогона. Проверено пробой: `POST /prompt` → `/history` показал
`["select", "w", "h"]`, выходы при этом верные (3240 × 4320). После обёртки в
список тот же пробник даёт `"degg_res_size": [{"select": 2, "w": 3240, "h": 4320}]`.

ComfyUI отправляет `ui` в событии `executed` → `node.onExecuted(output)` и
складывает в `app.nodeOutputs` (переживает переключение вкладки/кэш ноды).

### Логика process()

#### Preset 1 (select = 1) — Расчёт через ResolutionSelector

```python
ratio_w, ratio_h = _parse_aspect(aspect_ratio)   # "16:9 (Widescreen)" → (16, 9)
total_pixels = megapixels * 1_048_576             # 1.0 MP → 1_048_576 px
scale = sqrt(total_pixels / (ratio_w * ratio_h))  # масштаб на единицу соотношения
w = round(scale * ratio_w / multiple) * multiple  # round() — ties to even
h = round(scale * ratio_h / multiple) * multiple
```

- Множитель `1_048_576` = 1024² (стандарт: 1.0 MP = 1024×1024 для квадрата)
- Формула идентична `comfy_extras/nodes_resolution.py` (ResolutionSelector) и
  фронтенд-виджету `WidgetResolutionPreview` (`roundHalfToEven`) — строка превью
  всегда совпадает с фактическими выходами
- `round()` — банковское округление (ties to even), как у Python в стандарте
- Результат всегда кратен `multiple` (по умолчанию 8); кламп `max(x, multiple)` убран:
  при min `megapixels = 0.1` округление до 0 невозможно

#### Presets 2-4 (select = 2, 3, 4) — Ручной ввод

- `select = 2` → возвращает `(w1, h1)`
- `select = 3` → возвращает `(w2, h2)`
- `select = 4` → возвращает `(w3, h3)`

### Вспомогательные методы

```python
@staticmethod
def _parse_aspect(aspect_str):
    """Из '16:9 (Widescreen)' → (16, 9)"""
    parts = aspect_str.split(" ")[0]
    w, h = parts.split(":")
    return int(w), int(h)
```

## 4. JS: расширение LiteGraph

### Импорт app

```javascript
const { app } = window.comfyAPI?.app;
```

- ⚠️ `window.comfyAPI.app` — это **неймспейс**, а не инстанс. Настоящий инстанс лежит
  в `window.comfyAPI.app.app`. Деструктуризация `const { app } = window.comfyAPI?.app;`
  извлекает `.app` из неймспейса и даёт правильный инстанс.
- **НЕЛЬЗЯ** заменять на `const app = window.comfyAPI?.app ?? ...` — так `app` станет
  самим неймспейсом, у которого нет `registerExtension`, и extension упадёт на старте
  (пропадут сепараторы и блокировка).

### 4.1. Визуальные сепараторы (DOM-based)

4 разделителя между группами виджетов, реализованы через **DOM-виджеты** (`addDOMWidget`):

| Индекс | Текст | Позиция |
|--------|-------|---------|
| 0 | `═══ ASPECT RATIO (Preset 1) ═══` | Перед aspect_ratio |
| 1 | `═══ PRESET 2 ═══` | Перед w1 |
| 2 | `═══ PRESET 3 ═══` | Перед w2 |
| 3 | `═══ PRESET 4 ═══` | Перед w3 |

#### Почему DOM, а не canvas

Старый подход использовал canvas-виджеты с `draw()` — в Nodes 2.0 они рендерятся с артефактами
(обрезанные линии, мусор) и легко ломаются при изменении layout. DOM-виджеты стабильнее.

#### Реализация

- `GROUP_START = [1, 4, 6, 8]` — исходные индексы вставки (до смещения)
- Вставка в обратном порядке (с конца) для сохранения позиций
- Высота сепаратора: 22px + 2px margin = 26px
- Автоматическое увеличение высоты ноды: `+26 * (4 + 1 + 3) + 16 = 224px` (4 сепаратора + строка превью пресета 1 + 3 строки пресетов 2-4)
- `makeSepDOM(label)` создаёт `div` с CSS:
  - `height: 22px`, `border-top`, `background: rgba(50,50,50,0.04)`
  - `color: #888`, `font: bold 10px sans-serif`
  - `pointer-events: none` (не перехватывает клики)
- `addDOMWidget(name, "div", el, { serialize: false, hideInPanel: true, ... })`
- После создания виджет перемещается через `widgets.splice` на нужную позицию

### 4.2. Дизейбл/активация виджетов

При переключении `select` активными остаются только виджеты выбранного пресета:

| select | Активные виджеты | Заблокированы |
|--------|-----------------|---------------|
| 1 | aspect_ratio, megapixels, multiple | w1/h1, w2/h2, w3/h3 |
| 2 | w1, h1 | aspect_ratio, megapixels, multiple, w2/h2, w3/h3 |
| 3 | w2, h2 | aspect_ratio, megapixels, multiple, w1/h1, w3/h3 |
| 4 | w3, h3 | aspect_ratio, megapixels, multiple, w1/h1, w2/h2 |

#### Функции

- `getWidget(node, name)` — поиск виджета по имени
- `setWidgetDisabled(w, disabled)` — установка disabled:
  ```javascript
  function setWidgetDisabled(w, disabled) {
    if (!w) return;
    if (w.options) w.options.disabled = disabled; // ComboWidget: disabled живёт в options
    try { w.disabled = disabled; } catch (_) {}   // fallback для старых версий
  }
  ```
  Для `ComboWidget` (в т.ч. `aspect_ratio`) в ComfyUI v0.27+ `disabled` **read-only** и читается из `w.options.disabled`, поэтому обязателен обход через `options`.
- `updateWidgetState(node, selectVal)` — дизейбл/активация всех виджетов по значению select

#### Re-apply после десериализации (onConfigure)

Блокировка задаётся через `select.callback`, который срабатывает **только при ручном изменении**.
При переключении вкладок воркфлоу / загрузке JSON нода десериализуется: LiteGraph вызывает
`configure()`, восстанавливает значения виджетов напрямую (через `.value`, минуя callback)
и сбрасывает `disabled` у всех виджетов в `false`. Поэтому блокировка слетала.

Решение — хук `onConfigure`, пере-применяющий состояние по актуальному `select` после каждого config:

```javascript
const origOnConfigure = nodeType.prototype.onConfigure;
nodeType.prototype.onConfigure = function () {
  const ret = origOnConfigure?.apply(this, arguments);
  const selectWidget = getWidget(this, "select");
  if (selectWidget) updateWidgetState(this, selectWidget.value);
  return ret;
};
```

#### Re-apply через loadedGraphNode (гарантированный путь)

`onConfigure` (LiteGraph) срабатывает на node-уровне, но самый надёжный хук — extension-хук
`loadedGraphNode`, который фронтенд вызывает **для каждой ноды после** загрузки графа
(вкладки / открытие воркфлоу), когда значения виджетов уже восстановлены:

```javascript
loadedGraphNode(node) {
  if (node.comfyClass !== "DeggResSet") return;
  const selectWidget = getWidget(node, "select");
  if (selectWidget) updateWidgetState(node, selectWidget.value);
}
```

Оба хука идемпотентны и могут срабатывать вместе — повторное применение одного и того же
состояния безопасно.

#### Важно: контекст callback

Внутри `selectWidget.callback` контекст `this` — виджет, а не нода. Ссылка на ноду сохраняется во внешней переменной:

```javascript
const node = this;  // в onNodeCreated
selectWidget.callback = function (val) {
    updateWidgetState(node, val);  // node — захваченная ссылка
    ...
};
```

### 4.3. Строка превью ResolutionPreview

Под виджетом `multiple` живёт строка `1928 × 1088  2.00 МП` — штатный Vue-виджет
`WidgetResolutionPreview`, создаваемый с каноническим ключом реестра
`resolutionpreview` (тот же компонент, что в обновлённом стандартном
`ResolutionSelector`).

> ⛔ **Тип — это канонический ключ, а не имя из схемы.** `LGraphNode.addWidget`
> сохраняет `type.toLowerCase()` (`LGraphNode.ts`), реестр `widgetRegistry.ts`
> ищет в case-sensitive `Map`: базовый ключ `'resolutionpreview'`, алиас
> `'RESOLUTION_PREVIEW'`. Литерал `"RESOLUTION_PREVIEW"` превращается в
> `'resolution_preview'` (лишнее подчёркивание) → `getComponent(widget.type)`
> → `null` → **ряд рендерится пустым без единой ошибки в консоли** (живой баг
> 19.10.2026). Детектор: `tests/_test_preview.py` (мутация тип→uppercase = FAIL: 1).

#### ⛔ Создание — на следующем тике, не в `onNodeCreated`

Ряд обязан создаваться **после подключения ноды к графу**. В `onNodeCreated`
нода ещё без id (`UNASSIGNED_NODE_ID`) и вне графа: `createNode` зовёт конструктор
→ `onNodeCreated()`, и только потом `graph.add(node)`, где `attachNodeToStores`
регистрирует виджеты в `widgetValueStore` и будит Vue-рендер. Компонент превью
резолвит хост **один раз и нереактивно** —
`hostNode = computed(() => resolveNode(nodeId))`, а `resolveNode`
(`utils/litegraphUtil.ts`) читает `app.rootGraph.getNodeById` без реактивных
зависимостей. Ряд, смонтированный в этом окне, кэширует `hostNode = undefined`
навсегда: sibling-значения не читаются, `resolution = null` → постоянный `—`.
F5 лечит (новый инстанс компонента) — это отпечаток mount-race.

Живой баг 19–20.10.2026: на только что созданной ноде строка считалась, после
перезапуска ComfyUI / открытия сохранённого воркфлоу — `—` при живом пресете 1.

Создание вынесено в идемпотентную `createPreview(node)`; вызовы:

```javascript
// onNodeCreated (после сепараторов):
setTimeout(() => createPreview(node), 0);   // макротаска — после флаша Vue
// loadedGraphNode: createPreview(node)      // граф уже собран (страховка от
//                                           // троттлинга таймера)
```

`onConfigure` ряд НЕ создаёт: он выполняется внутри `LGraph.configure`, то есть
до `graph.add(node)` — то же опасное окно.

```javascript
function createPreview(node) {
  if (getWidget(node, "preview")) return;        // идемпотентно
  const selectVal = Number(getWidget(node, "select")?.value);
  const previewWidget = node.addWidget(
    "resolutionpreview", "preview", null, () => {},
    {
      serialize: false,          // не попадает в prompt
      hideInPanel: true,         // не рендерится в панели свойств
      canvasOnly: false,         // зеркало фабрики (эквивалентно отсутствию:
                                 // BaseWidget читает `value === true`)
      ratio_widget: selectVal === 1 ? "aspect_ratio" : "__preset_off__",
      megapixels_widget: "megapixels",
      multiple_widget: "multiple",
    }
  );
  previewWidget.serialize = false;   // не сохраняется в widgets_values
  const multIdx = node.widgets.findIndex((w) => w.name === "multiple");
  if (multIdx >= 0) {
    const at = node.widgets.indexOf(previewWidget);
    if (at !== -1) node.widgets.splice(at, 1);
    node.widgets.splice(multIdx + 1, 0, previewWidget);
  }
  updateWidgetState(node, selectVal);
}
```

> ⚠️ Пере-создание ряда задним числом не помогает: `WidgetGrid.vue` ключует
> строки по `renderKey = <widgetId>:<type>`, поэтому `removeWidget` + `addWidget`
> с тем же именем/типом переиспользует инстанс Vue и кэш `hostNode` устаивает.
> Родственный симптом — `WidgetDOM.vue` (сепараторы): он тоже ищет хост только в
> `onMounted` и при отсутствии молча оставляет пустой `<div>`.

#### Ключевые свойства

- **Сервер не участвует:** входа `preview` в `INPUT_TYPES` нет, prompt его не
  содержит — никаких последствий для валидации/выполнения.
- **Значения могут приходить строками** (`select: "1"` из JSON) — `updateWidgetState`
  нормализует их через `Number()`, иначе `selectVal === 1` ложно и `ratio_widget`
  навсегда уходит в `__preset_off__` (тот же `—`).
- **Не сериализуется** дважды (`options.serialize=false` и `widget.serialize=false`) —
  старые воркфлоу и восстановление `widgets_values` не затрагиваются.
- **Математика компонента:** `roundHalfToEven` (паритет с Python `round()`), формула
  идентична `nodes_resolution.py` — строка не врёт про выходы.
- **Честность при `select≠1`:** `updateWidgetState` переключает
  `preview.options.ratio_widget` на несуществующий `__preset_off__` → компонент не
  находит ratio → показывает `—`; при `select == 1` возвращается `aspect_ratio`.
  Переключение живёт в единственной точке (`updateWidgetState`), которую вызывают
  callback select + `onConfigure` + `loadedGraphNode`.
- **Высота ноды:** строка учитывается в `+24 * (GROUP_START.length + 1 + RES_PREVIEWS.length) + 16`.

### 4.4. Строки «W × H» ручных пресетов 2-4

Под каждой парой `w*`/`h*` (пресеты 2-4) стоит строка, показывающая **ровно то,
что нода подаёт на выход** в формате `1080 × 1080`. Пресет 1 такую строку уже
имел (нативный `WidgetResolutionPreview`), но тот **вычисляет** размер только из
`aspect_ratio` + `megapixels` + `multiple` — произвольные ручные `w/h` показать
не может. Поэтому для пресетов 2-4 строка сделана DOM-виджетом.

- `RES_PREVIEWS = [{key:"__res_preview_2", w:"w1", h:"h1", preset:2}, ...]`
  (аналогично 3 и 4) — единая таблица «строка → пара виджетов → номер пресета».
- `makeResPreviewDOM()` — `div` в стиле нативного ряда: `height:24px` (`h-6`),
  `display:flex`, `gap:8px`, `padding:0 8px`, `border-radius:6px`, `font:12px`,
  фон `var(--component-node-widget-background)`, текст
  `var(--component-node-foreground)`; стартовое значение `—`.
- `ensurePresetPreviews(node)` — идемпотентна (guard по `node.__deggResPreviews[key]`),
  создаёт `addDOMWidget(key, "div", el, {serialize:false, hideInPanel:true, ...})`,
  переносит виджет `splice`-ом **сразу под свой `h`**; вставка идёт в порядке
  убывания (сначала под `h3`), чтобы индексы `h2`/`h1` не сдвигались.
- `updatePresetPreviews(node, selectVal)` — активный пресет → `${w} × ${h}`,
  остальные → `—` (то же поведение, что у строки пресета 1).
- `hookSizeWidgets(node)` оборачивает `callback` у `w1,h1..w3,h3` (legacy **и**
  Nodes 2.0 зовут именно `widget.callback`, `node.onWidgetChanged` в новом UI не
  вызывается) → строка обновляется в момент правки числа.
- Точка вызова — начало `createPreview(node)` (рядом с нативным рядом, тот же
  отложенный тик) + `loadedGraphNode`; `updateWidgetState` перерисовывает текст
  при смене `select`.
- ⛔ `hideInPanel:true` — строка не попадает в панель свойств.
- ⛔ **`widget.serialize = false` — СВОЙСТВО виджета**, а не только опция:
  `serializeWidgetValues()` фильтрует по `w.serialize === false`, поле
  `options.serialize` он не читает. С одной опцией `""` попадало в
  `widgets_values` / `widgets_values_named` (нативная строка `preview` задаёт
  оба — поэтому её там нет).
- Детектор: `tests/_smoke_res_set_previews.mjs` — красный до фикса (`FAIL: 27`),
  6 мутаций (нет вызова / вставка до `h` / неверный разделитель / нет hook /
  сериализация / не гасится `—`) дают RED.

### 4.5. Значение, пришедшее ПО ПРОВОДУ: одна цифра — фактический размер

Если `w*`/`h*` сконвертирован в input и подключён, ComfyUI **игнорирует виджет**
и передаёт в `process()` значение из провода. Показывать только виджет — ложь
(«512 × 512» при фактических 1600 × 1920). Фронтенд не может узнать это значение
до прогона: типовой источник (`GetImageSize`, core) вообще не имеет виджетов —
он считает размер из картинки и отдаёт его в `progress_text` + выходы INT.

Поэтому:

- `process()` кладёт фактический размер в `ui` (§3 OUTPUT) — это значение уже
  после подстановки провода, т.е. ровно то, что уйдёт в граф.
- `nodeType.prototype.onExecuted(output)` (обёртка с сохранением оригинала)
  читает `output.degg_res_size` (**список** → `[0]`, см. §3 OUTPUT) →
  `node.__deggResLast = {select, w, h}` →
  перерисовка строк.
- `lastResolvedSize(node)` — сначала `__deggResLast`, иначе `app.nodeOutputs`
  (восстановленные выходы при загрузке воркфлоу / кэше ноды); ключ пробуется и
  числом, и строкой (`app.nodeOutputs[node.id] ?? app.nodeOutputs[String(node.id)]`).
- ⭐ **После F5 `app.nodeOutputs` пуст** (changeTracker живёт в памяти), поэтому
  размер с провода догоняется из `/history?max_items=10`: самая свежая запись
  (по `prompt[0]`, номер в очереди) с `outputs[nodeId].degg_res_size` для ЭТОЙ
  ноды → `__deggResLast` → перерисовка. Запрос один раз на ноду
  (`HISTORY_BUSY`), не затирает уже известное значение. Триггеры: `loadedGraphNode`
  (открыли воркфлоу после перезагрузки) и `reconnected` (обрыв связи, `executed`
  потерян). `onNodeOutputsUpdated()` (возврат на вкладку —
  `ChangeTracker.restore → app.nodeOutputs`) перерисовывает строки активного графа.
- `isInputWired(node, name)` — `node.inputs` содержит запись с живым `link`
  (виджет, сконвертированный в input, появляется в `node.inputs`).
- `onConnectionsChange` (обёртка) перерисовывает строки: подключение/отключение
  провода меняет то, что реально использует сервер.
- Формат строки — ОДНО число, без «←» и без замещения виджетом:
  - без провода — значение виджета (`512 × 512`), правка видна сразу (сервер
    всё равно берёт виджет, ждать прогона нечего);
  - с проводом и известным размером — ТОЛЬКО фактический (`1600 × 1920`);
  - с проводом до первого прогона реального размера нет ни у кого → значение
    виджета (`512 × 512`), затем его заменяет фактический.
- Размер привязан к номеру пресета (`last.select === spec.preset`): прогон
  пресета 3 не подставляет 2048 × 2048 в строку пресета 2 (там снова значение
  виджета).
- ⚠️ Пресет 1 (нативная строка) по-прежнему считает из виджетов
  `aspect_ratio`/`megapixels`/`multiple` — если их подключить проводом, нативная
  строка покажет расчёт по значениям виджетов, а не по проводу.
- Детекторы: `tests/_test_process_ui.py` (красный до фикса `FAIL: 12`;
  п.4b симулирует merge из `execution.py` — dict-значение даёт `FAIL: 4`) и
  `tests/_smoke_res_set_previews.mjs` (красный до фикса `FAIL: 10`; после
  задач «одно число» + «раскладка/догон истории» — `FAIL: 7` и `FAIL: 18`);
  19 мутаций, все RED: P1-P3 (`result` списком / `select` захардкожен / нет `ui`),
  P4 (`ui` без list-обёртки → `FAIL: 4`), J1 (`normalizeSize` не разворачивает
  список → `FAIL: 3`), M1-M7 (нет `widget.serialize` / `isInputWired` всегда false /
  игнор номера пресета / `onExecuted` не сохраняет / нет фолбэка `app.nodeOutputs` /
  нет правой части / нет `onConnectionsChange`), M8-M14 (нет `ROW_LAYOUT_OPTS`
  у строк превью → `FAIL: 6` и у сепараторов → `FAIL: 8` / нет `arrangeSoon` →
  `FAIL: 2` / catch-up отключён → `FAIL: 1` / история в обратном порядке →
  `FAIL: 1` / нет `onNodeOutputsUpdated` → `FAIL: 1` / `arrangeSoon` без
  `arrange()` → `FAIL: 2`).

### 4.6. Раскладка: высота DOM-строк — в ОПЦИЯХ `addDOMWidget`

Симптом: после обновления страницы кружки сокетов `w1`/`h1` нарисованы **выше**
своих строк (около сепаратора «PRESET 2»), а отключение/подключение провода
«лечит» — раскладка пересчитывается.

Механика (исходники фронтенда 1.57.6, `nodeDefStore-*.js`):

- `_arrangeWidgets` ставит `widget.y` последовательно, высоту берёт из
  `computeSize()` → `computeLayoutSize()` → иначе `NODE_WIDGET_HEIGHT+4`;
- у DOM-виджета `computeLayoutSize()` = `minHeight: options.getMinHeight?.() ?? 50`
  — **без `getMinHeight` каждый наш ряд считается 50px**, хотя CSS у него 26px;
- `_arrangeWidgetInputSlots` ставит сокет в `widget.y + NODE_SLOT_HEIGHT/2`, т.е.
  сокеты наследуют ошибку `widget.y`;
- `arrange()` вызывается, пока `_widgetSlotsDirty` (ставится `addWidget`), и до
  монтирования DOM; после монтирования повторного пересчёта нет — ошибка живёт
  до следующего изменения связей.

Лечение: `getMinHeight`/`getMaxHeight` = `DOM_ROW_H` (26) **в опциях**
`addDOMWidget` (и у сепараторов, и у строк превью) + `arrangeSoon(node)` —
`setTimeout(…, 0)` с `node.arrange()` (и `setDirtyCanvas(true, true)`) после
создания строк; вызывается из `ensurePresetPreviews`, т.е. и на создании ноды,
и из `loadedGraphNode`. `arrange()` обёрнут в `if (node.graph)`: вне графа он
бросает `NullGraphError`.


## 5. Категория

`My_custom_nodes/Res`

## 6. Рабочая копия

`D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\Degg_Res_Set\`
