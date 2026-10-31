# Память сессии — Degg_Res_Set (2026-10-30)

> Покажи этот файл агенту, чтобы продолжить работу.
> Всегда сверяйся с `AGENTS.md` и `SPECIFICATION.md`.

---

## 1. Что делали в этой сессии (кратко)
Пользователь: под `w1/h1` (пресет 2) стоит `512 × 512`, а по проводу идёт
`1600 × 1920` — строка врёт. Сделали: `process()` теперь возвращает dict с
`ui.degg_res_size` (фактический размер ПОСЛЕ подстановки провода), фронтенд
читает его в `onExecuted` + фолбэк `app.nodeOutputs`, строка с проводом
показывает `512 × 512  ←  1600 × 1920` (до прогона `←  …`). Заодно исправлена
сериализация DOM-строк: `options.serialize` фронтенд НЕ читает — нужен
`widget.serialize = false` свойством.

## 2. Итоговое состояние кода
- `deg_res_set.py` — `process()` возвращает
  `self._result(select, w, h)`; `_result` (`@staticmethod`) →
  `{"ui": {"degg_res_size": {"select": int(select), "w": w, "h": h}},
  "result": (w, h)}`. `RETURN_TYPES/NAMES` не тронуты.
- `web/js/deg_res_set.js:50-84` — `isInputWired(node,name)` (живой `link` в
  `node.inputs`), `normalizeSize(payload)` (dict ИЛИ `[select,w,h]`,
  `Number.isFinite`), `lastResolvedSize(node)` (`__deggResLast` →
  `app.nodeOutputs[node.id] ?? [String(node.id)]` → `normalizeSize(out?.degg_res_size)`).
- `web/js/deg_res_set.js` `updatePresetPreviews` — неактивный/невалидный `—`;
  без провода `${w} × ${h}`; с проводом `${w} × ${h}  ←  ${last.select ===
  spec.preset ? W × H : "…"}` (два пробела вокруг `←`).
- `ensurePresetPreviews` — берёт объект из `addDOMWidget` (`added &&
  node.widgets.includes(added)`), ставит `domWidget.serialize = false`,
  вырезает через `indexOf` и вставляет после своего `h`.
- `beforeRegisterNodeDef` — обёртки `onExecuted` (→ `__deggResLast` + перерисовка)
  и `onConnectionsChange` (→ перерисовка), обе чейнят оригинал.
- `tests/_test_process_ui.py` — новый тест ui-канала (8 групп; пресет 1
  16:9/1MP/8 = **1368 × 768**, провод 1600×1920 побеждает виджет 512×512).
- `tests/_smoke_res_set_previews.mjs` — секция wired: `…` → `← 1600 × 1920`,
  привязка к `select`, чужой прогон → `…`, фолбэк `app.nodeOutputs`
  (1111 × 2222), снятие провода → `640 × 480`, `onConnectionsChange` (обе
  стороны), `w.serialize === false`.
- `tests/_test_preview.py` — п.5-6 читают `["result"]` через локальный
  `size(out)` (контракт `process` изменился; математика та же).

## 3. Проблемы, которые встречались (и как решали)
- **Строка врёт при подключённом проводе.** `GetImageSize` (core,
  `comfy_extras/nodes_images.py:866`) не имеет виджетов: считает размер из
  картинки, отдаёт INT-выходами и печатает `progress_text`; `app.nodeOutputs`
  у него пуст. До прогона значение не существует ни у кого → `…`.
- **`options.serialize` не работает.** `serialiseWidgetValues()` фильтрует по
  `w.serialize === false`; с одной опцией `""` попадало в
  `widgets_values_named` (мутация M1 = `FAIL: 3`).
- **Смена контракта `process()`.** Старый тест сравнивал кортеж с кортежем →
  `FAIL: 3`; правился ТЕСТ (п.5-6 через `size()`), не откат фичи (§2.3).
- Приёмка: красные базы — `tests/_test_process_ui.py` `FAIL: 12`,
  `_smoke_res_set_previews.mjs` `FAIL: 10`. 10 мутаций (P1 `result` списком,
  P2 `select` захардкожен, P3 нет `ui`, M1 нет `serialize`, M2 `isInputWired`
  false, M3 игнор номера пресета, M4 `onExecuted` не сохраняет, M5 нет
  фолбэка `app.nodeOutputs`, M6 нет правой части, M7 нет `onConnectionsChange`)
  — все RED. `check.py Degg_Res_Set` — ЗЕЛЁНОЕ (warn = git-предохранитель).

## 4. Что важно не сломать при продолжении работы
- **НИКОГДА не менять импорт** `const { app } = window.comfyAPI?.app;`.
- **Тип превью только `'resolutionpreview'`** (без подчёркивания).
- **Ряд превью создавать ТОЛЬКО на следующем тике** (`setTimeout` /
  `loadedGraphNode`), не в `onNodeCreated` и не в `onConfigure`.
- Не добавлять `preview` в `INPUT_TYPES`.
- `widget.serialize = false` — СВОЙСТВО (опции недостаточно); нативная строка
  `preview` задаёт оба канала.
- Правую часть строки (`← W × H`) показывать ТОЛЬКО при живом `link` и только
  если `last.select === spec.preset`; иначе `…` / чистое значение.
- `GROUP_START=[1,4,6,8]`; вставка сепараторов с конца; высота
  `+26*(GROUP_START.length+1+RES_PREVIEWS.length)+16`.
- Python preset 1 — только `round()`, не `floor()`.
- Правки в исходник → `check.py` → `sync.py` → рестарт ComfyUI + Ctrl+F5.

## 5. Следующие шаги (идеи, не сделано)
- **Живая приёмка не сделана**: ComfyUI на момент отчёта НЕ запущен
  (`server_info` → `running: false`, `curl :8188` → 000). Нужно открыть
  «Qwen Image 2.1 Upscaler 2», прогнать и убедиться, что под `w1/h1` появилось
  `512 × 512  ←  1600 × 1920` (нода 260 `GetImageSize` → links 560/561).
- Пресет 1 с подключёнными `aspect_ratio`/`megapixels`/`multiple` нативная
  строка по-прежнему считает по виджетам (не по проводу) — при желании
  расширить ui-канал на все 4 пресета.
- Поставить git-предохранитель `_process/hooks/pre-commit` (warn в check.py).
- Обновить `check.json` проекта (файла нет — check.py гоняет тесты авто).

## 6. Связанные файлы
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\{deg_res_set.py,
  web\js\deg_res_set.js, SPECIFICATION.md (§3 OUTPUT, §4.4, §4.5),
  tests\_test_process_ui.py, tests\_smoke_res_set_previews.mjs,
  tests\_test_preview.py, tests\_test_dom_sep.py}`
- Скил (дополнен 30.10): `.opencode|.kilo|.agents\skills\comfyui-resolution-preview\SKILL.md`
  — `serialize` свойством + раздел «Фактический размер, пришедший ПО ПРОВОДУ»
  (md5 `da5eb67cb0abb9d42366b2ecdd25b94e`, все три зеркала равны)
- Рабочая копия: `D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\Degg_Res_Set\`
  (синк выполнен, нужен рестарт ComfyUI)
- Снапшот прошлой памяти: `SESSION_MEMORY-history/2026-10-30.md`
