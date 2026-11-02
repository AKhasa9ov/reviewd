<div align="center">

# reviewd

**An agent-native code review control plane.**

Independent AI pre-review, line-anchored human comments, round tracking, and a clean
feedback loop back to the coding agent that opened the review.

[![CI](https://github.com/AKhasa9ov/reviewd/actions/workflows/ci.yml/badge.svg)](https://github.com/AKhasa9ov/reviewd/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-22%2B-5FA04E.svg)](https://nodejs.org/)

[Quick start](#quick-start) · [Features](docs/features.md) · [Documentation](docs/README.md) · [Agents](AGENTS.md)

<img src="docs/images/reviewd-conversation-dark.png" alt="reviewd review detail: re-anchored comments, suggestions and fix status after a round" width="100%">

<sub>A real review after a fix round: one thread addressed, three decisions still open, and every
comment still attached to its line.</sub>

</div>

## See it in motion

<p align="center">
  <img src="docs/images/reviewd-demo.gif" alt="reviewd walkthrough: review queue, comment thread, diff, reviewer report and submit dialog" width="100%">
</p>

<p align="center">
  <sub><a href="docs/images/reviewd-walkthrough.webm">Open the 13-second WebM walkthrough</a> · the flow from queue to handoff, recorded on the real UI.</sub>
</p>

## Why reviewd

Coding agents are good at opening a change and bad at closing the loop around it. reviewd
gives the change a durable review surface:

- an independent reviewer can inspect the diff before a human does;
- a human can leave precise, line-anchored comments and accept or dismiss findings;
- the next agent pass gets deterministic markdown/JSON feedback instead of a chat summary;
- every round, decision and resolution stays in an audit-friendly event log.

reviewd is **self-hosted** and **harness-agnostic**. DSH gets a native panel and tools;
Claude Code, Codex, pi and a plain shell use the same authenticated CLI/HTTP contract.
It is not a GitHub/GitLab replacement — it is the review layer for agent-driven work.

## A tour of the review loop

### 1. One queue for every change

<img src="docs/images/reviewd-list-dark.png" alt="reviewd review queue grouped by repository with status and not-fixed counts" width="100%">

Reviews are grouped by repository and show status, rounds, open comments and the count that
still needs attention. Search and filters work on the same list a human actually uses.

### 2. The diff is the workspace

<img src="docs/images/reviewd-diff-dark.png" alt="reviewd unified diff with file tree, changed files and finding badges" width="100%">

Delta and full views, a file tree with change counts, inline suggestions and comment or
finding badges. Every thread keeps its file, side and line — including lines outside the
hunk.

### 3. An independent pre-review

<img src="docs/images/reviewd-report-dark.png" alt="reviewd reviewer report with severity, findings, dismissed decision and fix status" width="100%">

A reviewer worker posts structured findings with severity, evidence, questions and optional
suggestions. A human accepts or dismisses each one with a note; accepted work stays
actionable for the next agent.

### 4. Submit is a handoff, not a comment

<img src="docs/images/reviewd-submit-context-dark.png" alt="reviewd submit review dialog with verdict, summary and pending comments" width="100%">

Submitting produces a deterministic feedback package: unresolved comments, accepted
findings, dismissed reasons, suggestions, questions and verification. It is delivered to the
initiating DSH session or read by CLI/HTTP clients.

<p align="center">
  <img src="docs/images/reviewd-mobile-dark.png" alt="reviewd review detail reflowed for a narrow viewport" width="300">
</p>

<p align="center">
  <sub>The same review surface down to 320px, with keyboard navigation and light/dark themes.</sub>
</p>

The same review survives a force-push: comments are re-anchored across renames and moved
hunks, old and new locations are visible, and outcomes are explicit (`applied`, `addressed`,
`unchanged`, `outdated`, `moved`). Nothing is silently rewritten.

## What stays true

- **Independent pre-review.** A read-only reviewer reads the diff, manifest and surrounding
  code, then posts findings as events — never as an unstructured chat log.
- **Review that survives the change.** Immutable rounds, quoted context, content hashes and
  deterministic re-anchoring keep the conversation attached to the code.
- **A real handoff.** The feedback package has a stable key and no timestamps or random
  values, so repeated reads and deliveries are idempotent.
- **Self-hosted state.** Append-only `events.jsonl` per review, local store, one token, no
  hosted service. The UI, CLI, DSH bundle and workers are adapters over the same service.

## Quick start

### Docker (recommended)

Requires Docker 26+ with Compose v2. The stack binds `127.0.0.1:3100` by default.

```bash
TOKEN="$(openssl rand -hex 32)"
CODE_REVIEW_TOKEN="$TOKEN" CODE_REVIEW_PUBLIC_URL=http://127.0.0.1:3100 \
  docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health
```

Open <http://127.0.0.1:3100>, sign in with `$TOKEN`, and create a review. Keep the token
across restarts by copying `.env.example` to `.env`; `.env` is gitignored.

The image only sees repositories you mount. See [Deploy reviewd](docs/guides/deploy.md) for
repository mounts, TLS, token rotation, backups, retention and upgrades. **Do not expose port
3100 directly to the public internet:** there is one shared token and no account system.

### Local (Node 22)

```bash
pnpm install
pnpm build
export CODE_REVIEW_TOKEN="$(openssl rand -hex 32)"
export CODE_REVIEW_STORE=/tmp/code-review-store
node packages/server/dist/reviewd.js
# http://127.0.0.1:3100
```

Need a disposable repository and a ready-made review? Run `scripts/demo.sh`; it starts a
daemon on a random port, creates a `base..feature` review and prints the URL.

### DSH

```bash
dsh plugin --profile web add @sir_yami/reviewd
```

Restart the profile so Host routes and loops load. Embedded mode is the default: the bundle
starts `reviewd` in-process and serves the review UI at `/code-review` behind DSH session
auth. See [DSH integration](docs/agents/dsh.md) for configuration, tools, worker and data
retention.

> **Release status:** `0.1.0` is published under the `@sir_yami` scope. Install the DSH
> package from npm; Docker and source checkouts remain available.

### CLI

After `pnpm build`, the CLI is at `packages/server/dist/cli.js`; the published package is
`review` from `@sir_yami/reviewd-server`.

```bash
review start --repo /srv/repo --base main --reviewer worker --json
review status <id> --json
review comments add <id> --file src/a.ts --line 42 --body 'Please explain'
review feedback <id> --wait --format md
review submit <id> --request-changes --summary 'Address the blocker'
review refresh <id>
review health
```

Remote commands use `CODE_REVIEW_URL` (or `--daemon`) and `CODE_REVIEW_TOKEN`. `review diff`
is local and needs no daemon. See the [CLI reference](docs/reference/cli.md) for the full
command surface and exit codes.

## Documentation

| I want to…                                  | Start here                                                                            |
| ------------------------------------------- | ------------------------------------------------------------------------------------- |
| See the full feature tour                   | [Features](docs/features.md)                                                          |
| Install and create my first review          | [Quick start](docs/getting-started/quickstart.md)                                     |
| Review a change as a human                  | [Review a change](docs/guides/review-a-change.md)                                     |
| Run a fix agent against review feedback     | [Run a fix agent](docs/guides/run-a-fix-agent.md)                                     |
| Connect DSH, Claude Code, Codex, pi or HTTP | [Connect an agent](docs/guides/connect-an-agent.md)                                   |
| Deploy and operate reviewd                  | [Deploy](docs/guides/deploy.md)                                                       |
| Look up commands or HTTP routes             | [CLI](docs/reference/cli.md) · [HTTP API](docs/reference/http-api.md)                 |
| Understand the internals                    | [Architecture](docs/architecture.md) · [Review state](docs/reference/review-state.md) |
| Work on the code                            | [CONTRIBUTING.md](CONTRIBUTING.md)                                                    |

The complete documentation index is [docs/README.md](docs/README.md). Agents that use
reviewd should start at [AGENTS.md](AGENTS.md); a machine-readable index is at [llms.txt](llms.txt).

## How it works

```mermaid
flowchart LR
  Agent[Coding agent] -->|start review| Daemon[reviewd]
  Daemon --> Reviewer[Independent reviewer]
  Reviewer -->|findings| Daemon
  Daemon --> UI[Human review UI]
  UI -->|comments, decisions, submit| Daemon
  Daemon -->|deterministic feedback| Agent
  Agent -->|fix, refresh, resolve| Daemon
```

The daemon owns the review lifecycle; the UI, CLI, DSH bundle and workers are adapters over
the same service. See [Architecture](docs/architecture.md) for components and data flow.

## Security model

- One shared bearer token (`CODE_REVIEW_TOKEN`, 32+ bytes), required at startup and never
  logged or baked into the image. Browsers exchange it for an HttpOnly, SameSite=Strict
  cookie; machine clients use `Authorization: Bearer`.
- Health and version are public; all review data is authenticated. Mutations reject
  cross-origin requests; there is no CORS. Rate limits and body/diff/snapshot caps bound
  resource use.
- `reviewd` is plain HTTP. Terminate TLS at a reverse proxy and keep the listener on loopback
  or a private network. There are no per-user accounts or token revocation lists.
- Reviewer output and comments are untrusted data. Rendering is safe text/code; reviewer
  tools use a read-only allowlist; command backends run without a shell, with a minimal
  environment and bounded output.

See [SECURITY.md](SECURITY.md) for the full threat model and reporting process.

## Status and limitations

- **0.1.x release.** API/schema version 1; no automatic event-schema migrations.
- Single-tenant by design: one token, no accounts, no hosted control plane.
- No bundled model or agent CLI; bring a DSH worker, command backend or your own reviewer.
- Native adapters exist for DSH only. Claude Code, Codex, pi and other harnesses use the
  CLI/HTTP contract; MCP is not shipped.
- The event store is a single-writer local filesystem store; there is no HA/clustering.
- The image is Linux/amd64-oriented; multi-arch manifests are not published.
- npm packages are published under `@sir_yami/*`; the DSH package is `@sir_yami/reviewd`.

## License

[MIT](LICENSE)
