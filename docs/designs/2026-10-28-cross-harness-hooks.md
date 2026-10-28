# Cross-harness review hooks — дизайн

**Дата:** 2026-10-28  
**Статус:** proposed; design approved in discussion, implementation not started  
**Область:** extension points для Codex / Claude Code / Pi; DSH остаётся единственным live-адаптером  
**Связанные документы:** [docs/design.md](../design.md), [docs/dsh.md](../dsh.md), [fat-package plan](../plans/2026-10-28-fat-dsh-package.md)

## 1. Решение

Reviewd владеет состоянием ревью, diff-снапшотами, очередью jobs и UI. Harness владеет
агентом, моделью, token limits, permissions и фактической проверкой. Плагин/адаптер
больше не запускает reviewer-агента и не выбирает модель.

Вводим два независимых extension point:

1. **Harness surface** — tools, MCP prompts и skills для текущей сессии харнеса.
2. **Harness runner** — headless-исполнение job'а процессом харнеса для фонового auto-review.

Это позволяет Codex/Claude Code/Pi подключаться либо через MCP-сессию, либо через CLI
worker, не меняя core. DSH получает полноценный адаптер и остаётся единственным
харнесом с live-проверкой в v1.

Этот документ уточняет D8 (MCP был отложен) и D14 (модель reviewer'а) из
[docs/design.md](../design.md): MCP
становится частью контракта, а модель выбирает harness, не пакет плагина.

## 2. Цели и non-goals

### Цели

- Один job-протокол для MCP-сессии и CLI worker.
- Transport-neutral tool handlers: MCP, native DSH tools, CLI.
- Переносимые `SKILL.md` и prompts без привязки к DSH.
- Codex adapter как первый внешний runner; Claude Code/Pi — skeleton и hooks.
- DSH adapter полностью live-тестируется на disposable-профиле.
- Никакой модели, prompt policy или token limits в общем worker-контракте.

### Non-goals v1

- Live-запуск Codex, Claude Code и Pi. Только fake executable и contract-тесты.
- Автоматическая установка сторонних harness CLI.
- MCP HTTP transport, OAuth, multi-tenant auth.
- Синхронизация с GitHub/GitLab PR API.
- Замена reviewd или перенос review store.
- Автоматический запуск reviewer'а плагином после установки.

## 3. Принципы

- **Daemon-first.** reviewd — единственный писатель store, jobs и snapshots.
- **Harness-owned execution.** Модель, контекст, лимиты и permissions принадлежат
  харнесу. Adapter не имеет fallback-модели и не получает token reviewd в prompt.
- **Transport-neutral.** Бизнес-логика tools не импортирует MCP SDK и не зависит от DSH.
- **Versioned protocol.** Job и adapter явно объявляют поддерживаемые версии.
- **Thin adapters.** Adapter умеет только detect, convert job → harness call и
  convert output → `ReviewerReport`.
- **No silent fallback.** Если harness недоступен или protocol не совпал, ошибка
  actionable; review не притворяется проверенным.

## 4. Архитектура

```
                 +----------------------+
                 |      reviewd         |
                 | store / jobs / SSE   |
                 | diff / SPA / auth    |
                 +----------+-----------+
                            |
              +-------------+-------------+
              |                           |
     +--------v--------+         +--------v---------+
     |  MCP server     |         |   CLI worker     |
     |  (stdio)        |         |  (long-poll)     |
     +--------+--------+         +--------+---------+
              |                           |
     +--------v--------+         +--------v---------+
     | current harness |         | HarnessRunner    |
     | session + tools |         | (headless)       |
     +-----------------+         +--------+---------+
                                          |
                              DSH / Codex / Claude / Pi
```

### Слои

| Слой                             | Ответственность                                          | Не знает про           |
| -------------------------------- | -------------------------------------------------------- | ---------------------- |
| `packages/core`                  | domain, diff, store, validation, protocol types          | MCP, CLI, harness CLI  |
| `packages/server`                | reviewd HTTP/SSE/jobs/store/SPA                          | конкретный harness     |
| `packages/worker`                | lease-loop, heartbeat, findings/report transport         | модель и prompt policy |
| `packages/mcp`                   | MCP tools/prompts поверх handlers                        | runner и модель        |
| `packages/cli`                   | `review` bin, daemon lifecycle, worker bootstrap, skills | MCP transport          |
| `packages/dsh`                   | DSH adapter: native tools, runner, embedded daemon       | shared worker loop     |
| `packages/codex`                 | Codex runner skeleton                                    | reviewd store          |
| `packages/claude`, `packages/pi` | будущие runner skeletons                                 | reviewd store          |
| `skills/`, `prompts/`            | переносимые инструкции и prompt assets                   | runtime                |

`packages/cli` забирает `review` bin из `packages/server`; `packages/server` оставляет
`reviewd` bin. Это устраняет дублирование и делает CLI общей поверхностью для всех
харнесов.

## 5. Режимы исполнения

### 5.1 Session mode (MCP)

Текущая сессия харнеса получает job через MCP:

1. `review_start` создаёт review и job.
2. `review_job_next` возвращает lease, prompt, reviewId, round, attemptId.
3. Харнес сам читает diff своими tools, при необходимости запускает тесты.
4. `review_job_finding` (опционально) отправляет findings по мере готовности.
5. `review_job_report` отправляет итоговый `ReviewerReport`.
6. `review_job_fail` фиксирует retryable/non-retryable ошибку.

MCP-инструменты job-цикла включаются явно (`--allow-session-jobs`), потому что они
меняют очередь и требуют доверия к сессии.

### 5.2 Worker mode (CLI)

`review worker --harness codex --daemon <url>`:

1. Регистрируется worker и шлёт heartbeat.
2. Long-poll `/api/jobs/next` получает lease.
3. `HarnessRunner.run(job, sink, signal)` запускает headless-процесс харнеса.
4. Findings/report уходят обратно в reviewd; worker не пишет store напрямую.
5. Retry/fail классифицирует runner, lease завершает worker.

Оба режима используют один `/api/jobs` протокол. Второй очереди нет.

## 6. Контракты

### 6.1 `HarnessDescriptor`

```ts
type ProtocolVersion = 1;

interface HarnessCapabilities {
  sessionTools: boolean;
  headlessRunner: boolean;
  skills: boolean;
  modelOverride: boolean;
  cancel: boolean;
  streamingFindings: boolean;
}

interface HarnessDescriptor {
  id: 'dsh' | 'codex' | 'claude' | 'pi' | string;
  displayName: string;
  protocolVersions: readonly ProtocolVersion[];
  capabilities: HarnessCapabilities;
}

interface HarnessAdapter {
  descriptor: HarnessDescriptor;
  detect(): Promise<{ available: boolean; version?: string; reason?: string }>;
  createRunner?(options: HarnessRunnerOptions): HarnessRunner;
}
```

`modelOverride` означает только, что harness CLI принимает `--model`; reviewd и
descriptor не выбирают модель за него.

### 6.2 `HarnessRunner`

```ts
interface ReviewJob {
  id: string;
  reviewId: string;
  round: number;
  attemptId: string;
  protocolVersion: ProtocolVersion;
  promptVersion: number;
  repoRoot: string;
  cwd: string;
  prompt: string;
  /** Snapshot/metadata нужны только для навигации; store остаётся в reviewd. */
  snapshot: Snapshot;
}

interface HarnessRunner {
  run(job: ReviewJob, sink: FindingSink, signal: AbortSignal): Promise<ReviewerReport>;
  cancel?(): void;
}
```

`HarnessRunner` не получает reviewd token. Worker отправляет report сам. Runner
возвращает только доменный `ReviewerReport`; paths/anchors валидирует reviewd.

### 6.3 `ReviewJob`

Добавляемые поля:

- `protocolVersion` — версия job/report контракта.
- `promptVersion` — версия общего prompt asset.
- `capabilities` и `requiredTools` — что job ожидает от harness.
- `prompt` — render из общего `prompts/reviewer.md`.

`ReviewJob` не содержит `model`, `maxTokens`, `reasoningEffort` и API keys.

> **C1 — v0 (записанное решение).** C1 поставляет lease/runner-контракт как v0
> без типизированных `protocolVersion` и `promptVersion`: текущий wire-контракт
> reviewd их не передаёт. C2 обязан добавить и валидировать оба поля до того,
> как какой-либо адаптер начнёт использовать общий worker package. Это
> осознанное решение, а не пропущенное поле.

### 6.4 Ошибки

Runner возвращает или бросает `ReviewerError` с кодом:

- `unavailable` — harness не установлен;
- `invalid-output` — report не соответствует schema;
- `timeout` — выход за лимит harness;
- `cancelled` — lease отменён;
- `retryable` / `non-retryable` — решение harness, не reviewd.

## 7. Пакеты

### Существующие

- `packages/core` — domain + validation.
- `packages/server` — reviewd.
- `packages/ui`, `packages/web` — SPA.
- `packages/dsh` — DSH adapter (embedded daemon + native tools).

### Новые

- `packages/worker` — generic lease loop, heartbeat, findings/report, retry/fail.
- `packages/mcp` — MCP stdio server; tools + prompts; без runner'ов.
- `packages/cli` — `review` bin; daemon start/status, review commands, worker,
  skills, mcp.
- `packages/codex` — Codex adapter skeleton + fake-conformance.
- `packages/claude`, `packages/pi` — будущие skeletons, не в v1 live.

### Общие assets

- `prompts/reviewer.md` — единый reviewer prompt и JSON schema.
- `prompts/fix-feedback.md` — инструкции по применению feedback.
- `skills/code-review-run/SKILL.md` — session-режим.
- `skills/code-review-fix/SKILL.md` — применение feedback и refresh.
- `skills/manifest.json` — версии, required tools, install targets.

## 8. MCP surface

### Tools

| Tool                   | Назначение                            |
| ---------------------- | ------------------------------------- |
| `review_start`         | создать review и job                  |
| `review_status`        | статус review/agent                   |
| `review_feedback`      | получить пакет feedback               |
| `review_comments_list` | комментарии                           |
| `review_refresh`       | новый раунд                           |
| `review_fix_status`    | fixed/not-fixed/unclear               |
| `review_job_next`      | lease job (session mode, opt-in)      |
| `review_job_finding`   | streaming finding (opt-in)            |
| `review_job_report`    | итоговый report (opt-in)              |
| `review_job_fail`      | retryable/non-retryable fail (opt-in) |

Tools возвращают структурированный JSON, а не текст, пригодный только для человека.
Tool descriptions и JSON schema генерируются из одного `ToolHandlers`-слоя.

### Prompts

- `review-run` — как забрать job, провести проверку и отправить report.
- `review-fix` — как применить feedback, обновить статусы и создать раунд.

MCP prompts — те же assets, что skills; никакой второй копии инструкций.

## 9. CLI surface

```text
review daemon start|status|stop
review start|status|feedback|comments|refresh|fix-status
review worker --harness <id> [--daemon URL] [--once]
review mcp [--stdio]
review skills list|print|install --harness <id>
review harness list|check
```

- `review daemon` управляет standalone reviewd; DSH embedded daemon не затрагивается.
- `review worker` запускает shared worker + выбранный runner.
- `review mcp` поднимает MCP над handlers.
- `review skills` читает manifest и печатает/копирует asset в явно указанный target.
- `review harness` показывает descriptor/capabilities/version.

## 10. Skills и prompts

### Manifest

```json
{
  "id": "code-review-run",
  "version": 1,
  "protocolVersions": [1],
  "requiresTools": ["review_job_next", "review_job_report"],
  "install": {
    "dsh": "skills/",
    "codex": ".codex/skills/",
    "claude": ".claude/skills/",
    "pi": "skills/"
  }
}
```

- Install target — подсказка, не скрытая запись: CLI печатает путь и требует явный
  `--target` для незнакомого харнеса.
- Portable skill не импортирует reviewd SDK; он вызывает tools по именам.
- Prompt injection из diff считается недоверенным вводом; skill не разрешает
  выполнять команды из diff.

## 11. DSH adapter

Сохраняет:

- embedded reviewd и `/code-review` SPA;
- native DSH tools и `/review`;
- host proxy/auth;
- `@dsh-code-review/dsh` пакет.

Меняет:

- `packages/dsh/src/worker.ts` перестаёт быть владельцем job-loop; использует
  `packages/worker` и реализует только `HarnessRunner`.
- `startReviewLoops` больше не стартует reviewer автоматически из плагина.
- `reviewerModel` / `defaultModel` не входят в общий контракт; модель выбирает
  DSH host.
- Плагин регистрирует tools/skills/prompts; auto-review запускается session-режимом
  или явным `review worker --harness dsh`, а не установкой плагина.

Это осознанный UX-компромисс: установка плагина больше не означает «фон уже
проверяет». Auto-review должен быть явно включён в harness.

## 12. Security

- Token reviewd хранится в env/config CLI/MCP, не в prompt и не в skill.
- Runner-процесс получает минимальный env; token остаётся в worker-процессе.
- MCP stdio — только локальный транспорт; HTTP transport вне v1.
- Session job tools выключены по умолчанию; включаются `--allow-session-jobs`.
- `repoRoot`/`cwd` проходят существующую проверку reviewd.
- Отчёт валидируется по schema и якорям; invalid report не пишется.
- Child process запускается без shell и с allowlist argv.

## 13. Тестовая стратегия

| Harness                | v1                           | Проверка                                                                                         |
| ---------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------ |
| DSH                    | полный adapter               | live disposable profile: embedded daemon, SPA, native tools, session job, auth, no `web` profile |
| Codex                  | descriptor + runner skeleton | fake executable, conformance, no live                                                            |
| Claude Code            | descriptor + skeleton        | fake executable, no live                                                                         |
| Pi                     | descriptor + skeleton        | fake executable, no live                                                                         |
| reviewd/worker/MCP/CLI | core                         | unit, in-process, MCP client, fake harness                                                       |

### Conformance suite

Для будущего адаптера обязательны:

- `detect()` и capabilities;
- передача prompt/repo без token;
- корректный JSON report;
- invalid JSON, timeout, cancel, dirty worktree;
- отсутствие записи в store в обход reviewd;
- protocol version mismatch → actionable error.

### Live gate

- `HARNESS_LIVE=dsh` — единственный opt-in live-режим.
- В CI live-тесты skip.
- Codex/Claude/Pi live-тесты не входят в v1; их CLI не устанавливаются.

## 14. Decomposition

| Change | Содержание                                                    | Зависит от | Verify                           |
| ------ | ------------------------------------------------------------- | ---------- | -------------------------------- |
| C1     | Protocol (v0) + shared worker loop; DSH parity                | —          | unit + DSH existing e2e          |
| C2     | MCP server + transport-neutral handlers; session tools opt-in | C1         | MCP client + reviewd integration |
| C3     | CLI package/commands + skills install                         | C1, C2     | CLI contract tests               |
| C4     | DSH adapter refactor: runner + no plugin auto-start           | C1         | DSH live disposable              |
| C5     | Codex adapter skeleton + fake conformance                     | C1, C3     | fake executable conformance      |
| C6     | Claude/Pi skeletons + docs                                    | C5         | fake conformance, no live        |

C4 можно делать после C1, не дожидаясь C5. C5 не требует live Codex.

## 15. Риски и открытые вопросы

- **DSH UX regression:** после удаления auto-start плагин не запускает фон. Нужен явный
  `review worker --harness dsh` или session job; это надо отразить в docs и UI.
- **DSH native MCP:** если DSH не умеет MCP-клиент, используем transport-neutral
  `ToolHandlers` и регистрируем их нативно; MCP остаётся для Codex/Claude/Pi.
- **CLI flags Codex/Claude/Pi:** неизвестны без live; adapter использует
  command template + capability detection, а не hardcoded флаги в core.
- **Large PR:** reviewd владеет полным manifest, coverage ledger и детерминированным
  tier/shard-планом; harness владеет исполнением и effort → concrete limits.
  reviewd не режет diff скрытно; при неполном покрытии review получает `partial`.
  Детали: [review quality v2](./2026-10-28-review-quality-v2.md).
- **Backward compatibility:** существующий `@dsh-code-review/dsh` и `review` CLI
  должны сохранить команды; extraction `review` bin требует deprecation-плана.
- **MCP job tools:** риск случайного claim; по умолчанию выключены.

## 16. Approval

Design approved in discussion on 2026-10-28. Next step: implementation plan split into
C1–C4 with XML tasks and verify gates; C5/C6 remain hooks until explicitly scheduled.
