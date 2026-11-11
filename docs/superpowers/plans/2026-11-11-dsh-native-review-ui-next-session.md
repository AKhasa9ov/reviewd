# DSH Native Review UI — промт для следующей сессии

Скопируй текст ниже в новую сессию. Это самодостаточный стартовый промт: он не требует истории предыдущего диалога.

---

Ты — Senior Software Engineer в DeepSeek Harness. Работай по уже утверждённому дизайну, не перепроектируй его без новой причины.

## Задача

Перенести весь функционал standalone-приложения reviewd в нативную панель `Code Review` внутри DSH, без iframe и без потери standalone SPA.

Утверждённые решения:

- нативный React в слоте `main`, ключ `code-review`;
- полный паритет: список, создание, детали, diff, комментарии, findings, submit, edit, health;
- тот же daemon/store, что у standalone;
- компактный DSH-native chrome: `Reviews | New review | Health`, без вложенного sidebar reviewd;
- настройки репозиториев — не в панели, а в `DSH Settings → Code Review` через `settings.section`;
- standalone SPA и `/code-review/...` ссылки продолжают работать;
- UI-текст на английском, как в существующем продукте.

## Рабочая копия

```bash
cd /home/superuser/projects/dsh-code-review-fat
git branch --show-current   # ожидается feat/review-quality-r1
git log -1 --oneline        # базовая точка 662b70a
```

Это worktree для реализации. Не работай в `/home/superuser/projects/dsh-code-review` и не меняй активный профиль DSH без отдельного разрешения.

### Важно: не трогать чужой WIP

В рабочем дереве уже могут быть изменены три файла, не относящиеся к этой задаче:

- `packages/core/src/diff/snapshot.ts`
- `packages/server/src/daemon/routes.ts`
- `packages/server/src/daemon/server.ts`

Не форматируй, не коммить, не откатывай и не включай их в task-коммиты. Перед каждым коммитом добавляй только файлы своей задачи.

## Сначала прочитай

1. `docs/superpowers/specs/2026-11-11-dsh-native-review-ui-design.md` — утверждённый дизайн.
2. `docs/superpowers/plans/2026-11-11-dsh-native-review-ui.md` — план реализации с задачами, кодом, verify и commit-командами.
3. `packages/web/src/App.tsx`, `packages/web/src/router.tsx`, `packages/web/src/pages/`.
4. `packages/ui/src/theme.tsx`, `packages/ui/src/primitives/Dialog.tsx`, `packages/ui/src/styles.css`.
5. `packages/dsh/src/host.ts`, `packages/dsh/src/embedded.ts`, `packages/dsh/client.js`, `scripts/build.mjs`.

План — источник истины по порядку работ. Если код в репозитории разошёлся с планом, сначала зафиксируй расхождение в ответе и предложи минимальную правку плана, а не молча меняй архитектуру.

## Порядок работы

Используй `superpowers:subagent-driven-development` или `superpowers:executing-plans` (по выбору реализации). Работай волнами из плана:

1. **Волна 1 — standalone foundation:** Tasks 1–5.
2. **Волна 2 — native rendering:** Tasks 6–8.
3. **Волна 3 — parity/settings:** Tasks 9–10.
4. **Волна 4 — docs/verify:** Tasks 11–12.

Для каждой задачи:

1. Прочитай её `Files`, `Interfaces`, шаги и verify.
2. Сначала напиши падающий тест из плана, запусти его и убедись, что он падает по ожидаемой причине.
3. Реализуй минимальный код.
4. Запусти указанный verify.
5. Сделай один атомарный commit только с файлами задачи.
6. Между волнами запускай полный `pnpm test`.

Не начинай Task 6, пока Tasks 1–5 не зелёные. Не начинай Task 9, пока native bundle из Task 8 не собирается и не проходит bundle-test.

## Критические ограничения

- Никакого iframe и никакого Shadow DOM.
- Стили reviewd не должны глобально менять `html`, `body`, `:root`, `#root` внутри DSH.
- Нельзя монтировать второе приложение в `document.body`.
- `ReviewDetail` и dialogs должны остаться в light DOM: они используют `document.getElementById`, focus restoration и порталы.
- Native API всегда same-origin: `/api/code-review`. DSH-сессия — граница авторизации; форму токена в панели не добавлять.
- Не менять store по умолчанию. Текущий профиль использует внешний daemon; embedded `storeDir` — только явный override. Один writer на store.
- В панели не должно быть вкладки/ссылки Settings. `Manage repositories` на странице New review в native-режиме скрывается; настройки доступны в DSH Settings.
- `/code-review/...` hrefs у нативных ссылок сохраняются как fallback для middle-click/new-tab.
- Внешние feedback-ссылки `/code-review/review/<id>` по-прежнему открывают standalone SPA; автоматический deep-link в нативную панель — вне scope.
- Не публиковать пакет, не менять версию npm и не мутировать `~/.dsh-canary/profiles/web` без явного разрешения человека.

## Проверки

Для отдельных задач — команды из плана. Перед финалом:

```bash
pnpm build
pnpm docs:check
pnpm format
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm verify` объединяет первые семь шагов. Все гейты должны пройти. Если падает форматирование — исправляй только файлы своей задачи. Максимум 3 попытки на гейт, затем эскалируй с задачей, гейтом и последними 50 строками ошибки.

Дополнительно проверь сгенерированный артефакт:

```bash
rg -n "__ModuleLoader__|cr-native-scope|settings.plugins.tab|react/jsx-runtime" packages/dsh/client.js | head -20
```

И убедись, что в bundle-test нет unscoped `html/body/:root/#root` селекторов.

## Live DSH — только после разрешения

Юнит- и integration-тесты обязательны. Живую проверку в DSH выполняй только с явного согласия человека:

- не меняй активный профиль без backup;
- не запускай два daemon на одном store;
- открой существующий GUI, панель Code Review, создай/открой review, проверь diff/full-file/comment/finding/submit/edit;
- открой DSH Settings → Code Review, сохрани репозиторий;
- сохрани screenshot/transcript в `/tmp/reviewd-native-*.png` и укажи точный URL.

Без разрешения в отчёте пиши `Live DSH: NOT RUN`, не выдавай это за проверенное.

## Что вернуть в конце

- список коммитов по задачам;
- результаты `pnpm verify` и `pnpm test:e2e`;
- число нативных тестов;
- путь к live evidence или `NOT RUN` с причиной;
- остаточные риски: standalone fallback, external deep links, store writer, DSH slot compatibility;
- явное подтверждение, что три чужих WIP-файла не попали в коммиты.

Не останавливайся на плане или анализе: начни с Task 1 из плана, если рабочее дерево и baseline совпадают с ожидаемыми. Если baseline не совпадает — сначала покажи diff и спроси, как поступить.
