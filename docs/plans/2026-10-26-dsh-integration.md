# DSH Integration Implementation Plan (C8/C9)

> Execute with installation and live verification. Checks batched at the end per user directive.

**Goal:** A Cordis bundle `dsh-code-review` that runs inside DSH: sidebar panel, same-origin daemon proxy, tools, `/review` command, reviewer worker, and feedback delivery back into the initiating session.

**Architecture:** Host half connects to an external `reviewd` with a token and exposes tools/commands/proxy/worker/delivery. Client half registers a sidebar panel and main panel that show reviews and open the standalone UI. The bundle is installed in the active profile with `plugin_manager`.

**Spec:** `docs/design.md` sections 5.1, 9.4, 10, 13; decisions D1/D2/D4/D8/D9.

## Global Constraints

- Host plugin config: `daemonUrl`, `token` (secret), `worker` boolean, `repoHint`, `reviewerBackend`, `sessionId` optional.
- Token never logged, rendered, or stored in client props.
- Tools: `review_start`, `review_status`, `review_refresh`, `review_feedback`; stable JSON output; typed errors as tool text, never throw.
- `/review <instruction>` creates a review for the current workspace/session and returns the review URL; no hidden network calls.
- Worker: long-poll `/api/jobs/next`, create a reviewer subagent via `ctx.agents.create` with initiator cwd/preset, run read-only, submit findings/report/fail, heartbeat, stop on dispose.
- Delivery: SSE/long-poll pending deliveries for `harness=dsh`; call `ctx.sessionController.prompt({sessionId, mode:'queue', content, requestId})`; ack on success, fail with typed error; resume closed sessions.
- The review must store initiator `{harness,sessionId,cwd,agentPreset?}` so delivery can target it; add it to C3/C4 create input and HTTP/CLI.
- Panel: sidebar `sidebar.panellist` id `code-review` + main keyed `code-review`; list of reviews, create button, open full UI; use DSH theme tokens (`--dsw-alias-*`), no standalone palette/CDN. Lazy load only the panel.
- Bundle: `package.json`, `cordis.patch.yml`, `index.js`/`host.js`, `client.js`, locale en/ru, `icon.svg`, README. No build step required if plain ESM/CJS; otherwise esbuild bundle.
- Install with `plugin_manager install_bundle` at the absolute workspace directory; verify application and live panel; do not hand-edit profile files.

## File Structure

- `packages/dsh/package.json`, `cordis.patch.yml`, `src/host.ts`, `src/client.tsx`, `src/api.ts`, `src/worker.ts`, `src/delivery.ts`, `src/tools.ts`, `src/command.ts`, `locale/{en,ru}.json`, `icon.svg`.
- `packages/dsh/test/*.test.ts` — pure helpers, mocked fetch/session/agent, no live DSH.
- Root `README.md`, `docs/dsh.md`.

## Task 1: Initiator and delivery contract

- [ ] Add `initiator?: { harness: string; sessionId: string; cwd?: string; agentPreset?: string }` to review creation (C3 state, C4 create input, HTTP POST, CLI `--session-id`/`--harness`), persisted in `review/created`; delivery payload includes it.
- [ ] Tests: round-trip initiator; delivery payload contains it; absent initiator yields pending without target.
- [ ] Commit.

## Task 2: Bundle scaffold, proxy and tools

- [ ] Create bundle manifest/patch/host/client/locale/icon; host config schema.
- [ ] Proxy `/api/code-review/*` prefix to `daemonUrl/api/*` with bearer; 401/502 mapping; no token in response.
- [ ] Tools with JSON schemas and stable text output; command `/review`; workspace repo/cwd resolution from agent session.
- [ ] Unit tests with mocked fetch; syntax check; commit.

## Task 3: Reviewer worker and delivery bridge

- [ ] Worker loop: register, long-poll, heartbeat, create reviewer subagent with `ctx.agents.create({agentOptions})` and read-only tool restrictions; prompt from job bundle; parse output; POST findings/report/ack; cancel/dispose.
- [ ] Delivery loop: pending for `dsh`, `sessionController.prompt`, ack/fail, idempotent `requestId`, closed-session resume, retry/backoff.
- [ ] Unit tests with fake agents/session/fetch; no real model; commit.

## Task 4: Client panel

- [ ] Client manifest and slot registrations: `sidebar.panellist` id `code-review`, main keyed `code-review`; list reviews via proxy, create button, open standalone review URL, loading/empty/error/auth states; theme tokens; keyboard/focus; tests with a fake loader if feasible.
- [ ] Screenshot/manual verification note.
- [ ] Commit.

## Task 5: Build, install and live verification

- [ ] Ensure bundle entry is loadable by the profile; `plugin_manager install_bundle` the workspace directory; read `application` result.
- [ ] `cordis_inspect_query` confirms new rows; open Web GUI, verify sidebar icon/panel and no console errors; exercise `/review`/tools if safe.
- [ ] Start `reviewd` if needed; prove one delivery into the initiating session (or document the exact blocked condition and what was verified).
- [ ] README/docs with install/config/security; commit.

## Verification

- `pnpm verify` green; bundle installed with `application: applied`.
- Live panel visible in the Web GUI; screenshot.
- Delivery path proven with a real session or a precise residual blocker.
