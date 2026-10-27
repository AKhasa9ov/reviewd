# Code Review Control Plane — дизайн

**Дата:** 2026-10-26
**Статус:** принято 2026-10-26; реализация — по планам в `docs/plans/`
**Рабочие имена:** репозиторий `dsh-code-review`, daemon `reviewd`, CLI `review`, Cordis bundle `dsh-code-review`
**Область v1:** harness-agnostic core + daemon + standalone web app + CLI + Docker + DSH-адаптер.
**Следующий change:** adapters для Pi / Claude Code / Codex (сначала CLI/MCP-совместимый контракт, затем упаковка).

---

## 0. Ключевые решения

| # | Решение | Почему | Статус |
|---|---------|--------|--------|
| D1 | Ядро ревью не знает про DSH/Cordis/React; DSH — один из адаптеров | Требование работы в Pi/Claude Code/Codex | принято |
| D2 | Daemon-first: `reviewd` владеет store, git, API, SPA, очередью jobs | Один писатель, стабильность, Docker, LAN | принято |
| D3 | Reviewer-агент запускается worker'ом harness'а; daemon его не порождает | В Docker нет чужих CLI и креденшалов; агент живёт там, где есть инструменты | принято |
| D4 | Второй backend — `command` (настраиваемый CLI-агент), плюс `none` | Нужен standalone/CI и оффлайн-деплой | принято |
| D5 | Store — append-only JSONL на ревью + снапшоты, без native-зависимостей | Crash safety, аудит, Alpine/Docker, никакой `better-sqlite3` | принято |
| D6 | Раунды неизменяемы; комментарий живёт на уровне review и хранит историю якорей | «Что исправлено / что нет» и сохранение строки между раундами | принято |
| D7 | Явные триггеры: кнопка, `/review`, tool, CLI; авто-эвристик по коммитам нет | Предсказуемость, отсутствие ложных раундов | принято |
| D8 | CLI в v1, MCP — отложен | «cli for agents support» без стоимости MCP | принято (MCP — later) |
| D9 | Docker в v1; agent CLI в образ не входит | Стабильность образа и лицензии/креды | принято |
| D10 | Аккаунтов нет: общий токен, имя ревьюера в браузере | Малый scope; OIDC/роли — следующий change | принято |
| D11 | Репозиторий `~/projects/dsh-code-review`, CLI `review`, пакеты `@dsh-code-review/*` | Рабочие имена до публичного релиза; проверить конфликты перед publish | принято |
| D12 | TLS терминируется reverse proxy, не daemon | Меньше кода и рисков; cookie Secure по `X-Forwarded-Proto` | принято |
| D13 | Retention 90 дней; лимиты 2 MiB diff / 500 файлов / 20k строк на файл | Достаточно для v1; настраивается | принято |
| D14 | Модель reviewer — явная в конфиге, fallback на модель инициатора | Предсказуемая стоимость и качество | принято |

---

## 1. Проблема

Агентный цикл разработки потерял контроль: изменения появляются быстрее, чем человек успевает их читать; ревью размазано по чатам; замечания не привязаны к строкам и теряются между итерациями; нет независимой предварительной проверки рисков; фидбек не возвращается в ту же сессию системно.

Нужен инструмент, который:

1. запускается по завершении набора задач или при запросе мерджа веток;
2. показывает изменения визуально — нативно в DSH и отдельным веб-приложением в LAN;
3. заранее проводит независимое агентское ревью с отчётом, подсветкой спорных/опасных мест и suggested правками;
4. позволяет комментировать конкретные строки и диапазоны, как GitHub/GitLab/Bitbucket;
5. по завершении ревью автоматически доставляет пакет фидбека в инициировавшую сессию агента;
6. не привязан к DSH — пригоден для Pi / Claude Code / Codex.

## 2. Цели и критерии успеха

| # | Критерий | Проверка |
|---|----------|----------|
| S1 | Ревью создаётся из DSH (`/review`, tool), из standalone UI и из CLI | e2e + live DSH |
| S2 | Diff корректен для `range`, `worktree`, `commit`: added/modified/deleted/renamed/binary/oversized | unit-фикстуры git-репо |
| S3 | Reviewer выдаёт findings с severity, цитатой, якорем строки, evidence и `questions` | контрактные тесты + просмотр UI |
| S4 | Комментарий человека ставится на строку/диапазон и переживает перезагрузку и новый раунд | e2e, якорные тесты |
| S5 | Submit доставляет пакет в исходную DSH-сессию, статус доставки виден, повтор идемпотентен | live DSH + интеграция |
| S6 | Второй раунд показывает `Addressed / Not fixed / Outdated`, сохраняя исходную цитату и строку | e2e round-2 |
| S7 | Standalone приложение доступно в LAN по токену; Docker проходит D1–D7 | Playwright + Docker gates |
| S8 | UI проходит a11y/UX-чеклист (axe, keyboard, 320px, light/dark, контраст) | Playwright + axe + скриншоты |
| S9 | CLI `--json` стабилен и пригоден для других harness'ов | контрактные тесты CLI |
| S10 | Daemon живёт без агента: ревью создаётся и принимает комментарии при недоступном reviewer | интеграционный тест |

## 3. Non-goals v1

- MCP-сервер (отложен).
- Интеграции с GitHub/GitLab/Bitbucket API, PR/MR-синхронизация; источник изменений — локальный git.
- Аккаунты, SSO, роли, multi-tenant.
- Авто-триггер по коммитам/пушу/завершению todo (только явные действия).
- Синтаксическая подсветка кода (код моноширинный; язык используется только как подсказка).
- Реалтайм-совместное редактирование, presence, реакции.
- Windows-пути и не-git VCS.
- Полнотекстовый поиск по коду.

## 4. Сценарии

1. **Solo + DSH.** Агент закончил набор задач → вызывает `review_start` (или человек `/review`) → создаётся ревью, worker запускает reviewer-субагента → отчёт появляется в UI/панели → человек комментирует строки, принимает правки, жмёт Submit → пакет уходит в ту же сессию → агент правит, вызывает `review_refresh` → r2 показывает fixed/not fixed → Approve.
2. **Ревьюер в LAN.** Коллега открывает `http://host:3100`, вставляет токен, комментирует, отправляет. Доставка — в сессию инициатора, если она есть; иначе пакет доступен для копирования/CLI.
3. **CI/чужой harness.** `review start --json` → `review feedback --wait --json` (или человек ревьюит в web) → агент забирает пакет и правит.
4. **Оператор.** `docker compose up -d`, health OK, токен в `.env`, repo mounts; worker DSH подключается к daemon.

---

## 5. Архитектура

### 5.1 Топология

```
reviewd (host или Docker, :3100) — единственный писатель
├─ store (JSONL + snapshots + artifacts)
├─ git access (repo mounts; diff, refresh, apply)
├─ REST /api/* , SSE /api/events , static SPA
├─ job queue + worker leases/heartbeats
└─ delivery queue

DSH process
├─ Host plugin
│  ├─ same-origin proxy /api/code-review/* → reviewd
│  ├─ worker: poll jobs → reviewer subagent → findings/report
│  ├─ delivery bridge: review.submitted → sessionController.prompt
│  ├─ tools: review_start / review_status / review_refresh / review_feedback
│  └─ slash command /review
└─ Client plugin: sidebar icon + main panel "code-review"

Other harness (later): CLI/MCP client of reviewd; может быть worker'ом.
```

### 5.2 Модули и зависимости

```
packages/
  core/     @dsh-code-review/core     git, diff, snapshot, anchors, rounds, store,
                                      ReviewService, reviewer contract, signals,
                                      feedback rendering, HTTP client types
  ui/       @dsh-code-review/ui       React-компоненты, design tokens, API client,
                                      theme adapter (standalone | dsh)
  server/   @dsh-code-review/server   node:http daemon, auth, REST, SSE, static,
                                      job queue, CLI `review`
  web/      @dsh-code-review/web      standalone SPA entry, router, i18n
  dsh/      dsh-code-review           Cordis bundle: host.ts, client.tsx,
                                      cordis.patch.yml, locale/, icon.svg
```

Правила зависимостей: `core` → Node built-ins only; `server` → core; `ui` → core types + React (peer); `web` → ui; `dsh` → core/UI + Cordis/DSH packages (peer/dev). `core`, `server`, `ui` не импортируют `@deepseek-ai/*`.

### 5.3 Потоки

**Создание ревью**
```
client → POST /api/reviews {repo, scope, title, reviewer}
reviewd → resolve baseSha/headSha, snapshot, event review/created + round/created
        → job queued (backend auto|worker|command|none)
        → 201 {review, url}
worker (long-poll) → GET /api/jobs/next → {job, bundle}
        → reviewer subagent → findings → POST findings/report
        → event agent/ready → SSE → UI
```

**Submit и доставка**
```
human → POST /api/reviews/:id/submit {verdict, summary, includeResolved}
reviewd → event review/submitted + delivery/pending {key, sessionId, payload}
DSH bridge (SSE) → sessionController.prompt({sessionId, mode:'queue', content})
        → POST /api/deliveries/:id/ack
нет DSH → delivery остаётся pending; UI показывает «ждёт сессию»
```

**Раунд 2**
```
agent fixes → review_refresh (tool) / POST refresh
reviewd → snapshot r2, delta vs r1, re-anchor comments, outcomes,
        → job {kind:'verify', previousFeedback, delta, unresolved}
        → reviewer verification + new findings
        → UI: доска fixed / not fixed / outdated, дельта-режим
```

### 5.4 Технологии

- Node 22, TypeScript strict, pnpm workspaces, ESM.
- Runtime deps: только Node built-ins + React 18 (UI peer). Валидация JSON Schema — собственный минимальный валидатор в `core` (без zod/ajv).
- Build: esbuild (host/CLI/web/client bundle), `tsc --noEmit` для типов.
- Tests: vitest (unit/integration), Playwright + axe-core (браузер), Docker Compose gates.
- Шрифты standalone: self-hosted Inter + JetBrains Mono (OFL), subset latin+cyrillic.

### 5.5 Репозиторий

```
.gitignore  LICENSE (MIT)  README.md  CONTRIBUTING.md  SECURITY.md
pnpm-workspace.yaml  package.json  tsconfig.base.json  Dockerfile
docker-compose.yml  .env.example
docs/ design-system/ packages/ scripts/ tests/
```

### 5.6 ReviewService и адаптеры

`ReviewService` — единственный прикладной интерфейс. HTTP daemon, DSH-proxy, CLI и будущий MCP только маппят запросы; бизнес-логика не живёт в транспорте.

```ts
interface CallContext { actor: Actor; requestId?: string }

interface ReviewService {
  create(input: CreateReviewInput, ctx: CallContext): Promise<ReviewView>;
  list(filter: ReviewFilter): Promise<Page<ReviewSummary>>;
  get(id: ReviewId): Promise<ReviewView>;
  snapshot(id: ReviewId, round: RoundNo, file?: string): Promise<SnapshotView>;
  addComment(id: ReviewId, input: CommentInput, ctx: CallContext): Promise<CommentView>;
  reply(id: ReviewId, commentId: CommentId, input: ReplyInput, ctx: CallContext): Promise<CommentView>;
  setCommentState(id: ReviewId, commentId: CommentId, state: CommentState, ctx: CallContext): Promise<CommentView>;
  suggestionAction(id: ReviewId, commentId: CommentId, action: SuggestionAction, ctx: CallContext): Promise<CommentView>;
  refresh(id: ReviewId, trigger: RoundTrigger, ctx: CallContext): Promise<ReviewView>;
  submit(id: ReviewId, input: SubmitInput, ctx: CallContext): Promise<SubmissionView>;
  close(id: ReviewId, verdict: CloseVerdict, ctx: CallContext): Promise<ReviewView>;
  claimFixStatus(id: ReviewId, items: FixClaim[], ctx: CallContext): Promise<void>;
  cancelAgent(id: ReviewId, ctx: CallContext): Promise<void>;
  events(id: ReviewId, after: number): Promise<ReviewEvent[]>;

  registerWorker(input: WorkerRegistration): Promise<WorkerView>;
  nextJob(workerId: string, waitMs: number, signal: AbortSignal): Promise<JobBundle | null>;
  postFindings(jobId: string, attemptId: string, findings: Finding[]): Promise<void>;
  postReport(jobId: string, attemptId: string, report: AgentReport): Promise<void>;
  failJob(jobId: string, attemptId: string, error: JobError): Promise<void>;

  pendingDeliveries(harness: string): Promise<Delivery[]>;
  ackDelivery(id: string, by: string): Promise<void>;
  failDelivery(id: string, error: DeliveryError): Promise<void>;
}
```

- Git, clock, ids и file system инжектируются портами (`GitPort`, `Clock`, `IdPort`, `FilePort`) — unit-тесты детерминированы, daemon подставляет реальные реализации.
- Все мутации идемпотентны по `ctx.requestId`/`attemptId`; повтор возвращает тот же результат.
- Ошибки — типизированный `ReviewError { code, message, details }`; транспорты не изобретают свои коды.
- Сервис не импортирует `node:http`, React, Cordis или DSH-пакеты.

```ts
interface HarnessAdapter {
  id: 'dsh' | 'cli' | 'pi' | 'claude-code' | 'codex';
  createReview(input: CreateReviewInput): Promise<ReviewView>;   // HTTP/CLI реализация
  fetchFeedback(id: ReviewId): Promise<FeedbackPackage>;
  deliver?(delivery: Delivery): Promise<'acked' | 'pending' | 'failed'>; // только push-харнессы
}

interface ReviewerAdapter {
  id: string;
  run(job: JobBundle, sink: FindingSink, signal: AbortSignal): Promise<ReviewerReport>;
}
```

DSH реализует `ReviewerAdapter` (subagent) и `HarnessAdapter.deliver` (`sessionController.prompt`); CLI — `HarnessAdapter` без `deliver`. Pi/Claude Code/Codex добавляются adapters, core/HTTP-контракт не меняется.

---

## 6. Домен

### 6.1 Сущности

```ts
type ReviewId = string;      // rev_<ulid>
type RoundNo = number;       // 1..n
type CommentId = string;     // cmt_<ulid>
type FindingId = string;     // fnd_<ulid>
type Actor = { kind: 'human' | 'agent'; name: string; sessionId?: string; harness?: 'dsh' | 'cli' | 'other' };

type ReviewScope =
  | { kind: 'range'; baseRef: string; headRef: string }
  | { kind: 'worktree'; baseRef: string }
  | { kind: 'commit'; sha: string };

interface Review {
  id: ReviewId;
  title: string;
  repo: { root: string; gitDir?: string; defaultBranch?: string };
  scope: ReviewScope;
  reviewer: { backend: 'worker' | 'command' | 'none'; harness?: 'dsh'; commandId?: string };
  author: Actor;
  initiator?: { sessionId: string; harness: 'dsh'; agentId?: string; cwd: string };
  status: 'open' | 'submitted' | 'closed';
  verdict?: 'approved' | 'changes_requested' | 'comment';
  currentRound: RoundNo;
  createdAt: string;
  updatedAt: string;
}

interface Round {
  n: RoundNo;
  baseSha: string;
  headSha: string | null;          // null для worktree без коммита
  worktreeDigest: string;
  snapshotId: string;
  previousSnapshotId?: string;
  trigger: 'created' | 'refresh-agent' | 'refresh-human' | 'refresh-cli';
  stats: { files: number; added: number; deleted: number };
  agent: {
    status: 'queued' | 'running' | 'ready' | 'failed' | 'skipped';
    backend: 'worker' | 'command' | 'none';
    jobId?: string;
    startedAt?: string; finishedAt?: string;
    error?: { code: string; message: string };
  };
  submissionId?: string;
}

interface Snapshot {
  id: string;
  reviewId: ReviewId;
  round: RoundNo;
  createdAt: string;
  files: FileSnapshot[];
  totals: { files: number; added: number; deleted: number; truncated: boolean };
}

interface FileSnapshot {
  path: string;
  oldPath?: string;                       // rename
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'binary' | 'oversized' | 'submodule' | 'untracked';
  binary?: true; oversized?: true;
  added: number; deleted: number;
  hunks: Hunk[];
  oldLines?: string[]; newLines?: string[]; // для re-anchor/делты, с лимитами
  contentHash: string;
}

interface Hunk {
  oldStart: number; oldLines: number;
  newStart: number; newLines: number;
  header: string;
  lines: Array<{ kind: 'context' | 'add' | 'del'; oldNo?: number; newNo?: number; text: string }>;
}

interface Anchor {
  file: string; side: 'old' | 'new';
  line: number; endLine?: number;
  quote: string;                          // нормализованный текст строки
  contextBefore: string[]; contextAfter: string[];
  hunkHeader: string;
  contentHash: string;
}

interface Comment {
  id: CommentId;
  reviewId: ReviewId;
  author: Actor;
  body: string;
  createdAt: string;
  anchor: Anchor;                         // текущий якорь
  anchors: Array<Anchor & { round: RoundNo; state: AnchorState }>;
  state: 'open' | 'resolved' | 'dismissed';
  outdated?: boolean;
  suggestion?: Suggestion;
  replies: Array<{ id: string; author: Actor; body: string; createdAt: string }>;
}

type AnchorState = 'open' | 'line-changed' | 'moved' | 'outdated' | 'ambiguous';

interface Suggestion {
  original: string;
  replacement: string;
  language?: string;
  state: 'proposed' | 'accepted' | 'applied' | 'declined' | 'stale';
  appliedAt?: string;
  appliedRound?: RoundNo;
}

type Severity = 'blocker' | 'major' | 'minor' | 'nit';
type FindingKind = 'issue' | 'question' | 'praise';

interface Finding {
  id: FindingId;
  round: RoundNo;
  severity: Severity;
  category: 'security' | 'correctness' | 'tests' | 'performance' | 'maintainability' | 'api' | 'concurrency' | 'docs' | 'other';
  confidence: 'high' | 'medium' | 'low';
  kind: FindingKind;
  file: string; lineStart: number; lineEnd?: number;
  title: string;
  rationale: string;
  evidence?: string;
  suggestion?: { original: string; replacement: string };
  status: 'open' | 'accepted' | 'dismissed' | 'question';
}

interface AgentReport {
  round: RoundNo;
  summary: string;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  findings: Finding[];
  questions: Array<{ id: string; file?: string; line?: number; question: string; why: string }>;
  tests: { ran: boolean; commands: Array<{ command: string; result: 'pass' | 'fail' | 'unknown'; summary?: string }> };
  verification: Array<{ commentId: CommentId; status: 'fixed' | 'not-fixed' | 'unclear'; evidence: string }>;
  meta: { backend: 'worker' | 'command'; harness?: string; model?: string; startedAt: string; finishedAt: string; durationMs: number };
}

interface Submission {
  id: string;
  round: RoundNo;
  verdict: 'approved' | 'changes_requested' | 'comment';
  summary: string;
  by: Actor;
  createdAt: string;
  deliveryId: string;
  includedCommentIds: CommentId[];
}
```

### 6.2 Статусы

- `Review.status`: `open` (можно комментировать/refresh) → `submitted` (отправлено, ждём правок; новый раунд разрешён) → `closed` (approved/закрыто вручную; комментарии read-only).
- `Round.agent.status`: `queued → running → ready | failed | skipped`.
- `Comment.state`: `open ⇄ resolved`, `dismissed`.
- `Suggestion.state`: `proposed → accepted | applied | declined`, `stale` при расхождении HEAD.
- `Delivery.state`: `pending → sending → acked | failed` (в store: `delivery/*`).

### 6.3 Event-sourced store

`<store>/reviews/<id>/events.jsonl` — одна строка = одно событие:

```json
{ "v": 1, "seq": 42, "at": "2026-10-26T12:00:00.000Z", "type": "comment/added", "data": { } }
```

Типы событий:

| Тип | Данные |
|-----|--------|
| `review/created` | review без раундов |
| `round/created` | round + snapshot ref |
| `agent/queued` | jobId, backend, attemptId |
| `agent/started` | jobId, workerId, attemptId |
| `agent/finding` | finding |
| `agent/finding-rejected` | raw, reason |
| `agent/report` | report |
| `agent/failed` | error |
| `comment/added` | comment |
| `comment/replied` | commentId, reply |
| `comment/state` | commentId, state, by |
| `comment/anchor` | commentId, anchor, round, state |
| `suggestion/state` | commentId, state, meta |
| `suggestion/applied` | commentId, round, sha, result |
| `review/submitted` | submission + deliveryKey |
| `delivery/pending` | delivery |
| `delivery/acked` | deliveryId, by, at |
| `delivery/failed` | deliveryId, error |
| `review/closed` | verdict, by |
| `fix/claim` | agent-harness status per comment |

- Append: открыть файл с `O_APPEND`, записать строку, `fsync`; только daemon.
- Snapshot cache: `<store>/reviews/<id>/snapshot.json` — fold result + `lastSeq`; при старте читается, затем дочитывается хвост JSONL. Повреждённый хвост отбрасывается до последней полной строки с записью warning.
- Snapshot diff-данных: `<store>/snapshots/<snapshotId>.json` (immutable, gzip опционально).
- Артефакты ревьюера: `<store>/jobs/<jobId>/` (`prompt.md`, `diff.json`, `schema.json`, `output.raw`, `stdout.log`, `stderr.log`).
- Retention: `review gc --older-than <days>` удаляет closed reviews и артефакты; по умолчанию 90 дней, настраивается.
- Версионирование: `v` в каждой строке; миграции fold-логики при старте; несовместимая версия → отказ с инструкцией.

### 6.4 Инварианты

1. Daemon — единственный писатель store (файловый lock с pid/port в `<store>/lock`).
2. Раунды и снапшоты неизменяемы; правки только новыми событиями.
3. Комментарий никогда не удаляется физически; `dismissed` — мягкое состояние.
4. Все мутации review сериализуются per-review mutex.
5. Секреты (token, Authorization) никогда не попадают в event log, логи и артефакты.
6. Ни один путь из запроса не может выйти за `repo.root` (realpath-проверка, запрет симлинков наружу).

---

## 7. Git и diff

### 7.1 Резолв scope

- `range`: `baseSha = merge-base(baseRef, headRef)`, `headSha = rev-parse(headRef)`; diff `baseSha..headSha` (three-dot семантика). Флаг `--two-dot` для `base..head`.
- `worktree`: `baseSha = rev-parse(baseRef)`; `headSha = null`; diff base→рабочее дерево, включая staged; untracked добавляются отдельно.
- `commit`: `baseSha = rev-parse(sha^)`, `headSha = sha`; либо `git show --format= --unified=3 sha`.
- `defaultBase`: config → `origin/HEAD` → `main` → `master` → текущая ветка.

### 7.2 Команды

Всегда:
```
git -c core.quotepath=false -c core.pager=cat -c diff.external= --no-pager \
    diff --no-color --no-ext-diff --no-textconv --unified=3 --find-renames=50% \
    [--src-prefix=a/ --dst-prefix=b/] <range> [-- <paths>]
```
Env: `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`, `GIT_CONFIG_NOSYSTEM=1` (по возможности), `GIT_EXTERNAL_DIFF=""`.
Никаких hooks/фильтров; `--no-ext-diff` обязателен.

Дополнительно: `rev-parse`, `merge-base`, `ls-files --others --exclude-standard -z`, `status --porcelain=v2 -z`, `hash-object` (для digest), `apply --3way` (только Apply suggestion), `rev-parse --show-toplevel` (валидация repo).

### 7.3 Парсинг и лимиты

- Unified diff парсится в `FileSnapshot` + `Hunk`; поддержка rename (`similarity index`, `rename from/to`), `new file mode`, `deleted file mode`, `\ No newline at end of file`, binary (`Binary files ... differ`).
- Лимиты по умолчанию: 2 MiB суммарного диффа, 20 000 строк на файл, 500 файлов в снапшоте, 1 MiB на файл контента для anchor; ignore globs (lockfile, dist, vendor, minified, generated) настраиваются. Oversized/ignored файлы показываются в дереве с причиной, но не рендерятся.
- CRLF: нормализация при парсинге якорей; отображение — с исходными line endings (маркер `CRLF`).
- UTF-8 strict; невалидные байты → `binary`-подобный `encoding: 'unknown'`.
- Симлинки: не читаются; путь с realpath вне repo → ошибка `path-escape`.
- Submodule: статус `submodule`, без содержимого.
- Untracked: читаются через `fs.readFile` с лимитом, синтезируется added-файл; бинарные/большие — только запись в дереве.

### 7.4 Снапшот и устаревание

Снапшот содержит `oldLines/newLines` для изменённых текстовых файлов в пределах лимита — это нужно для (а) повторного рендера дельты без git, (б) re-anchor. `worktreeDigest = sha256(status --porcelain=v2 -z + diff base)`; для `range` — `headSha`. UI сравнивает digest/headSha с текущим и показывает «изменения после снапшота; создать rN+1».

---

## 8. Раунды, якоря и «исправлено / нет»

### 8.1 Якорь

Комментарий ставится на `file + side + line (или range)`. В якорь сохраняются: нормализованная цитата строки/диапазона, 2 строки контекста до/после, hunk header, content hash. Для suggestion — `original` блок.

### 8.2 Re-anchor (rN → rN+1)

1. Если файл переименован — следовать rename из снапшота.
2. Точное совпадение цитаты в новом снапшоте в окне ±40 строк от ожидаемого маппинга (маппинг считается по хункам).
3. Скоринг: точная цитата (вес 3) + контекст before (1) + after (1) + близость номера (1); порог.
4. Один кандидат → перенос; несколько равных → `ambiguous`, берём ближайший и показываем обе строки.
5. Нет кандидата → `outdated`; комментарий остаётся с последней известной цитатой/строкой, показывается в группе Outdated.

История якорей сохраняется целиком (`anchors[]`), UI показывает «было line 42 → стало line 57».

### 8.3 Детерминированные outcome-правила

| Условие | Outcome |
|---|---|
| Suggestion применён точно (`applied`) | `applied` |
| Цитируемые строки изменились/исчезли, комментарий перенёсся | `addressed` (confidence high/medium) |
| Цитата не изменилась и якорь совпал | `unchanged` |
| Файл удалён / строки не найдены | `outdated` |
| Есть только перенос без изменения содержимого | `moved` |

Outcome — предположение с confidence; финальный статус ставит человек. Ревьюер раунда даёт независимую `verification`, агент — `fix/claim`; UI показывает три сигнала и не скрывает расхождения.

### 8.4 Новый раунд

- Триггеры: `review_refresh` (tool), кнопка «Re-review», CLI `review refresh`.
- Запрещён при `agent.status ∈ {queued,running}` (409).
- Для rN+1 reviewer получает: предыдущий unresolved-фидбек, delta rN→rN+1, полный снапшот (кратко), задачу верификации.
- Комментарии, созданные до submit, переносятся; resolved по умолчанию не отправляются повторно (конфиг `includeResolved`).
- Раунд можно закрыть/просмотреть вечно; `Approved` закрывает review.

---

## 9. Reviewer

### 9.1 Job

```ts
interface Job {
  id: string;
  reviewId: ReviewId;
  round: RoundNo;
  kind: 'initial' | 'verify';
  backend: 'worker' | 'command';
  harness?: 'dsh';
  attempt: number;
  leaseUntil: string;
  workerId?: string;
  createdAt: string;
}
```

- Lease 60s, heartbeat каждые 20s; expiry → `queued` (attempt++), до 2 попыток.
- Таймаут: 10 мин (конфиг); cancel → reviewer процесс/агент гасится, job `failed`.
- Bundle отдаётся worker'у по API (не путями daemon): `{prompt, diff, schema, meta}`. Worker и daemon могут быть в разных машинах/контейнерах.
- Worker обязан работать в **своём** видимом worktree (`cwd` инициатора); daemon не передаёт ему локальные пути, кроме `repoHint` из initiator cwd.

### 9.2 Bundle и промпт

`prompt.md` содержит:

1. Роль: независимый ревьюер, read-only, не менять файлы.
2. Вход: заголовок/цель, scope, base→head, список файлов, signals, полный diff (с учётом лимитов), для verify — предыдущий фидбек + delta + unresolved anchors.
3. Требования: смотреть окружающий код, а не только дифф; работать только read-only инструментами (запуск команд и правки запрещены); каждое замечание — с якорем на изменённую строку, цитатой и evidence; не дублировать; не писать стилевые nitpick без пользы.
4. «Спорные» вопросы — отдельным списком `questions`, если решение зависит от продукта/намерения.
5. Выход: строго JSON по схеме; либо tool-вызовы, либо файл `REVIEW_OUTPUT`.

`diff.json`: `{review, round, files[], signals[]}` — стабильный формат.

### 9.3 Output schema (v1)

```json
{
  "schemaVersion": 1,
  "summary": "string",
  "riskLevel": "low|medium|high|critical",
  "findings": [{
    "id": "f1",
    "severity": "blocker|major|minor|nit",
    "category": "security|correctness|tests|performance|maintainability|api|concurrency|docs|other",
    "confidence": "high|medium|low",
    "kind": "issue|question|praise",
    "file": "src/x.ts",
    "lineStart": 42,
    "lineEnd": 44,
    "title": "string",
    "rationale": "string",
    "evidence": "quoted code or command output",
    "suggestion": { "original": "string", "replacement": "string" }
  }],
  "questions": [{ "id": "q1", "file": "src/x.ts", "line": 42, "question": "string", "why": "string" }],
  "tests": { "ran": true, "commands": [{ "command": "pnpm test", "result": "pass|fail|unknown", "summary": "string" }] },
  "verification": [{ "commentId": "cmt_...", "status": "fixed|not-fixed|unclear", "evidence": "string" }]
}
```

Валидация: ids уникальны; enum-поля; `file` существует в снапшоте; `line` в границах файла; `suggestion.original` совпадает с текущим содержимым (нормализация пробелов/отступов) иначе finding принимается без suggestion с пометкой `unanchored`; лимиты 200 findings / 50 questions / 32 KiB на текст; неизвестные поля игнорируются с warning. Частично валидный отчёт принимается, отклонённые элементы пишутся в `agent/finding-rejected` и доступны в raw-артефакте.

### 9.4 DSH worker

- При старте (если `worker: true` и daemon доступен) регистрируется `POST /api/workers/register` со стабильным id; при ошибке повторяет с backoff 1s..30s до ответа или dispose.
- Long-poll `GET /api/jobs/next?workerId&wait=25`; backoff при ошибках; прекращает при dispose.
- Job → создаёт reviewer-агента:
  ```ts
  const handle = await ctx.agents.create({
    sessionId: mintSessionId(),
    parentAgent: initiatorAgent,
    meta: { cwd: initiatorCwd, parentSession: initiatorSessionId, origin: 'subagent',
            delegationDepth: parentDepth + 1, agentPreset: config.reviewer.preset },
    agentOptions: config.reviewer.model,
  });
  handle.agent.followup(userMessage(prompt));
  await Promise.race([handle.agent.whenIdle(), timeout]);
  ```
- На `handle.agent.ctx` регистрируются scoped tools `review_submit_finding` и `review_submit_report`; параллельно работает fallback: если агент записал `output.json` в cwd, worker читает его.
- Ограничения: на ctx ревьюера включён allowlist `read`, `grep`, `glob`, `review_status`, `review_feedback`; shell, запись, сеть, делегирование и review-мутации недоступны. Ревьюер получает ограниченный unified diff в промпте.
- Отчёт обязан содержать `schemaVersion: 1`; иначе job падает с non-retryable `invalid-output` без записи findings/report.
- На завершении: `POST findings` инкрементально (каждый finding валидируется daemon), `POST report`, `POST /api/jobs/:id/ack`; dispose reviewer-агента в `finally` на любом пути.
- Ошибка → `POST fail` с кодом; таймаут `reviewerTimeoutMs` отменяет агента (`cancel({kind:'timeout'})`) и падает с retryable `reviewer-timeout`; daemon решает retry/requeue.
- Триггер «агент закончил правки»: tool `review_refresh` вызывается агентом; worker не сканирует коммиты.

### 9.5 Command backend

- Config: `reviewer.command` = argv-массив или строка (shell только при явном `allowShell: true`), плейсхолдеры `{promptFile}`, `{repo}`, `{outputFile}`, `{reviewId}`; env `REVIEW_*`.
- cwd = repo root; timeout; kill process group; stdout/stderr в артефакты.
- Результат: `outputFile`, иначе последний fenced JSON в stdout; иначе `invalid-output`.
- Read-only: перед запуском и после — `git status`; изменения → `dirty-worktree` (с предупреждением в отчёте).
- Пример: `["claude", "-p", "--output-format", "text"]` (промпт через stdin) или `["codex", "exec"]`; точный шаблон подбирается при внедрении.

### 9.6 Signals (детерминированные)

Вычисляются в core без LLM и попадают в промпт + UI:

- удалённые/изменённые тесты (пути `*test*`, `*spec*`);
- изменения публичного API (exported symbols; эвристика по diff);
- удалённые/изменённые миграции;
- новые `TODO|FIXME|HACK|XXX`;
- потенциальные секреты (regex: ключи, токены, private key, `.env`);
- lockfile/deps изменения;
- merge-маркеры (`<<<<<<<`);
- большие/бинарные/renamed файлы;
- удалённая обработка ошибок (эвристика: исчез `try/catch`, `error`, `throw`);
- submodule/file mode изменения.

Signals — не приговор, а подсветка; в UI отдельная вкладка со ссылками.

---

## 10. Фидбек и доставка

### 10.1 Пакет

Детерминированный markdown (UTF-8) + JSON:

```
## Ревью «<title>» — changes requested (round 2)
Review: <publicUrl>/review/<id>?round=2
Scope: <base>..<head> (<sha>)

### Блокеры и major (агент)
- [blocker][src/x.ts:42] <title>
  <rationale>
  > evidence

### Комментарии человека (open)
- [src/x.ts:57] <body>

### Принятые suggested правки
- [src/x.ts:60] применено человеком (не применять повторно)
- [src/y.ts:12] принято, но не применено (патч ниже)

### Вопросы к тебе
- [q1] <question> — <why>

### Уже исправлено в этом раунде
- [cmt_...] addressed (verified)

### Инструкция
Правь только перечисленное, не переписывай несвязанный код, прогони тесты,
затем вызови review_refresh(reviewId) и review_fix_status(...) с evidence.
Если сообщение повторное — не применяй правки дважды.
```

- Собираются: unresolved human comments, open blocker/major findings, accepted-not-applied suggestions, questions, verification summary, applied suggestions (как «не повторять»).
- Resolved/nit исключаются по умолчанию; лимит 100 KiB; при превышении — top-N + ссылка на review.

### 10.2 DSH bridge

- Подписка на `review.submitted` (SSE или long-poll) с bearer.
- `sessionController.prompt({ requestId, sessionId, mode: 'queue', content: [{ type: 'text', text }] })`.
- `requestId` = `deliveryKey` (`reviewId:round:submissionId`); DSH ведёт in-memory dedupe + проверяет статус delivery перед отправкой.
- Успех → `POST /api/deliveries/:id/ack` (сбрасывает счётчик попыток); ошибка → до 3 попыток с backoff 1s..30s → `POST /api/deliveries/:id/fail`, после чего запись больше не опрашивается; UI показывает copyable пакет и причину.
- Закрытая сессия резюмируется (`deliverClosed = true`, конфиг); если сессия не найдена/повреждена → delivery `failed`, пакет остаётся доступным.
- Delivery в сессию, инициировавшую ревью; `initiator.sessionId` хранится в событии создания. Для ревью из CLI без сессии — pending/нет доставки.
- At-least-once; дубликат помечается в тексте; идемпотентность по `deliveryKey`.

### 10.3 Не-DSH

- CLI `review feedback <id> --wait --format md|json` — long-poll до `submitted`; стабильный JSON-контракт.
- Чужой агент сам решает, как применить фидбек; пакет — источник истины.

---

## 11. Daemon и HTTP API

### 11.1 Auth

- `CODE_REVIEW_TOKEN` обязателен (32+ bytes, рекомендуется `openssl rand -hex 32`); сравнение constant-time. Без токена daemon отказывается стартовать.
- Machine clients: `Authorization: Bearer <token>`.
- Browser: `GET /auth` (страница с полем токена) → `POST /api/auth` {token} → HttpOnly `cr_session` cookie (HMAC-SHA256, SameSite=Strict, Secure при TLS, max-age 30d) → redirect `/`.
- CSRF: SameSite=Strict + проверка `Origin`/`Sec-Fetch-Site` на мутациях.
- Rate limit: token bucket per peer (60 mutations/min, 600 reads/min), 429 с `Retry-After`.
- `/api/health` и `/api/version` — без токена, минимум данных.
- Никакого CORS (SPA same-origin); DSH-панель ходит через same-origin proxy.

### 11.2 Endpoints

| Метод | Путь | Назначение |
|---|---|---|
| GET | `/api/health` | status, store writable, git, queue depth, workers |
| GET | `/api/version` | daemon/schema versions |
| POST | `/api/auth` | обмен токена на cookie |
| POST | `/api/auth/logout` | сброс cookie |
| GET | `/api/config/public` | лимиты, publicUrl, defaultBase, i18n |
| GET | `/api/repos/branches?path=` | валидация repo + branches для autocomplete |
| POST | `/api/reviews` | создать review + job |
| GET | `/api/reviews` | список: repo, status, author, limit, cursor |
| GET | `/api/reviews/:id` | review + rounds + comments + report (сводно) |
| GET | `/api/reviews/:id/snapshot?round=` | диффы раунда (lazy per file: `&file=`) |
| POST | `/api/reviews/:id/comments` | комментарий/диапазон/suggestion |
| POST | `/api/reviews/:id/comments/:cid/replies` | ответ в тред |
| PATCH | `/api/reviews/:id/comments/:cid` | state open/resolved/dismissed |
| POST | `/api/reviews/:id/comments/:cid/suggestion` | accept/decline/apply |
| POST | `/api/reviews/:id/refresh` | новый раунд |
| POST | `/api/reviews/:id/submit` | verdict + summary + delivery |
| POST | `/api/reviews/:id/close` | закрыть |
| POST | `/api/reviews/:id/fix-status` | заявленные статусы агента |
| POST | `/api/reviews/:id/agent/cancel` | отменить job |
| GET | `/api/reviews/:id/events?after=` | long-poll/SSE |
| POST | `/api/workers/register` | worker identity |
| POST | `/api/workers/:id/heartbeat` | liveness |
| GET | `/api/jobs/next?workerId&wait=25` | job lease |
| POST | `/api/jobs/:id/findings` | инкрементальная находка |
| POST | `/api/jobs/:id/report` | финальный отчёт |
| POST | `/api/jobs/:id/fail` | ошибка/таймаут |
| POST | `/api/deliveries/:id/ack` | доставлено |
| POST | `/api/deliveries/:id/fail` | не доставлено |
| GET | `/api/deliveries/pending?harness=dsh` | восстановление после реконнекта |

Формат ошибок:

```json
{ "error": { "code": "stale-review", "message": "Head changed since round 2", "details": {} } }
```

Коды: `unauthorized`, `forbidden`, `not-found`, `validation`, `conflict`, `stale-review`, `agent-busy`, `daemon-unavailable`, `rate-limited`, `internal`.

### 11.3 SSE / long-poll

- `GET /api/events` (cookie auth, `text/event-stream`): события `review.submitted`, `delivery.pending`, `agent.status`, `round.created`.
- `GET /api/reviews/:id/events?after=<seq>` для панели/CLI; long-poll 25s или SSE.
- Heartbeat 15s; reconnect с `Last-Event-ID`/`after`; буфер последних 1000 событий в памяти + event log.

### 11.4 Workers и leases

- Worker ID случайный, хранится в памяти daemon; heartbeat каждые 20s; отсутствие 3 heartbeat → offline, jobs requeue.
- Job не теряется: события `agent/queued/started/failed` в review log; raw-артефакты.
- Idempotency: `attemptId` + finding id; повторный POST с тем же id — no-op.

### 11.5 Store startup

- Lock `<store>/lock` с pid/port; второй daemon → exit 1 с сообщением.
- Восстановление: fold JSONL, отбрасывание неполной последней строки, warning в лог.
- Миграции: `schemaVersion` в `<store>/meta.json`; при несовместимости — отказ без записи.

---

## 12. CLI

```
review start --repo <path> [--base <ref>] [--head <ref> | --worktree | --commit <sha>]
             [--title <text>] [--reviewer auto|worker|command|none]
             [--wait-agent] [--json]

review status <id> [--json]
review feedback <id> [--wait] [--format md|json]
review comments list <id> [--json]
review comments add <id> --file <path> --line <n> [--side new|old] [--end-line <n>] --body <text>
review submit <id> --approve | --request-changes | --comment [--summary <text>] [--json]
review refresh <id> [--json]
review fix-status <id> --json @file.json
review health | version | gc [--older-than 90d]
review serve --host <h> --port <p> --store <dir> --public-url <url>
```

- Конфиг: `--daemon`, `CODE_REVIEW_URL`, `CODE_REVIEW_TOKEN`, `~/.config/code-review/config.json` (0600).
- `--json` — стабильная схема v1: `{ "review": {...}, "url": "...", "warnings": [] }`.
- Exit codes: `0` ok; `2` не готово/timeout; `3` auth; `4` daemon недоступен; `5` validation; `6` conflict/stale.
- `review start` без `--base` — `origin/HEAD` → `main` → `master` → текущая ветка; без `--head` — текущий worktree.
- `review feedback --wait` — long-poll до submit; для не-DSH агентов: start → работа → feedback.
- Никакого MCP в v1.

---

## 13. DSH-интеграция

### 13.1 Bundle

`packages/dsh/package.json`:

```json
{
  "name": "dsh-code-review",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./client": "./dist/client.js",
    "./locale/*.json": "./locale/*.json",
    "./icon": "./icon.svg"
  },
  "files": ["dist", "locale/*.json", "icon.svg", "cordis.patch.yml"],
  "dsh": {
    "bundle": { "patch": "./cordis.patch.yml" },
    "client": { "platform": "web", "immediately": true,
      "inject": ["@deepseek-ai/dsh-client-ui-layout", "@deepseek-ai/dsh-client-ui-sidebar"] }
  }
}
```

`cordis.patch.yml`:

```yaml
- insert:
    - id: code-review
      name: 'dsh-code-review'
```

Установка: `plugin_manager install_bundle` с абсолютным путём пакета (после build). После установки — `Config.listConfigs` и `cordis_inspect_query` для проверки.

### 13.2 Host registrations

`inject`: `agents`, `tools`, `commands`, `sessionController`, `connection`, `subprocess`, `timer`, `systemPrompt` (optional), `webServer` (не нужен — standalone отдельный listener). Config:

```ts
interface Config {
  daemonUrl: string;          // default http://127.0.0.1:3100
  publicUrl?: string;         // для ссылок в UI/командах
  tokenEnv: string;           // default CODE_REVIEW_TOKEN
  proxyPath: string;          // default /api/code-review
  worker: { enabled: boolean; pollWaitSec: number; heartbeatSec: number };
  reviewer: { preset?: string; model?: { provider: string; model: string; reasoningEffort?: string };
              timeoutMs: number };
  delivery: { enabled: boolean; closedSessions: boolean };
  defaultBase?: string;
}
```

Регистрации (всё через `ctx.effect`/`ctx.on`):
- 4 tool'а (13.3) — глобальные, но доступны всем агентам; `review_start` проверяет cwd/initiator.
- slash command `/review`.
- exact `connection.fetch` routes под `proxyPath`: list, get, snapshot, comments, replies, patch, suggestion, refresh, submit, close, fix-status, events, config — проксируют в reviewd с bearer; тело/статус проксируются как есть.
- SSE/long-poll подписка на reviewd для delivery.
- Никакого нового session event type (правило ignorable); телеметрия только через tool/command и доставку.

При недоступности daemon: tool/command возвращают `daemon-unavailable` с URL и подсказкой `docker compose up -d`; панель показывает offline-баннер с Retry; никакого тихого fallback.

### 13.3 Tools и команда

`review_start`:

```json
{
  "title": "string?",
  "base": "string?",
  "scope": "range|worktree|commit?",
  "head": "string?",
  "commit": "string?",
  "reviewer": "auto|worker|command|none?",
  "waitForAgent": "boolean? default false"
}
```
→ `{ reviewId, url, status, agentStatus, summary? }`; ошибки `daemon-unavailable|validation|no-repo|auth`.

`review_status` `{reviewId}` → статусы, счётчики unresolved/fixed/outdated, delivery state.
`review_refresh` `{reviewId}` → новый раунд (409 при running job).
`review_feedback` `{reviewId, wait?}` → markdown-пакет (для повторной доставки/чтения).
`review_fix_status` `{reviewId, items:[{commentId,status,evidence}]}` → ack (агент после правок).

Команда `/review`:
- `description`: «Start a code review for the current changes».
- `input`: `[base] [--worktree] [--title "..."] [--no-agent]`.
- Handler использует agent из invocation, cwd из его сессии; создаёт ревью, возвращает ссылку + статус; при `agent-busy` — понятная ошибка.
- Результат — `CommandResult` text; ссылка на standalone (`publicUrl`) и id.

### 13.4 Delivery bridge

- При старте — `GET /api/deliveries/pending?harness=dsh`; подписка SSE.
- Для каждого delivery: resolve initiator session → `sessionController.prompt`; при `not-found` — `fail`.
- `sessionController.prompt` принимает `SessionId` (branded); `requestId` — `deliveryKey`.
- После ack — метрика/лог без содержимого.
- Если DSH перезапустился — pending переотправляется; дубликат помечается в тексте.

### 13.5 Client panel

- `sidebar.panellist`: `id: 'code-review'`, `order: 20`, `label: () => t('review.title')`, иконка `SidebarPanelIconOwnerProps` (`size`, `active`).
- `main` keyed: `key: 'code-review'`; компонент получает standard props, игнорирует session-хуки.
- Внутри: список ревью + деталь; те же компоненты из `ui`, но CSS-переменные `--cr-*` маппятся на `--dsw-alias-*` (список токенов: bg-base, bg-layer-1/2, bg-overlay, border-l1/l2, brand-primary, label-primary/secondary, state-error/success/warn/idle, sidebar-fill).
- Никаких сырых hex в панели, никаких импортов `@deepseek-ai/dsh-client-ui-primitives`; свои кнопки/диалоги/меню.
- Данные — через same-origin proxy; polling 2s при visible (document.visibilityState), пауза в фоне; ETag/`since` для экономии.
- Deep link: кнопка «Open in browser» (`publicUrl`), id копируется; внутренняя навигация — state, без изменения URL shell.
- Локализация: `ctx.locale.bind('code-review')`, словари en/ru; meta.title/description в locale JSON.
- Lifecycle: `ctx.slots.inject`/`register` внутри `apply`; disposers при dispose; никаких DOM вне компонента.

---

## 14. Standalone web app

- Отдельный listener daemon'а; статика из `packages/web/dist`.
- Маршруты: `/` (list), `/review/:id` (`?round=`, `#file=`, `#line=`), `/new`, `/auth`, `/health` (JSON).
- Auth: `/auth` — поле токена; cookie; 401 → redirect `/auth?next=...`.
- i18n: en/ru, выбор в localStorage + `Accept-Language`.
- Никаких CDN; CSP `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'`; `frame-ancestors 'none'`; `Referrer-Policy: no-referrer`; `X-Content-Type-Options: nosniff`.
- Статика с hash-именами, `Cache-Control: immutable`; `index.html` no-store.
- Healthcheck: `/api/health` (без токена, минимум).

---

## 15. UI/UX

### 15.1 Провенанс и направление

- Стили из `ui-design-intelligence`: `dark-mode-first`, `data-dense-console` (компактные строки 28–32px, tabular figures, keyboard-first, статус = иконка+цвет), нейтральная графитовая база из style defaults `#0D1117`, `#161B22`, `#21262D`, `#E6EDF3`, `#9DA7B3`, синий акцент `#58A6FF`, border `#5B6572` (3.2:1), типографика JetBrains Mono / Inter, motion 240/180/150/120ms.
- Зелёный и красный больше не окрашивают оболочку: они зарезервированы за добавленными/удалёнными строками, чтобы diff читался однозначно.
- Для diff/тредов строк в базе нет — используются общие дефолты и проверяются расчётным контрастом, axe и Playwright; это фиксируется как fallback, не как «database match».
- Светлая тема — производная от той же гаммы, каждый pair проходит расчётный контраст; не инверсия.

### 15.2 Токены

```css
/* dark (default) */
:root, .theme-dark {
  --cr-bg: #0D1117; --cr-surface: #161B22; --cr-surface-raised: #21262D;
  --cr-text: #E6EDF3; --cr-text-muted: #9DA7B3; --cr-border: #5B6572;
  --cr-primary: #58A6FF; --cr-on-primary: #08111F;
  --cr-danger: #FF7B72; --cr-on-danger: #2B0B0B;
  --cr-warning: #E3B341; --cr-info: #79C0FF;
  --cr-added-bg: #10261A; --cr-removed-bg: #2B1518;
  --cr-focus: #58A6FF;
}
/* light — derived, validated in tests */
.theme-light {
  --cr-bg: #FFFFFF; --cr-surface: #F6F8FA; --cr-surface-raised: #EAEEF2;
  --cr-text: #1F2328; --cr-text-muted: #57606A; --cr-border: #8C959F;
  --cr-primary: #0969DA; --cr-on-primary: #FFFFFF;
  --cr-danger: #B42318; --cr-warning: #7A4D00; --cr-info: #1D4ED8;
}
```

- Space: 4/8/12/16/20/24/32/40/48; Radius: 6 (controls), 10 (cards/dialogs), 999 (pills).
- Type: UI 16/1.5 для тела (комментарии/отчёт), 14/1.4 для контролов, 13 для метаданных, код 12.5/20 JetBrains Mono. Body ≥16px по чеклисту.
- Elevation в dark — surface + border, не тени; dialog — overlay + border.
- Focus: 2px solid primary + 2px offset, всегда видим.
- Motion: press 120ms, tabs 150ms, collapse 180ms, dialog 240ms; только transform/opacity; `prefers-reduced-motion` → 0.

### 15.3 Layout

- Standalone 1440: sidebar 280 / main flexible / right rail 320 на Conversation/Report/Signals; на Files changed правый rail скрыт, diff занимает всю ширину. 1024 — rail сворачивается; 768 — file tree drawer, rail drawer; 320 — single column, sticky action bar.
- DSH panel: sidebar хоста + main; правая панель скрыта по умолчанию, открывается как sheet; всё в токенах хоста.
- Список ревью: фильтры, поиск, строки с branch/scope, автор, возраст, статус, «N not fixed».
- Деталь: header (base→head, SHA copy, round pills, verdict, Submit), tabs Conversation / Files changed / Report / Signals, file tree, diff, right rail (summary, fix status, agent, delivery, submit). Files changed открывается по умолчанию, если в URL нет `tab`.
- Diff: длинные строки переносятся по умолчанию (тумблер Wrap lines), чтобы не было горизонтального скролла; inline-карточки findings и треды комментариев рендерятся сразу под строкой; file tree следует за вертикальным скроллом через `aria-current`.
- Settings: у каждого репозитория кнопка Browse… открывает локальный просмотр папок с хлебными крошками, переходом вверх и пометкой git-репозиториев; выбор папки заполняет Path on daemon.
- Round pills показывают counts; дефолт rN — дельта с rN-1, тумблер «Full diff to base».
- Fix status board: Addressed / Not fixed / Outdated / Needs decision; клик фильтрует треды; у каждого пункта jump-to-line.
- Тред: цитата кода, anchor history («line 42 → 57»), статусы, ответы, markdown preview.
- Suggestion: «было/стало», Apply/Decline; Apply только при совпадении head/worktree, иначе disabled + причина + «Send to agent».
- Submit dialog: verdict, summary, include resolved, recipient warning («сессия будет возобновлена»), confirm; повторный submit — только unresolved.
- Deep links: `/review/:id`, `?round=`, `#file=`, `#line=`; back/forward.

### 15.4 Состояния

- Loading: скелетоны формы контента; прогресс diff для больших ревью; SSE reconnect indicator.
- Empty: «пока нет ревью» + CTA; «нет комментариев»; «agent review недоступен» с объяснением и Retry.
- Error: daemon недоступен (Retry + как запустить), auth (ввести токен), reviewer failed (raw log + retry/cancel), apply conflict (diff-of-diff + send to agent), stale review (создать раунд).
- Partial: findings загрузились, verification нет — показывать по частям; delivery failed не блокирует просмотр.
- Success: тосты с undo где возможно; delivery status «sent / pending / failed» с деталями.

### 15.5 A11y и клавиатура

- WCAG AA: контраст 4.5/3, семантика, `aria-current` для активного файла и строки, dialog focus trap + Escape + restore, tabs `aria-selected`, diff line labels («line 57, added»), live-region для тостов/ошибок.
- Diff table: direct children — только `row`, строки — только `cell`; inline findings/треды/composer оборачиваются в row + cell, чтобы `aria-required-children` проходил.
- Keyboard: Tab-порядок; `c` комментарий, `r` resolve, `j/k` файлы, `[/]` раунды, `?` help, `g l` — список; одиночные клавиши инертны в input/textarea/contenteditable и отключаемы (`data-shortcuts-off`).
- Touch: ≥44×44 на coarse pointer, ≥8px между целями, никаких hover-only.
- 320px без горизонтального скролла страницы; 200% zoom; длинные пути/URL wrap; reduced motion.
- Скриншоты light/dark + axe в Playwright; отчёт с `path:`-evidence.

### 15.6 DSH mapping

`--cr-bg → var(--dsw-alias-bg-base)`, surface → layer-1, raised → layer-2, overlay → bg-overlay, border → border-l1/l2, text → label-primary/secondary, primary → brand-primary, danger/warning/success → state-*-primary, focus → brand-primary. В панели нет standalone-палитры, шрифтов и CDN.

### 15.7 Performance

- Initial JS standalone ≤ 180 KiB gzip (React + app); lazy route/компоненты ниже фолда.
- Diff: файл рендерится при подходе к viewport (IntersectionObserver + резерв высоты), DOM открытого файла ≤ 2500 узлов; tree/list виртуализируются >200 строк; long tasks не блокируют ввод.
- Цели: 500 файлов — интерактивность ≤ 2s локально; 1000 файлов/50k строк — без фризов при скролле; измеряется Playwright-марками (soft gate).
- Никаких layout shift: скелетоны с фиксированными размерами.

---

## 16. Docker

`Dockerfile` (multi-stage):

1. `deps`: node:22-bookworm-slim, pnpm, `pnpm fetch`.
2. `build`: `pnpm install --offline`, `pnpm build`, `pnpm test:unit`.
3. `runtime`: node:22-bookworm-slim + git + ca-certificates + tini; non-root `node`; `/data`; `CMD ["node","dist/review.js","serve","--host","0.0.0.0","--port","3100","--store","/data"]`. `dist/review.js` — esbuild-бандл `packages/server/src/cli.ts` (bin `review`), содержит core/server и не требует React.

`docker-compose.yml`:

```yaml
services:
  reviewd:
    build: .
    image: dsh-code-review:local
    restart: unless-stopped
    init: true
    ports: ["${CODE_REVIEW_PORT:-3100}:3100"]
    environment:
      CODE_REVIEW_TOKEN: ${CODE_REVIEW_TOKEN:?set in .env}
      CODE_REVIEW_STORE: /data
      CODE_REVIEW_PUBLIC_URL: ${CODE_REVIEW_PUBLIC_URL:-http://localhost:3100}
    volumes:
      - review-data:/data
      - ${CODE_REVIEW_REPOS:-$HOME/projects}:${CODE_REVIEW_REPOS:-$HOME/projects}:rw
    healthcheck:
      test: ["CMD", "node", "dist/review.js", "health", "--url", "http://127.0.0.1:3100"]
      interval: 30s
      timeout: 5s
      retries: 3
    read_only: true
    tmpfs: ["/tmp"]
    security_opt: ["no-new-privileges:true"]
    cap_drop: ["ALL"]
```

- Путь репозитория на хосте и в контейнере совпадает (`${CODE_REVIEW_REPOS}`), чтобы не вводить path mapping; DSH worker работает на хосте, daemon — в контейнере, и оба видят один и тот же абсолютный путь.
- Образ **не содержит** Claude Code/Codex/pi; reviewer — worker DSH или `command`, смонтированный/настроенный отдельно.
- TLS — reverse proxy; `CODE_REVIEW_PUBLIC_URL` и `trustProxy`; cookie Secure при `https`.
- Backup: volume `review-data` + `review gc`; restore — распаковать volume.
- Upgrade: миграции при старте; rollback — предыдущий образ + backup.
- Systemd unit — альтернатива для host-деплоя (документируется).

---

## 17. Безопасность

- **Токен**: без него daemon не стартует; не логируется; сравнение constant-time; rotation инвалидирует cookie.
- **XSS**: markdown рендерится безопасно (текст/код, без `dangerouslySetInnerHTML` для произвольного HTML); ссылки только http(s); code/quote — текст.
- **Prompt injection**: вывод ревьюера — данные; suggestions показываются как diff и применяются только человеком; reviewer worker ограничен read-only allowlist'ом (`read`, `read_image`, `grep`, `glob`, `review_status`, `review_feedback`).
- **Git**: `--no-ext-diff`, `--no-textconv`, `-c diff.external=`, без hooks; `apply` — только в `repo.root`, realpath-проверка, `--3way`, отказ при stale; после apply — повторный diff и событие.
- **Path traversal**: все пути нормализуются и проверяются; symlink наружу → отказ.
- **Command backend**: исполнение команды из конфига — доверенная граница; `shell:false` по умолчанию; env без токена daemon; process group kill.
- **DoS**: лимиты diff/файлов/комментариев/размеров тел; rate limit; таймауты; max SSE connections.
- **Секреты в коде**: signals подсвечивают, но не блокируют; диффы могут содержать секреты — доступ только по токену; логи не содержат дифф.
- **Docker**: non-root, read-only rootfs, cap_drop ALL, no-new-privileges; repo mount по умолчанию `:ro`; `:rw` — явный opt-in для внешних apply-инструментов.
- **Supply chain**: lockfile, минимальные deps, npm audit в CI, pinned base image digest.

---

## 18. Наблюдаемость и эксплуатация

- JSON-логи: `ts, level, msg, requestId, reviewId, jobId, workerId, durationMs`; без тел диффов/токенов/авторизации.
- `/api/health`: `{status, store:{writable}, git, jobs:{queued,running}, workers:{online}, version}`.
- `/api/version`: daemon/schema.
- Метрики v1 — JSON-счётчики в health (без Prometheus).
- Аудит — event log ревью; `review status --json` для CLI.
- Ошибки delivery/reviewer видны в UI с retry.
- Retention/GC; backup/restore; upgrade/rollback.

---

## 19. Тестирование и verification matrix

### 19.1 Уровни

| Уровень | Инструмент | Что покрывает |
|---|---|---|
| Unit | vitest | diff-парсер, anchor scoring, outcomes, event fold, schema validator, feedback renderer, auth/cookie, path safety, signals |
| Integration | vitest + temp git repos | создание/refresh/раунды, store crash (truncated tail), concurrent comments, lease expiry/requeue, delivery retry, apply conflict |
| Contract | vitest + fake worker/command | job protocol, idempotency, invalid output, partial validation |
| CLI | vitest + spawned daemon | `--json` схемы, exit codes, `feedback --wait`, auth |
| Browser | Playwright + axe | UI-сценарии, a11y, responsive, light/dark, keyboard, скриншоты |
| Docker | compose | D1 build, D2 up, D3 logs, D4 health, D5 integration, D6 down |
| DSH live | inspect + live session | install bundle, config, tool, command, slot, worker job, delivery |

### 19.2 Browser-сценарии

1. Empty → New review (fixture repo) → diff/дерево/статистика.
2. Комментарий к строке и диапазону; reload; markdown preview; resolve/reopen.
3. Report: severity-фильтры, jump-to-line, questions → ответ в тред.
4. Suggestion: apply при совпадении HEAD (файл в фикстуре изменён), stale → disabled с причиной.
5. Submit: verdict/summary; delivery pending → fake ack → sent; повторный submit только unresolved.
6. Round 2: агент исправил один пункт, другой нет, третий перенёс строку; board Addressed/Not fixed/Outdated; старая цитата видна; delta/full toggle.
7. Keyboard-only: create → comment → submit; focus ring; dialog trap/Escape.
8. Responsive 320/768/1024/1440; нет горизонтального overflow; touch targets.
9. Light/dark; axe 0 serious/critical; скриншоты.
10. Ошибки: daemon down (route abort), reviewer failed, apply conflict, stale review.
11. Deep links/back/forward.
12. Perf: 500/1000 файлов — марки/скролл (soft gate).

Артефакты: `test-results/` скриншоты, axe-отчёт, Playwright trace при падении; `path:`-evidence в verify-report.

### 19.3 DSH live gates

- `plugin_manager install_bundle` → `application: applied`, warnings прочитаны.
- `Config.listConfigs` видит схему; `Tool` видит 4 tool'а; `commands.list` видит `/review`; `Slots.listSubTree` видит panellist и main.
- Создание ревью из команды в тестовой сессии; worker забирает job; reviewer-субагент завершается; findings в daemon.
- Submit → `sessionController.prompt` доставляет в ту же сессию (проверить по session log); ack.
- Недоступный daemon → понятная ошибка tool/command/панели.

### 19.4 Definition of Done

- Все gates PASS или NOT RUN с reason/waiver.
- Playwright + axe + скриншоты приложены.
- Docker D1–D7.
- DSH live smoke.
- README/ARCHITECTURE/SECURITY обновлены.
- Retro и ledger в репозитории плагина.

---

## 20. Упаковка и OSS

- Репозиторий `dsh-code-review`, MIT, pnpm workspace, version 0.1.0.
- Пакеты: `@dsh-code-review/core|ui|server|web` (private до релиза), `dsh-code-review` (bundle).
- `README`: скриншоты, quickstart (Docker, CLI, DSH), архитектура, безопасность, ограничения.
- `CONTRIBUTING`: TDD, gates, commit style, design-system.
- `SECURITY.md`: токен, LAN, trust boundary reviewer command, сообщение об уязвимостях.
- CI: typecheck/lint/test/build/Playwright/Docker (D1–D4/D6) на PR.
- Release: changesets/tag; bundle установка через `plugin_manager`; npm publish — после стабилизации имён.
- MCP и adapters Pi/Claude Code/Codex — отдельные changes; core/HTTP/CLI не меняются.

---

## 21. Дорожная карта (changes)

| Change | Содержание | Зависит |
|---|---|---|
| C1 | Scaffold репо, workspace, tsconfig, lint/format, CI, design tokens + MASTER.md | — |
| C2 | Git-резолв, diff-парсер, snapshot/limits/tests | C1 |
| C3 | Event store, anchors, rounds, outcomes | C2 |
| C4 | ReviewService, reviewer contract, signals, feedback renderer, fake adapters | C3 |
| C5 | Daemon HTTP/auth/SSE, job queue/leases, CLI | C4 |
| C6 | Docker/Compose, health/ops, backup docs | C5 |
| C7 | UI components, standalone SPA, Playwright/axe/visual | C4 |
| C8 | DSH host: proxy, worker, delivery, tools, command | C5 |
| C9 | DSH client panel + install/live verification | C7, C8 |
| C10 | Hardening, docs, OSS packaging, release | C6, C9 |

Каждый change — proposal → design (при необходимости) → tasks → apply → verify → archive, волнами, с полными гейтами между волнами.

---

## 22. Риски и открытые вопросы

| Риск | Влияние | Митигация |
|---|---|---|
| Качество/стоимость reviewer | ложные/пропущенные находки | signals + verification + человек решает; лимиты/модель; повторяемость |
| Большие диффы | токены/латентность | лимиты, batching по файлам, subset review, lazy UI |
| DSH API drift | поломка адаптера | инспекция при установке, контрактные тесты, pinned версия |
| Worker не подключён | agent review недоступен | честный статус, retry, command backend, CLI feedback |
| Разные пути daemon/worker | job не может читать repo | bundle по API, cwd инициатора, compose с одинаковым путём |
| Apply конфликты | порча worktree | stale guard, `--3way`, preview, fallback в фидбек |
| Event log рост | диск/старт | snapshot cache, GC, retention |
| Мультипользователь без аккаунтов | атрибуция | имя в браузере; OIDC later |
| Playwright auth DSH | нет автотеста панели | слот/live smoke + скриншот с авторизованной страницы, явное ограничение |
| Локализация | UX | en/ru, locale service; DSH meta оба языка |
| Windows | не поддерживается v1 | документировать |

Утверждённые дефолты (2026-10-26): D11–D14 выше. Осталось уточнить только публичное имя пакетов перед первым npm-релизом; до этого используются рабочие имена.

---

## 23. Провенанс и ссылки

- DSH API подтверждены инспекцией 0.2.1-rc.2: `sessionController.prompt` (`SessionPromptRequest`, `PromptContentPart` text/image/file), `commands.register`, `tools.register`, `agents.create` + `whenIdle`, `connection.fetch.register`, `webServer.register`, theme tokens `--dsw-alias-*`, slots `sidebar.panellist` + `main`.
- UI-стили/палитра/типографика/motion — `ui-design-intelligence` (design-system query + `dark-mode-first`/`data-dense-console`, `Developer Tools IDE`, `JetBrains Mono / Inter`); для diff/thread правил в базе нет — общие дефолты + axe/Playwright.
- Delivery checklist: контраст, focus, touch, 320px, состояния, формы, motion, dark mode, provenance.
