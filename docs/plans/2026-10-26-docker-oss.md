# Docker, OSS Packaging and Operations Implementation Plan (C6/C10)

> Execute with Docker gates. Final checks batched per user directive.

**Goal:** Ship a deployable `reviewd` container and Compose stack, plus the OSS project surface needed for an external first release.

**Architecture:** Multi-stage Docker build from the pnpm workspace; runtime is Node 22 slim, non-root, one process, `/data` volume. Compose exposes the daemon behind a configurable public URL and healthcheck. CI verifies unit/build and browser tests; Docker gates verify the image.

**Spec:** `docs/design.md` sections 16–20; decisions D10/D13/D14.

## Global Constraints

- Runtime image: Node 22 slim, non-root uid/gid, no dev deps, `NODE_ENV=production`, read-only root fs compatible except `/data` and tmp.
- `CODE_REVIEW_TOKEN` required, ≥32 bytes; no default token in image/compose.
- Store at `/data`; health at `/api/health`; graceful SIGTERM.
- Port 3100 in container; compose maps `127.0.0.1:3100:3100` by default.
- No agent CLIs in v1 image.
- Docker gates D1–D7 must run when Docker files exist.
- OSS: MIT LICENSE (exists), README quickstart, CONTRIBUTING, SECURITY, .env.example, CHANGELOG or release notes, package metadata (repository/homepage/bugs/engines), no private tokens.

## File Structure

- `Dockerfile`, `.dockerignore`, `docker-compose.yml`, `.env.example`.
- `docs/ops.md` — reverse proxy/TLS, backup, upgrade, retention, token rotation.
- `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md`.
- `.github/workflows/ci.yml` — extend with browser/e2e and Docker build; `release.yml` optional tag workflow.
- `package.json` metadata; package READMEs.

## Task 1: Dockerfile and runtime

- [ ] Multi-stage: install workspace, build core/web/server; copy dist + production node_modules; run `node packages/server/dist/reviewd.js serve --host 0.0.0.0 --port 3100 --store /data`.
- [ ] Non-root user, `HEALTHCHECK` via `/api/health`, `STOPSIGNAL SIGTERM`, `/data` volume, no source/test files in final image.
- [ ] `.dockerignore`; test image build and size sanity.
- [ ] Commit.

## Task 2: Compose and ops docs

- [ ] `docker-compose.yml`: service, env file, port, volume, healthcheck, restart policy, read-only root with tmpfs, resource limits optional.
- [ ] `.env.example` with a placeholder token requirement (not a real one).
- [ ] `docs/ops.md`: TLS/reverse proxy, token rotation, backup/restore, retention/gc, upgrade, logs, failure recovery.
- [ ] Commit.

## Task 3: Docker gates

- [ ] Run D1 build, D2 up, D3 logs, D4 health, D5 integration (create review via HTTP with a mounted temp git repo or a documented fixture), D6 down, D7 no model downloads.
- [ ] Save evidence `docker compose config`, `ps`, health JSON, create review response, logs tail to `.superpowers/sdd/2026-10-26-review-state-core/docker/`.
- [ ] Fix all failures; commit.

## Task 4: OSS packaging and CI

- [ ] Add CONTRIBUTING, SECURITY, CHANGELOG, package metadata (repository/homepage/bugs/engines, files), `.env.example`.
- [ ] Extend CI: frozen install, build, verify, e2e/a11y with Playwright browser install (allow failure only if browser install is unavailable with an explicit skip), Docker build job.
- [ ] Ensure no secrets/private paths in published files; `pnpm pack` dry run for core/server.
- [ ] Commit.

## Task 5: Final product packaging

- [ ] README top-level: what it is, screenshot, quickstart (Docker and local), CLI, DSH install, security model, limitations, roadmap.
- [ ] Add a `docs/demo.md` or script that creates a review from a temp repo and prints URLs.
- [ ] Final full `pnpm verify`, Playwright/axe, Docker gates; tag a local `v0.1.0` only if the user asks (do not publish).
- [ ] Commit.

## Verification

- Docker D1–D7 pass with evidence.
- Container runs as non-root, health passes, token required, `/data` persists across restart.
- CI workflow syntax valid; local `pnpm verify` + e2e green.
- README quickstart works from a clean shell.
