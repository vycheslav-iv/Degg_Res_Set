# Память сессии — Degg_Res_Set (2026-10-20)

> Покажи этот файл агенту, чтобы продолжить работу.
> Всегда сверяйся с `AGENTS.md` и `SPECIFICATION.md`.

---

## 1. Что делали в этой сессии (кратко)
Вылечили второй живой баг строки-превью: после перезапуска ComfyUI / открытия
сохранённого воркфлоу под `multiple` был постоянный `—` при живом пресете 1
(лечил только F5). Причина — mount-race: ряд создавался в `onNodeCreated`, где
нода без id и вне графа. Создание отложено на следующий тик + вызывается из
`loadedGraphNode`. Пользователь подтвердил: **«Сейчас работает»**. SPEC §4.3
обновлён, скил `comfyui-resolution-preview` дополнен, коммит `ff34f24` запушен.

## 2. Итоговое состояние кода
- `web/js/deg_res_set.js:1` — **критично**: `const { app } = window.comfyAPI?.app;`.
- `web/js/deg_res_set.js:5`-`13` — `SEP_LABELS` ×4, `GROUP_START=[1,4,6,8]`,
  `makeSepDOM` — DOM-сепараторы (вставка циклом с конца).
- `web/js/deg_res_set.js:55` — `updateWidgetState(node, selectVal)`:
  `selectVal = Number(selectVal)` (значения из JSON бывают строками `"1"`),
  гасит неактивные пресеты (`w.options.disabled`), переключает
  `prev.options.ratio_widget` на `__preset_off__` при `select≠1` (→ `—`).
- `web/js/deg_res_set.js:108` — **`createPreview(node)`**: идемпотентная
  (`if (getWidget(node,"preview")) return`), `addWidget("resolutionpreview", …)`
  с `ratio_widget` по текущему select, `serialize=false` в двух каналах,
  splice под `multiple`, затем `updateWidgetState`.
- `web/js/deg_res_set.js:176` — `setTimeout(() => createPreview(node), 0)` в
  `onNodeCreated` (макротаска = после флаша Vue); `onConfigure` (строка 200)
  ряд НЕ создаёт; `loadedGraphNode` (строка 210) — вызывает `createPreview`.
- `deg_res_set.py:51-59` — `process`: preset 1 round-паритет
  (`round(scale*ratio/multiple)*multiple`), 2-4 passthrough.
- `tests/_test_preview.py` — 12 проверок: тип/`serialize`×2/позиция/switch/
  round-паритет `(1928,1088)`/`(1776,1184)`/guard + п.7-12: отложенное
  создание, отсутствие синхронного `createPreview(` в `onNodeCreated`,
  идемпотентность, вызов из `loadedGraphNode`, `onConfigure` без создания,
  `Number(selectVal)`.
- `tests/_test_dom_sep.py` — регрессия сепараторов.

## 3. Проблемы, которые встречались (и как решали)
- **Живой баг 19.10: пустое место вместо строки, ошибок нет.** Тип
  `"RESOLUTION_PREVIEW"` → `toLowerCase` → `'resolution_preview'` → нет в
  case-sensitive `widgetRegistry` → `getComponent` = `null`. Лечение: тип
  `"resolutionpreview"` (см. `SPECIFICATION.md` §4.3).
- **Живой баг 20.10: `—` после рестарта/загрузки воркфлоу.** `createNode` →
  `onNodeCreated` (id = `UNASSIGNED_NODE_ID`, `node.graph` пуст) → только потом
  `graph.add` → `attachNodeToStores`. Компонент резолвит хост один раз и
  нереактивно (`computed(() => resolveNode(nodeId))`, а `resolveNode` читает
  `app.rootGraph.getNodeById` без реактивных зависимостей) → кэш
  `hostNode=undefined` навсегда → sibling-значения не читаются → `—`.
  Лечение: `setTimeout(…, 0)` + `loadedGraphNode`. Пере-создание виджета не
  помогает: `WidgetGrid.vue` ключует строки по `<widgetId>:<type>` → тот же
  инстанс Vue и тот же кэш.
- Приёмка mount-race: красный `FAIL: 6` до правки → `OK` → мутации
  (defer→FAIL:2, guard→FAIL:1, Number→FAIL:1, onConfigure→FAIL:1,
  loadedGraphNode→FAIL:1), все восстановлены. `check.py` — ЗЕЛЁНОЕ
  (warn = git-предохранитель не поставлен, known).

## 4. Что важно не сломать при продолжении работы
- **НИКОГДА не менять импорт** `const { app } = window.comfyAPI?.app;`.
- **Тип превью только `'resolutionpreview'`** (без подчёркивания) — иначе
  молчаливая пустота. Не писать `"RESOLUTION_PREVIEW"`.
- **Ряд превью создавать ТОЛЬКО на следующем тике** (`createPreview` из
  `setTimeout`/`loadedGraphNode`), не в `onNodeCreated` и не в `onConfigure` —
  там нода ещё не в графе (`—` навсегда после загрузки воркфлоу).
- Не добавлять `preview` в `INPUT_TYPES` (required-missing = ошибка сервера).
- Serialize превью в ОБА канала (`options.serialize:false` + raw-строка).
- Три точки re-apply блокировки (callback/onConfigure/loadedGraphNode) не удалять.
- `GROUP_START=[1,4,6,8]` — порядок `INPUT_TYPES` (select, aspect_ratio,
  megapixels, multiple, w1..h3); вставка сепараторов с конца.
- Python preset 1 — только `round()`, не `floor()` (паритет с фронтендом).
- Правки в исходник `F:\...\Degg_Res_Set\` → `check.py` → `sync.py` → рестарт + Ctrl+F5.

## 5. Следующие шаги (идеи, не сделано)
- Живо проверить подмену `ratio_widget` при переключении пресетов (гаснет ли
  строка в `—` без перезагрузки) — теперь на это не влияет mount-race.
- Поставить git-предохранитель `_process/hooks/pre-commit` (warn в check.py).
- Обновить `check.json` проекта (файла нет — check.py гоняет только синтаксис/тесты).

## 6. Связанные файлы
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\{deg_res_set.py, web\js\deg_res_set.js, SPECIFICATION.md, tests\_test_preview.py, tests\_test_dom_sep.py}`
- Скил (дополнен 20.10): `.opencode|.kilo|.agents\skills\comfyui-resolution-preview\SKILL.md` — раздел «Mount-race», ловушки 8-9, приёмка п.7-12, мутации M1/M4/M5
- Рабочая копия: `D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\Degg_Res_Set\` (синк после фикса)
- Снапшот прошлой памяти: `SESSION_MEMORY-history/2026-10-19.md`
