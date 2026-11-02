# reviewd documentation

reviewd is an agent-native code review control plane: independent AI pre-review,
line-anchored human comments, round tracking, and deterministic feedback to the agent that
opened the change.

This page is the map. Pick the path that matches what you are doing.

## Choose your path

| You are…                       | Read this first                                | Then                                                                    |
| ------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| New to reviewd                 | [What reviewd does](features.md)               | [Quick start](getting-started/quickstart.md)                            |
| Reviewing a change             | [Review a change](guides/review-a-change.md)   | [Features: human review](features.md#review-that-survives-force-pushes) |
| Building a fix agent           | [Run a fix agent](guides/run-a-fix-agent.md)   | [CLI reference](reference/cli.md) · [HTTP API](reference/http-api.md)   |
| Integrating a harness          | [Connect an agent](guides/connect-an-agent.md) | [DSH integration](agents/dsh.md)                                        |
| Deploying or operating reviewd | [Deploy reviewd](guides/deploy.md)             | [Security](../SECURITY.md)                                              |
| Debugging a failed review      | [Troubleshoot](guides/troubleshoot.md)         | [HTTP API errors](reference/http-api.md#errors)                         |
| Working on reviewd itself      | [Architecture](architecture.md)                | [CONTRIBUTING.md](../CONTRIBUTING.md)                                   |

## Documentation map

### Learn

- [Features](features.md) — what reviewd does, with screenshots and concrete behavior.
- [Architecture](architecture.md) — components, data flow, event-sourced review state.
- [Quick start](getting-started/quickstart.md) — Docker, local Node and DSH setup.
- [Demo](getting-started/demo.md) — a disposable repository with a ready-made review.

### Do

- [Review a change](guides/review-a-change.md) — the human review loop.
- [Run a fix agent](guides/run-a-fix-agent.md) — feedback, edits, refresh and comment resolution.
- [Connect an agent](guides/connect-an-agent.md) — DSH, CLI and HTTP integration matrix.
- [Deploy reviewd](guides/deploy.md) — TLS, repositories, backups, retention and upgrades.
- [Troubleshoot](guides/troubleshoot.md) — common startup, auth, worker and round failures.

### Look up

- [CLI reference](reference/cli.md) — commands, flags and exit codes.
- [HTTP API](reference/http-api.md) — authentication, routes, errors and events.
- [Review state](reference/review-state.md) — store layout, events, rounds, anchors and outcomes.
- [Worker protocol](reference/worker-protocol.md) — leases, reports and failure semantics.
- [Security](../SECURITY.md) — threat model, token handling and container hardening.
- [Changelog](../CHANGELOG.md) — release history.

### For agents

- [AGENTS.md](../AGENTS.md) — short entrypoint for agents that use reviewd.
- [Agent integration](agents/README.md) — DSH, CLI and HTTP recipes.
- [DSH integration](agents/dsh.md) — native bundle, tools and worker.
- [CLI agent loop](agents/cli.md) — portable command-line workflow.
- [Reviewer contract](agents/reviewer.md) — structured findings and worker behavior.
- [Fixer contract](agents/fixer.md) — resolve comments and report evidence.

## Product boundaries

reviewd is a **single-tenant, self-hosted review service**. It is not a code host, not a
merge bot, and not a multi-user account system. It stores review state locally and exposes
one authenticated HTTP service to the UI, CLI, DSH and workers.

The canonical package scope is `@dsh-code-review/*`; the project name is reviewd. The scope
is kept for continuity with the existing DSH integration and published package names.

## Conventions

- Public documentation is English. Package READMEs stay next to their packages.
- Local links must resolve; `pnpm docs:check` enforces this in CI.
- Screenshots live in `images/`; they are captured from the built UI, not mockups.
- Internal planning and design history is intentionally not part of this public tree; Git
  history remains the source of record.
