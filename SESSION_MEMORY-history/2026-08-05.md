# Память сессии — Custom_node_ComfyUI (2026-08-05)

> Покажи этот файл агенту, чтобы продолжить работу.
> Всегда сверяйся с `AGENTS.md` и `SPECIFICATION.md`.

---

## 1. Что делали в этой сессии (кратко)
Работали с нодой **Degg_Res_Set**. Чинили баг: после переключения вкладок воркфлоу
слетала блокировка виджетов неактивных пресетов. Допустили регресс (сломанный импорт app
убивал весь extension), но нашли и полностью восстановили рабочее состояние. Изменения
закоммичены и запушены в `1fb1d48`.

## 2. Итоговое состояние кода
- `Degg_Res_Set/deg_res_set.py:52-67` — `process`: 4 пресета. Preset 1 считает из aspect+MP+кратность, кламп `max(w/h, multiple)` на строках 59-60.
- `Degg_Res_Set/web/js/deg_res_set.js:1` — **критично**: `const { app } = window.comfyAPI?.app;` (иначе extension падает).
- `Degg_Res_Set/web/js/deg_res_set.js:57-64` — `setWidgetDisabled`: `w.options.disabled` + fallback `w.disabled`.
- `Degg_Res_Set/web/js/deg_res_set.js:135-141` — `onConfigure`-хук, пере-применение блокировки.
- `Degg_Res_Set/web/js/deg_res_set.js:146-150` — **`loadedGraphNode`**-хук (гарантированный re-apply после загрузки графа/вкладок).

## 3. Проблемы, которые встречались (и как решали)
- **Основной баг**: блокировка задавалась только через `select.callback`, который НЕ
   вызывается при десериализации (LiteGraph `configure()` ставит `.value` напрямую, сбрасывая
   `disabled`). Решение — `onConfigure` + `loadedGraphNode`, оба заново применяют
   `updateWidgetState` по актуальному `select`.
- **⚠️ РЕГРЕСС, который сломал ноду**: замена импорта на `const app = window.comfyAPI?.app ?? window.app ?? {}`
   возвращала **неймспейс** (а не инстанс), у которого нет `registerExtension` → extension падал,
   пропадали сепараторы и блокировка. Урок: `window.comfyAPI.app` — неймспейс,
   инстанс = `window.comfyAPI.app.app`. ВАЖНО: `const { app } = window.comfyAPI?.app;` — ЕДИНСТВЕННО правильный импорт.
- **`setWidgetDisabled`**: для ComboWidget (`aspect_ratio`) в v0.27+ `disabled` read-only, читается из `w.options.disabled`.

## 4. Что важно не сломать при продолжении работы
- **НИКОГДА не менять строку импорта** `const { app } = window.comfyAPI?.app;` (см. урок выше).
- Блокировка держится на трёх точках: callback (смена select вручную) + `onConfigure` + `loadedGraphNode`.
  Не удалять `loadedGraphNode` при правках.
- Позиции сепараторов `GROUP_START=[1,4,6,8]` = порядок `INPUT_TYPES`
  (`select, aspect_ratio, megapixels, multiple, w1, h1, w2, h2, w3, h3`). Вставка в обратном порядке.
- `onNodeCreated` при переключении вкладок вызывается заново (нода создаётся свежей),
   сепараторы не дублируются.
- Правки только в исходник `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\`,
   затем `python sync.py Degg_Res_Set` в рабочую копию.

## 5. Следующие шаги (идеи, не сделано)
- Проверить после перезапуска ComfyUI: переключение вкладок, блокировка пресетов, разделители.

## 6. Связанные файлы
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\deg_res_set.py`
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\web\js\deg_res_set.js`
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\__init__.py`
- `F:\AI_projects\Custom_node_ComfyUI\Degg_Res_Set\SPECIFICATION.md`
- Рабочая копия: `D:\ComfyUI_windows_portable\ComfyUI\custom_nodes\Degg_Res_Set\`