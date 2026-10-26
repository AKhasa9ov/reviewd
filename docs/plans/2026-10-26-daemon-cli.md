# Daemon and CLI Implementation Plan (C5)

> Execute with TDD. Checks batched at the end per the user's directive.

**Goal:** Expose the C4 service through an authenticated HTTP daemon (REST, SSE/long-poll, workers, jobs, deliveries) and a `review` CLI that works locally and remotely.

**Architecture:** `packages/server` owns `node:http`, auth, transport mapping, job leases and delivery queue. Business logic stays in `ReviewService`. The CLI is a thin HTTP client for daemon commands, with `review diff` remaining local. No React/DSH imports.

**Tech Stack:** Node 22 `node:http`, `node:crypto`, built-in `fetch`; TypeScript strict, ESM, Vitest; no runtime deps.

**Spec:** `docs/design.md` sections 10–12; decisions D2/D5/D7/D11/D12.

## Global Constraints

- `CODE_REVIEW_TOKEN` required; minimum 32 bytes; constant-time compare. No token → daemon refuses to start.
- Bearer auth for machine clients; browser `POST /api/auth` sets `cr_session` HMAC cookie (HttpOnly, SameSite=Strict, Secure when TLS, 30d).
- CSRF: mutations require same-origin `Origin`/`Sec-Fetch-Site`; no CORS.
- Rate limit per peer: 60 mutations/min, 600 reads/min; 429 + Retry-After.
- Errors always `{error:{code,message,details?}}`; codes from the design.
- `/api/health` and `/api/version` unauthenticated and minimal.
- SSE heartbeat 15s, `Last-Event-ID`/`after`, in-memory 1000-event buffer; long-poll 25s.
- Job lease 60s, heartbeat 20s, expiry requeues up to 2 attempts, `attemptId` idempotency.
- Delivery key `reviewId:round:submissionId`; pending/ack/fail; no secrets.
- CLI exit codes: 0 ok, 2 timeout/not ready, 3 auth, 4 daemon unavailable, 5 validation, 6 conflict/stale.
- `--json` schema stable: `{review,url,warnings}` (or documented shape per command).
- No UI implementation; static serving is a placeholder until C7.

## File Structure

- `packages/server/src/daemon/{server.ts,auth.ts,http.ts,routes.ts,sse.ts,jobs.ts,deliveries.ts,cli.ts}`.
- `packages/server/src/cli/run.ts` — extend; `packages/server/src/cli/client.ts`.
- `packages/server/test/daemon/*.test.ts`, `packages/server/test/cli/*.test.ts`.
- `scripts/build.mjs` — build daemon entry.
- Root `README.md`, `docs/` — daemon/CLI contract.

## Interfaces

```ts
interface DaemonConfig { host: string; port: number; storeDir: string; publicUrl: string; token: string; trustProxy: boolean }
interface ReviewDaemon { url: string; close(): Promise<void> }
function startDaemon(config: DaemonConfig, deps?: Partial<DaemonDeps>): Promise<ReviewDaemon>
```

CLI commands: `serve`, `start`, `status`, `feedback`, `comments list|add`, `submit`, `refresh`, `fix-status`, `health`, `version`, `gc`.

## Task 1: Auth, HTTP core and errors

- [ ] Failing tests: missing/short token; bearer accepted/rejected constant-time; `/api/auth` cookie round-trip + logout; CSRF rejects cross-origin mutations; rate limit 429 with Retry-After; unknown route 404; error envelope.
- [ ] Implement `createHttpServer`, token/cookie helpers, JSON parsing with size cap, request id, rate limiter, error mapping.
- [ ] Commit.

## Task 2: Review REST and events

- [ ] Failing tests: create/list/get/snapshot/comments/reply/state/suggestion/refresh/submit/close map to service; validation errors 400; not-found 404; conflict 409; stale 409; `after` events; long-poll timeout; SSE emits review events and heartbeat; auth on all.
- [ ] Implement routes and `sse.ts`; store event buffer; serialize views.
- [ ] Commit.

## Task 3: Jobs, workers and deliveries

- [ ] Failing tests: register/heartbeat; nextJob lease 60s; no duplicate concurrent lease; expiry requeue attempt+1; max 2 attempts; findings/report/fail idempotent by attemptId; cancel; delivery pending/ack/fail; pending by harness after reconnect.
- [ ] Implement `jobs.ts`, `deliveries.ts`, routes; persist agent events through the service; no job loss.
- [ ] Commit.

## Task 4: CLI

- [ ] Failing tests: help/version; `serve` starts and shuts down; `start` posts and prints human/JSON; `status`/`comments`/`feedback`; `submit` verdict mapping; `refresh`; injectable `fetch` and config env; exit codes 0/2/3/4/5/6; `--daemon`/`CODE_REVIEW_URL`/`CODE_REVIEW_TOKEN`.
- [ ] Implement client + commands; keep `review diff` behavior unchanged; `gc` removes closed reviews older than N days through a store method (add `ReviewStore.gc`).
- [ ] Commit.

## Task 5: Docs, build and verification

- [ ] Update build to emit `packages/server/dist/reviewd.js` with executable shebang; bin `review` remains.
- [ ] README daemon/CLI section: env, token, endpoints, curl examples, exit codes, systemd/docker pointers.
- [ ] Run full `pnpm verify`; commit.

## Verification

- Ephemeral-port daemon tests use `fetch` against a real listening server.
- Token never appears in logs/events.
- SSE/long-poll tests do not hang (AbortSignal).
- `review help`, `review version`, `review serve --help` work from built CLI.
