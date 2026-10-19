# Память сессии — Degg_Res_Set (2026-10-19)

> Покажи этот файл агенту, чтобы продолжить работу.
> Всегда сверяйся с `AGENTS.md` и `SPECIFICATION.md`.

---

## 1. Что делали в этой сессии (кратко)
Доделали строку-превью ResolutionPreview под `multiple`. Живой баг «строка не
рисуется» найден в исходниках фронтенда и исправлен (канонический тип
`'resolutionpreview'` вместо `"RESOLUTION_PREVIEW"`), пользователь подтвердил:
**«Работает»**. SPEC обновлён, два скила переписаны/исправлены (по явному
разрешению), код закоммичен `a08fd03`.

## 2. Итоговое состояние кода
- `web/js/deg_res_set.js:1` — **критично**: `const { app } = window.comfyAPI?.app;`.
- `web/js/deg_res_set.js:5`-`13` — `SEP_LABELS` ×4, `GROUP_START=[1,4,6,8]`,
  `makeSepDOM` — DOM-сепараторы (вставка циклом с конца).
- `web/js/deg_res_set.js:55` — `updateWidgetState(node, selectVal)`: гасит
  неактивные пресеты (`w.options.disabled`), переключает
  `prev.options.ratio_widget` на `__preset_off__` при `select≠1` (→ `—`).
- `web/js/deg_res_set.js:126` — `addWidget("resolutionpreview", "preview",
  null, () => {}, {serialize:false, hideInPanel:true, canvasOnly:false,
  ratio_widget:..., megapixels_widget:..., multiple_widget:...})`,
  `previewWidget.serialize=false`, splice под `multiple`, бамп высоты.
- `web/js/deg_res_set.js:~165-188` — три точки re-apply блокировки:
  `select.callback`, `onConfigure`, `loadedGraphNode`.
- `deg_res_set.py:51-59` — `process`: preset 1 round-паритет
  (`round(scale*ratio/multiple)*multiple`), 2-4 passthrough.
- `tests/_test_preview.py` — детектор канонического типа + serialize×2 +
  позиция + switch + round `(1928,1088)`/`(1776,1184)` + guard.
- `tests/_test_dom_sep.py` — регрессия сепараторов.

## 3. Проблемы, которые встречались (и как решали)
- **Живой баг 19.10: пустое место вместо строки, ошибок нет.** Причина:
  `LGraphNode.addWidget` сохраняет `type.toLowerCase()`
  (`LGraphNode.ts:2248`), реестр `widgetRegistry.ts` ищет case-sensitive:
  базовый ключ `'resolutionpreview'`, алиас `'RESOLUTION_PREVIEW'` заглавными.
  Литерал `"RESOLUTION_PREVIEW"` → `'resolution_preview'` (лишнее
  подчёркивание) → `getComponent(widget.type)` (`WidgetItem.vue:71`) → `null`
  → ряд не монтируется. Лечение: тип `"resolutionpreview"` + `canvasOnly:false`
  (зеркало фабрики; сам `canvasOnly` эквивалентен отсутствию —
  `BaseWidget.ts:192` читает `value === true`).
- Приёмка: красный `FAIL: 1` до правки → зелёный → мутация тип→uppercase
  `FAIL: 1` → восстановлено. `check.py` — ЗЕЛЁНОЕ (warn = git-предохранитель,
  не поставлен — known).

## 4. Что важно не сломать при продолжении работы
- **НИКОГДА не менять импорт** `const { app } = window.comfyAPI?.app;`.
- **Тип превью только `'resolutionpreview'`** (без подчёркивания) — иначе
  молчаливая пустота. Не писать `"RESOLUTION_PREVIEW"`.
- Не добавлять `preview` в `INPUT_TYPES` (required-missing = ошибка сервера).
- Serialize превью в ОБА канала (`options.serialize:false` + raw-строка).
- Три точки re-apply блокировки (callback/onConfigure/loadedGraphNode) не удалять.
- `GROUP_START=[1,4,6,8]` — порядок `INPUT_TYPES` (select, aspect_ratio,
  megapixels, multiple, w1..h3); вставка сепараторов с конца.
- Python preset 1 — только `round()`, не `floor()` (паритет с фронтендом).
- Правки в исходник `F:\...\Degg_Res_Set\` → `check.py` → `sync.py` → рестарт + Ctrl+F5.

## 5. Следующие шаги (идеи, не сделано)
- Живо проверить `—` при `select≠1` и реактивность подмены `ratio_widget`
  (допущение о store-реактивности не доказано — если не гаснет, фолбэк из
  скила `comfyui-resolution-preview`).
- Поставить git-предохранитель `_process/hooks/pre-commit` (warn в check.py).
- Обновить `check.json` проекта (файла нет — check.py гоняет только синтаксис/тесты).

## 6. Связанные файлы
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\{deg_res_set.py, web\js\deg_res_set.js, SPECIFICATION.md, tests\_test_preview.py, tests\_test_dom_sep.py}`
- Скилы (обновлены 19.10): `.opencode|.kilo|.agents\skills\comfyui-resolution-preview\SKILL.md` (исправлен баг-паттерн, ловушка типа), `...\comfyui-res-set\SKILL.md` (переписан под 4 пресета)
- Рабочая копия: `D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\Degg_Res_Set\` (синк после фикса)
