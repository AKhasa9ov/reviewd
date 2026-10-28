# Review quality v2 — coverage, context, precision

**Дата:** 2026-10-28  
**Статус:** approved for R1 implementation; R2–R6 remain proposed  
**Связанные документы:** [docs/design.md](../design.md),
[cross-harness hooks](./2026-10-28-cross-harness-hooks.md),
[review quality plan](../plans/2026-10-28-review-quality-roadmap-v2.md)

## 1. Решение

Большой PR нельзя ревьюить одним prompt'ом и нельзя молча обрезать. Reviewd
владеет полным манифестом изменённых файлов, покрытием, детерминированным
tier/shard-планом и агрегацией. Harness владеет агентом, моделью, tools и
конкретными лимитами исполнения.

R1 вводит **честное покрытие**: каждый изменённый файл присутствует в манифесте и
имеет явный статус. Если работа не завершена, review получает `partial`, а не
`done`.

## 2. Манифест и render subset

`Snapshot` v2 разделяет два разных объекта:

- `manifest: ReviewManifest` — **все** изменённые файлы, включая файлы за
  пределами render-бюджета, binary/generated/ignored, с причиной отсутствия
  патча;
- `files: FileDiff[]` — bounded subset для рендера diff в UI/prompt.

`maxFiles` и `maxDiffBytes` остаются бюджетами рендера, но **не** удаляют файлы из
манифеста. Для файла, у которого нет hunks, manifest всё равно содержит path,
status, added/deleted и причину (`per-file-cap`, `binary`, `ignored`,
`generated`, `legacy-truncated`).

Legacy snapshot v1 читается; синтезированный манифест получает warning
`legacy-truncated`.

## 3. Coverage

Статусы файла:

- `pending` — ещё не распределён/не проверен;
- `deep-reviewed`;
- `light-reviewed`;
- `manifest-only` — политика явно исключила содержимое (binary/generated/lockfile);
- `skipped` — пропущен с причиной;
- `no-hunks` — изменяемого содержимого нет (pure rename, mode-only, empty file,
  untracked symlink); терминальный, не «не проверен»;
- `deferred` — бюджет исчерпан;
- `failed`.

Terminal gate:

- `done` — все deep/light единицы успешны, у каждого файла финальный статус, нет
  `pending/skipped/deferred/failed`; `manifest-only` допустим только для
  policy-excluded файлов, `no-hunks` — для включённых файлов без изменяемого
  содержимого;
- `partial` — любая незавершённая/пропущенная работа;
- `failed` — не удалось получить coverage/aggregate.

`AgentStatus` получает `partial`. Review не может стать `done` только потому, что
пришёл report.

### 3.1 R1 bridge без shards

R1 ещё не умеет планировать shards, но обязан быть честным. Поэтому reviewd
строит coverage из manifest и **prompt coverage** при enqueue:

- файл с hunks, попавший в `Snapshot.files`, получает `pending`;
- файл без hunks и без бюджета (`added=deleted=0`), включая untracked symlink,
  получает терминальный `no-hunks` — он не должен навсегда делать раунд
  `partial`;
- файл без hunks/за render-бюджетом получает `skipped` с причиной
  (`render-budget`, `binary`, `ignored`) или `manifest-only` для policy-excluded;
- после принятого report `pending` становится `light-reviewed` — это означает
  «был в контексте единственного reviewer'а», а не «глубоко проверен»;
- review становится `done` только если нет `skipped/failed/deferred/pending`;
  иначе `partial`.

R3 заменит эту эвристику настоящим shard coverage. Legacy review без coverage
сохраняет `done`, чтобы не ломать исторические данные; новые snapshot v2 всегда
несут coverage.

## 4. Ownership

| Слой            | Владеет                                                                  |
| --------------- | ------------------------------------------------------------------------ |
| reviewd         | manifest, tier/shard plan, coverage ledger, aggregation, terminal status |
| harness adapter | model, tools, permissions, effort → concrete limits                      |
| worker contract | portable job, manifest, shard, effort; без model/token policy            |

R1 не создаёт shards; R2 создаёт tier plan, R3 создаёт shard jobs. R1 только
фиксирует данные и честный terminal status.

## 5. Protocol

`protocolVersion: 1`, `promptVersion: 1` на job/bundle. v0 worker допускается на
время миграции, но новые adapters (C2+) требуют v1. Никаких model/token limits в
общем worker-контракте.

## 6. Security

- Reviewer остаётся read-only: без shell, сети, записи и review-мутаций.
- Analysis не получает publish credentials.
- `AGENTS.md`, `CLAUDE.md`, `.dsh/**` — instructions; tier deep + human review.
- Streaming и independent reflector не входят в R1; они не должны расширять
  права reviewer'а.

## 7. Non-goals R1

- Полное ревью 882 файлов (это R3).
- Precision ranking/cap (R4).
- Dynamic budget/streaming (R5).
- Independent reflector (R6).
- Auto-fix, publish, multi-agent swarm.
