# Fat DSH Package Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the thin DSH control-surface bundle into one self-contained npm package that starts `reviewd`, serves the full review SPA, and opens that SPA in a new tab from the DSH panel.

**Architecture:** The DSH host starts an in-process daemon on an ephemeral loopback port and wraps it in a deferred API client. The host serves the SPA at `/code-review/` through the DSH web server, proxies `/code-review/api/*` to the daemon with the internal bearer, and gates both with the existing DSH connection check. A separate Vite build embeds `/code-review/` as the asset base and sets DSH-session auth mode. External `daemonUrl` mode remains available.

**Tech Stack:** Node 22, TypeScript, React 18, Vite 8, Vitest 5, esbuild, Playwright, pnpm.

**Spec:** There is no separate fat-package spec yet. This plan records the approved design from the 2026-10-28 discussion and must be read with [docs/dsh.md](/home/superuser/projects/dsh-code-review/docs/dsh.md) and [the existing DSH integration plan](/home/superuser/projects/dsh-code-review/docs/plans/2026-10-26-dsh-integration.md).

## Global Constraints

- Target remains `@dsh-code-review/dsh`; release naming and npm publication are separate decisions.
- Full UI opens in a new tab at `/code-review/`; no iframe in this plan.
- Embedded daemon binds only to `127.0.0.1` with port `0`.
- The browser never receives the daemon bearer token; embedded UI uses the DSH session.
- Existing external `daemonUrl` mode and `/api/code-review` panel proxy must keep working.
- One npm package, no runtime imports from `../server` or workspace packages.
- Node 22, strict TypeScript, Prettier, ESLint, Vitest, Playwright.
- Every task ends with its focused tests, `pnpm typecheck`, and an atomic commit.
- The full gates before shipping are `pnpm verify` plus the package smoke check.
- Do not include source maps, tests, `node_modules`, or CWD-relative paths in the published tarball.
- Do not start a DSH instance on port `3099`; use a disposable profile for install verification.

## Decisions

- **D1 — UI surface:** new tab, same-origin under `/code-review/`. This avoids CSP/frame changes and keeps the standalone layout.
- **D2 — Runtime default:** the fat package patch defaults to `embedded: true`; `embedded: false` preserves the external daemon.
- **D3 — Auth:** embedded mode relies on the DSH connection gate. The host proxy injects the internal bearer. Token login remains only for standalone/external builds.
- **D4 — Base path:** assets and routes use `/code-review/`; API uses `/code-review/api/*`, mapped to daemon `/api/*`.
- **D5 — Store:** embedded store defaults to `~/.local/share/dsh-code-review`; `storeDir` overrides it.
- **D6 — Worker:** the fat patch defaults to `worker: true` so reviews can run; `worker: false` remains available.
- **D7 — Out of scope:** iframe embedding, CLI/Docker changes, auth migration for external daemons, npm name change, actual npm publishing.

## File Structure

New:

- `packages/dsh/src/embedded.ts` — start/close the in-process daemon, deferred API.
- `packages/dsh/src/ui.ts` — `/code-review/` static + API dispatcher.
- `packages/web/src/base.ts` — base path, auth mode, URL helpers.
- `packages/web/src/vite-env.d.ts` — Vite `ImportMetaEnv` typings.
- `packages/dsh/test/embedded.test.ts` — daemon lifecycle.
- `packages/dsh/test/ui.test.ts` — static/API dispatch and gate.
- `packages/dsh/test/package.test.ts` — tarball manifest invariants.
- `packages/dsh/LICENSE` — MIT text for the publishable package.
- `scripts/verify-fat-package.mjs` — built-tarball smoke check.

Modified:

- `packages/dsh/package.json` — publishable files, license, prepack.
- `packages/dsh/cordis.patch.yml` — embedded defaults.
- `packages/dsh/src/config.ts` — embedded/store/uiBase fields.
- `packages/dsh/src/api.ts` — `ReviewApiLike` and `DeferredReviewApi`.
- `packages/dsh/src/proxy.ts` — prefix, deferred endpoint, `uiBase` in `/info`.
- `packages/dsh/src/host.ts` — embedded lifecycle, UI route, readiness.
- `packages/dsh/src/tools.ts`, `command.ts`, `worker.ts`, `delivery.ts` — accept `ReviewApiLike`.
- `packages/dsh/client.js` — use `info.uiBase` for the Open link.
- `packages/server/src/daemon/static.ts` — base-path-aware static serving.
- `packages/server/test/daemon/static.test.ts` — base-path regression tests.
- `packages/web/src/router.tsx` — base-aware parse/navigate/Link.
- `packages/web/src/App.tsx` — base API URL and embedded auth behavior.
- `scripts/build.mjs` — standalone and fat UI builds, server alias.
- `packages/dsh/README.md`, `docs/dsh.md`, `CHANGELOG.md` — install and mode documentation.
- `package.json` — optional fat smoke script; no runtime dependency changes.

## Task 1: Publishable package manifest and dual UI build

**Files:**
- Modify: `packages/dsh/package.json`
- Modify: `scripts/build.mjs`
- Modify: `.prettierignore`, `.gitignore`, `eslint.config.js`
- Create: `packages/dsh/test/package.test.ts`
- Create: `packages/dsh/LICENSE`

**Interfaces:**
- `packages/dsh/package.json` must expose `dsh.bundle.patch`, `dsh.client`, `index.js`, `client.js`, and `web`.
- `scripts/build.mjs` must produce both `packages/web/dist` (base `/`) and `packages/dsh/web` (base `/code-review/`).

- [ ] **Step 1: Write the failing manifest test**

```ts
// packages/dsh/test/package.test.ts
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

interface PackageJson {
  private?: boolean;
  license?: string;
  files?: string[];
  dsh?: { bundle?: { patch?: string }; client?: { platform?: string } };
}

const pkg = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as PackageJson;

describe('publishable DSH package manifest', () => {
  it('declares the fat runtime, license and bundle entry', () => {
    expect(pkg.private).not.toBe(true);
    expect(pkg.license).toBe('MIT');
    expect(pkg.files).toEqual(
      expect.arrayContaining(['index.js', 'client.js', 'web', 'cordis.patch.yml', 'LICENSE']),
    );
    expect(pkg.dsh?.bundle?.patch).toBe('./cordis.patch.yml');
    expect(pkg.dsh?.client?.platform).toBe('web');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run packages/dsh/test/package.test.ts`
Expected: FAIL because `private` is `true` and `files` has no `web`/`LICENSE`.

- [ ] **Step 3: Update the package manifest and build graph**

In `packages/dsh/package.json`:

- remove `"private": true`;
- add `"license": "MIT"`;
- add `LICENSE` to `files`;
- add `web` to `files`;
- add `"prepack": "node ../../scripts/build.mjs"`.

In `scripts/build.mjs`, add a second Vite build after the standalone build:

```js
const root = join(import.meta.dirname, '..');
const webConfig = join(root, 'packages/web/vite.config.ts');

async function buildWeb(base, outDir, authMode) {
  process.env.VITE_AUTH_MODE = authMode;
  await viteBuild({
    configFile: webConfig,
    base,
    define: { 'import.meta.env.VITE_AUTH_MODE': JSON.stringify(authMode) },
    build: { outDir, emptyOutDir: true },
  });
}

await buildWeb('/', join(root, 'packages/web/dist'), 'token');
await buildWeb('/code-review/', join(root, 'packages/dsh/web'), 'dsh');
```

Keep the existing standalone build output at `packages/web/dist`; the fat build output is generated and included by `files` when packing. Add `packages/dsh/web/` to `.prettierignore`, `.gitignore` and the ESLint ignore list so generated assets do not fail the quality gates. Add the core alias to the DSH host build if it is not already present:

```js
alias: { '@dsh-code-review/core': coreEntry },
```

Create `packages/dsh/LICENSE` by copying the root MIT license text. Do not add source maps to either package build.

- [ ] **Step 4: Verify the build and manifest**

Run: `pnpm vitest run packages/dsh/test/package.test.ts`
Expected: PASS.

Run: `pnpm build`
Expected: exit 0.

Run:

```bash
test -f packages/dsh/web/index.html
grep -q '/code-review/assets/' packages/dsh/web/index.html
```

Expected: both commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/dsh/package.json packages/dsh/LICENSE packages/dsh/test/package.test.ts scripts/build.mjs .prettierignore .gitignore eslint.config.js
git commit -m "build(dsh): produce publishable fat package assets"
```

**Verify:** `pnpm vitest run packages/dsh/test/package.test.ts && pnpm build && test -f packages/dsh/web/index.html`
**Done:** The package manifest declares the fat runtime; both UI builds exist; the fat HTML points at `/code-review/assets/`.

## Task 2: Embedded daemon controller and deferred API

**Files:**
- Create: `packages/dsh/src/embedded.ts`
- Modify: `packages/dsh/src/api.ts`
- Create: `packages/dsh/test/embedded.test.ts`

**Interfaces:**
- Produces `ReviewApiLike` with `get<T>(path, signal?)` and `post<T>(path, body, signal?)`.
- Produces `DeferredReviewApi implements ReviewApiLike` whose constructor takes `Promise<ReviewApiLike>`.
- Produces `startEmbeddedReview(config: ReviewConfig, options?): EmbeddedReview`.
- `EmbeddedReview` exposes `ready: Promise<ReviewDaemon>`, `api: ReviewApiLike`, `token: string`, `close(): Promise<void>`.

- [ ] **Step 1: Write the failing lifecycle test**

```ts
// packages/dsh/test/embedded.test.ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { normalizeConfig } from '../src/config.js';
import { startEmbeddedReview } from '../src/embedded.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).reverse().map((fn) => fn()));
});

describe('embedded review daemon', () => {
  it('starts on loopback, serves the API, and closes the port', async () => {
    const storeDir = await mkdtemp(join(tmpdir(), 'cr-embedded-'));
    const embedded = startEmbeddedReview(
      normalizeConfig({ worker: false, reviewerBackend: 'none' }),
      { storeDir },
    );
    cleanups.push(async () => {
      await embedded.close();
      await rm(storeDir, { recursive: true, force: true });
    });

    const daemon = await embedded.ready;
    expect(daemon.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(await embedded.api.get('/api/health')).toMatchObject({ ok: true });

    await embedded.close();
    await expect(fetch(`${daemon.url}/api/health`)).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run packages/dsh/test/embedded.test.ts`
Expected: FAIL with `startEmbeddedReview is not a function`.

- [ ] **Step 3: Implement the controller and deferred API**

In `packages/dsh/src/api.ts`:

```ts
export interface ReviewApiLike {
  get<T = unknown>(path: string, signal?: AbortSignal): Promise<T>;
  post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T>;
}

export class DeferredReviewApi implements ReviewApiLike {
  constructor(private readonly ready: Promise<ReviewApiLike>) {}

  async get<T = unknown>(path: string, signal?: AbortSignal): Promise<T> {
    return (await this.ready).get<T>(path, signal);
  }

  async post<T = unknown>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
    return (await this.ready).post<T>(path, body, signal);
  }
}
```

In `packages/dsh/src/embedded.ts`:

```ts
import { randomBytes } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { startDaemon } from '../../server/src/daemon/server.js';
import type { ReviewDaemon } from '../../server/src/daemon/types.js';
import { DeferredReviewApi, ReviewApi } from './api.js';
import type { ReviewApiLike } from './api.js';
import type { ReviewConfig } from './config.js';

export interface EmbeddedReview {
  ready: Promise<ReviewDaemon>;
  api: ReviewApiLike;
  token: string;
  close(): Promise<void>;
}

export interface EmbeddedOptions {
  storeDir?: string;
  webDir?: string;
  startDaemon?: typeof startDaemon;
}

export function startEmbeddedReview(
  config: ReviewConfig,
  options: EmbeddedOptions = {},
): EmbeddedReview {
  const token = randomBytes(32).toString('base64url');
  const storeDir = options.storeDir ?? join(homedir(), '.local', 'share', 'dsh-code-review');
  const start = options.startDaemon ?? startDaemon;
  const ready = start({
    host: '127.0.0.1',
    port: 0,
    storeDir,
    token,
    ...(options.webDir === undefined ? {} : { webDir: options.webDir }),
  });
  const api = new DeferredReviewApi(
    ready.then((daemon) => new ReviewApi({ ...config, daemonUrl: daemon.url, token })),
  );

  let closing: Promise<void> | undefined;
  return {
    ready,
    api,
    token,
    close(): Promise<void> {
      closing ??= (async () => {
        const daemon = await ready.catch(() => undefined);
        if (daemon !== undefined) await daemon.close();
      })();
      return closing;
    },
  };
}
```

Add a second test for the deferred client: construct a promise of a fake `ReviewApiLike`, call `get`, assert it has not resolved before the promise resolves, resolve it, then assert the value. Add a test that `close()` before readiness still closes once the daemon is ready.

- [ ] **Step 4: Verify the focused tests and types**

Run: `pnpm vitest run packages/dsh/test/embedded.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dsh/src/embedded.ts packages/dsh/src/api.ts packages/dsh/test/embedded.test.ts
git commit -m "feat(dsh): add embedded review daemon controller"
```

**Verify:** `pnpm vitest run packages/dsh/test/embedded.test.ts && pnpm typecheck`
**Done:** An embedded daemon starts on an ephemeral loopback port, serves health, and closes cleanly; API calls can wait for readiness.

## Task 3: Host embedded mode, config and proxy endpoint

**Files:**
- Modify: `packages/dsh/src/config.ts`
- Modify: `packages/dsh/src/proxy.ts`
- Modify: `packages/dsh/src/host.ts`
- Modify: `packages/dsh/src/tools.ts`, `command.ts`, `worker.ts`, `delivery.ts`
- Modify: `packages/dsh/cordis.patch.yml`
- Modify: `packages/dsh/test/host.test.ts`
- Modify: `packages/dsh/test/proxy.test.ts`
- Create: `packages/dsh/test/config.test.ts`

**Interfaces:**
- `ReviewConfig` adds `embedded: boolean`, `uiBase: string`, `storeDir?: string`.
- `createProxyHandler` accepts `prefix?: string`, `endpoint?: Promise<{ daemonUrl: string; token: string }>`, `uiBase?: string`.
- `startLoops`, tools, command, worker and delivery accept `ReviewApiLike`.

- [ ] **Step 1: Write the failing config and proxy tests**

Add to `packages/dsh/test/config.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { configProblem, normalizeConfig } from '../src/config.js';

describe('embedded config', () => {
  it('does not require an external daemon token in embedded mode', () => {
    const config = normalizeConfig({ embedded: true, worker: false });
    expect(config.embedded).toBe(true);
    expect(config.uiBase).toBe('/code-review');
    expect(configProblem(config)).toBeUndefined();
  });

  it('still requires a token in external mode', () => {
    const config = normalizeConfig({ embedded: false, token: '' });
    expect(configProblem(config)).toBe('token must be at least 32 characters');
  });
});
```

Add to `packages/dsh/test/proxy.test.ts`:

```ts
it('waits for an embedded endpoint and exposes uiBase in /info', async () => {
  let release!: (value: { daemonUrl: string; token: string }) => void;
  const endpoint = new Promise<{ daemonUrl: string; token: string }>((resolve) => {
    release = resolve;
  });
  const proxy = createProxyHandler({
    config: normalizeConfig({ embedded: true }),
    prefix: '/code-review/api',
    endpoint,
    uiBase: '/code-review',
  });
  const response = createResponse();
  const request = proxy(
    { headers: {}, method: 'GET', url: '/code-review/api/info' } as never,
    response.res,
  );
  release({ daemonUrl: 'http://127.0.0.1:41234', token: 'x'.repeat(32) });
  await request;
  expect(response.body()).toMatchObject({ daemonUrl: 'http://127.0.0.1:41234', uiBase: '/code-review' });
});
```

Use the existing `createResponse` helper pattern from `host.test.ts`; add a `body` capture if needed.

- [ ] **Step 2: Run them and verify they fail**

Run: `pnpm vitest run packages/dsh/test/config.test.ts packages/dsh/test/proxy.test.ts`
Expected: FAIL because `embedded`, `uiBase`, `prefix`, `endpoint` do not exist.

- [ ] **Step 3: Implement config, proxy and host wiring**

`config.ts`:

```ts
export interface ReviewConfig {
  // existing fields...
  embedded: boolean;
  uiBase: string;
  storeDir?: string;
}
```

Add to `DEFAULT_CONFIG`:

```ts
embedded: false,
uiBase: '/code-review',
```

Normalize with:

```ts
embedded: input.embedded === true,
uiBase: stringValue(input.uiBase, '/code-review').replace(/\/+$/, ''),
...(typeof input.storeDir === 'string' && input.storeDir.trim() !== ''
  ? { storeDir: input.storeDir.trim() }
  : {}),
```

`configProblem` returns `undefined` immediately for `config.embedded`, and keeps the existing daemon URL/token checks for external mode.

`proxy.ts`:

```ts
export interface ProxyEndpoint {
  daemonUrl: string;
  token: string;
}

export interface ProxyDeps {
  config: ReviewConfig;
  fetch?: typeof fetch;
  prefix?: string;
  endpoint?: Promise<ProxyEndpoint>;
  uiBase?: string;
}
```

Use `deps.prefix ?? '/api/code-review'` and `const endpoint = deps.endpoint === undefined ? deps.config : await deps.endpoint`. Use `endpoint.daemonUrl` and `endpoint.token` for fetches; add `...(deps.uiBase === undefined ? {} : { uiBase: deps.uiBase })` to the `/info` body. Map endpoint rejection to `503` JSON `{ error: { code: 'daemon-unavailable', message: 'review daemon is not ready' } }`.

`host.ts`:

```ts
const embedded = config.embedded
  ? startEmbeddedReview(config, {
      ...(config.storeDir === undefined ? {} : { storeDir: config.storeDir }),
    })
  : undefined;
const endpoint = embedded?.ready.then((daemon) => ({
  daemonUrl: daemon.url,
  token: embedded.token,
}));
const api = embedded?.api ?? new ReviewApi(config);
const proxy = createProxyHandler({
  config,
  ...(endpoint === undefined ? {} : { endpoint }),
  ...(embedded === undefined ? {} : { uiBase: config.uiBase }),
});
```

Register the existing `/api/code-review` route with this proxy. Add a cleanup effect that calls `embedded.close()` and logs a warning if it rejects. Do not close the daemon from `startLoops` directly; the effect owns lifetime.

Change `createReviewTools`, `createReviewCommand`, `startLoops`, `WorkerDeps`, and `DeliveryDeps` to accept `ReviewApiLike` instead of `ReviewApi`. `ReviewApi` satisfies the interface unchanged.

`cordis.patch.yml`:

```yaml
config:
  embedded: true
  uiBase: /code-review
  worker: true
  reviewerBackend: worker
```

Keep `daemonUrl` and `token` keys for external overrides; document that embedded mode ignores them.

- [ ] **Step 4: Verify host and proxy behavior**

Add a host test that applies `{ embedded: true, storeDir: temp, worker: false }`, captures the `/api/code-review` route, waits for the first request to finish, and expects a successful `GET /api/code-review/health`. Make `createContext` retain effect disposers and invoke them in reverse order at the end so the daemon is closed during the test.

Run: `pnpm vitest run packages/dsh/test/config.test.ts packages/dsh/test/proxy.test.ts packages/dsh/test/host.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dsh/src/config.ts packages/dsh/src/proxy.ts packages/dsh/src/host.ts \
  packages/dsh/src/tools.ts packages/dsh/src/command.ts packages/dsh/src/worker.ts \
  packages/dsh/src/delivery.ts packages/dsh/cordis.patch.yml \
  packages/dsh/test/config.test.ts packages/dsh/test/proxy.test.ts packages/dsh/test/host.test.ts
git commit -m "feat(dsh): run an embedded daemon from the host plugin"
```

**Verify:** `pnpm vitest run packages/dsh/test/config.test.ts packages/dsh/test/proxy.test.ts packages/dsh/test/host.test.ts && pnpm typecheck`
**Done:** Embedded mode starts the daemon, the existing panel proxy reaches it, `/info` exposes `uiBase`, and external mode retains token validation.

## Task 4: SPA base path and embedded auth mode

**Files:**
- Create: `packages/web/src/base.ts`
- Create: `packages/web/src/vite-env.d.ts`
- Modify: `packages/web/src/router.tsx`
- Modify: `packages/web/src/App.tsx`
- Modify: `packages/web/test/router.test.ts`
- Create: `packages/web/test/base.test.ts`

**Interfaces:**
- `normalizeBase(value: string): string` returns `''` for `/` and `/code-review` for `/code-review/`.
- `withBase(path: string, base?: string): string` prefixes a route exactly once.
- `parseRoute(location: string, base?: string): Route` strips the base before matching.
- `resolveAuthMode(value: string | undefined): 'token' | 'dsh'`.
- `BASE_PATH` and `AUTH_MODE` are build-time constants in `base.ts`.

- [ ] **Step 1: Write the failing route/base tests**

```ts
// packages/web/test/base.test.ts
import { describe, expect, it } from 'vitest';
import { normalizeBase, resolveAuthMode, withBase } from '../src/base.js';
import { parseRoute } from '../src/router.js';

describe('SPA base path', () => {
  it('normalizes the Vite base', () => {
    expect(normalizeBase('/')).toBe('');
    expect(normalizeBase('/code-review/')).toBe('/code-review');
    expect(normalizeBase('/code-review')).toBe('/code-review');
  });

  it('prefixes links exactly once', () => {
    expect(withBase('/new', '/code-review')).toBe('/code-review/new');
    expect(withBase('/code-review/new', '/code-review')).toBe('/code-review/new');
  });

  it('parses routes below the base', () => {
    expect(parseRoute('/code-review/review/rev_1?round=2', '/code-review')).toEqual({
      name: 'review',
      id: 'rev_1',
    });
    expect(parseRoute('/code-review/', '/code-review')).toEqual({ name: 'list' });
    expect(parseRoute('/review/rev_1', '/')).toEqual({ name: 'review', id: 'rev_1' });
  });

  it('recognizes the embedded auth mode', () => {
    expect(resolveAuthMode('dsh')).toBe('dsh');
    expect(resolveAuthMode('token')).toBe('token');
    expect(resolveAuthMode(undefined)).toBe('token');
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run packages/web/test/base.test.ts`
Expected: FAIL because `base.ts` does not exist.

- [ ] **Step 3: Implement base-aware routing and auth mode**

`packages/web/src/base.ts`:

```ts
export function normalizeBase(value: string): string {
  const trimmed = value.trim();
  if (trimmed === '' || trimmed === '/') return '';
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`;
}

export function withBase(path: string, base = BASE_PATH): string {
  const normalized = normalizeBase(base);
  if (normalized === '') return path;
  if (path === normalized || path.startsWith(`${normalized}/`)) return path;
  return `${normalized}${path.startsWith('/') ? path : `/${path}`}`;
}

export function resolveAuthMode(value: string | undefined): 'token' | 'dsh' {
  return value === 'dsh' ? 'dsh' : 'token';
}

export const BASE_PATH = normalizeBase(import.meta.env.BASE_URL ?? '/');
export const AUTH_MODE = resolveAuthMode(import.meta.env.VITE_AUTH_MODE);
```

Add `packages/web/src/vite-env.d.ts` with `/// <reference types="vite/client" />`.

`router.tsx`:

- add `import { BASE_PATH, withBase } from './base.js';`
- change `snapshot` to keep the raw pathname;
- change `navigate` to call `window.history.pushState({}, '', withBase(to))` and the replace equivalent;
- change `Link` to use `href={withBase(to)}`;
- change `parseRoute(location, base = BASE_PATH)` to strip `normalizeBase(base)` before the existing matching. If `pathname === base`, treat it as `/`; if it starts with `${base}/`, slice the base; otherwise leave it untouched for malformed/absolute cases.

`App.tsx`:

```ts
const activeClient = useMemo(
  () =>
    client ??
    createApiClient({
      baseUrl: BASE_PATH,
      ...(AUTH_MODE === 'token'
        ? {
            onUnauthorized: (next) =>
              navigate(`/auth?next=${encodeURIComponent(next)}`, { replace: true }),
          }
        : {}),
    }),
  [client],
);
```

In DSH mode, render `AuthPage` only when `AUTH_MODE === 'token'`; add an effect that replaces `/auth` with `/` when `AUTH_MODE === 'dsh'`. This makes 401s show page errors instead of sending the user to a token form.

- [ ] **Step 4: Verify both builds**

Run: `pnpm vitest run packages/web/test/base.test.ts packages/web/test/router.test.ts`
Expected: PASS.

Run: `pnpm build`
Expected: exit 0.

Run:

```bash
grep -q '/code-review/assets/' packages/dsh/web/index.html
! grep -q '/code-review/assets/' packages/web/dist/index.html
```

Expected: both checks pass.

- [ ] **Step 5: Commit**

```bash
git add packages/web/src/base.ts packages/web/src/vite-env.d.ts \
  packages/web/src/router.tsx packages/web/src/App.tsx \
  packages/web/test/base.test.ts packages/web/test/router.test.ts
git commit -m "feat(web): support /code-review base path and DSH auth mode"
```

**Verify:** `pnpm vitest run packages/web/test/base.test.ts packages/web/test/router.test.ts && pnpm build`
**Done:** Links and routes work under `/code-review/`; the fat build uses DSH auth; the standalone build keeps token auth and root URLs.

## Task 5: Serve the SPA through DSH and fix the panel link

**Files:**
- Modify: `packages/server/src/daemon/static.ts`
- Modify: `packages/server/test/daemon/static.test.ts`
- Create: `packages/dsh/src/ui.ts`
- Create: `packages/dsh/test/ui.test.ts`
- Modify: `packages/dsh/src/host.ts`
- Modify: `packages/dsh/client.js`
- Modify: `packages/dsh/test/client.test.ts`
- Modify: `packages/dsh/test/host.test.ts`

**Interfaces:**
- `serveStatic(pathname, res, webDir, basePath?)` strips `basePath` before serving; returns `false` outside the base/API.
- `createUiHandler({ webDir, proxy, basePath? })` returns an HTTP handler for `/code-review/*`.
- The host registers `/code-review` as a prefix route behind `withConnectionGate`.
- `/code-review/api/*` goes to the daemon proxy; `/code-review/` and deep links serve `index.html`; `/code-review/assets/*` serves files.

- [ ] **Step 1: Write the failing static/UI tests**

Add to `packages/server/test/daemon/static.test.ts` a direct server test:

```ts
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { serveStatic } from '../../src/daemon/static.js';

it('serves the same SPA below /code-review', async () => {
  const server = createServer(async (req, res) => {
    if (!(await serveStatic(req.url ?? '/', res, fx.webDir, '/code-review'))) {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(
    async () => new Promise<void>((resolve) => server.close(() => resolve())),
  );
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const deep = await fetch(`${base}/code-review/review/rev_1`);
  expect(deep.status).toBe(200);
  expect(await deep.text()).toContain('reviewd SPA');

  const asset = await fetch(`${base}/code-review/assets/app-abc123.js`);
  expect(asset.status).toBe(200);
  expect(asset.headers.get('content-type')).toContain('text/javascript');

  const traversal = await fetch(`${base}/code-review/assets/..%2Findex.html`);
  expect(traversal.status).toBe(404);
});
```

Add `packages/dsh/test/ui.test.ts`:

```ts
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUiHandler } from '../src/ui.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  await Promise.all(cleanups.splice(0).reverse().map((fn) => fn()));
});

it('dispatches API paths to the proxy and static paths to the SPA', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cr-ui-'));
  const webDir = join(root, 'web');
  await mkdir(join(webDir, 'assets'), { recursive: true });
  await writeFile(join(webDir, 'index.html'), '<div id="root">full SPA</div>');

  const proxy = vi.fn(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end('{"ok":true}');
  });
  const handler = createUiHandler({ webDir, proxy, basePath: '/code-review' });
  const server = createServer((req, res) => {
    void handler(req, res).catch(() => res.writeHead(500).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  cleanups.push(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  const api = await fetch(`${base}/code-review/api/health`);
  expect(api.status).toBe(200);
  expect(await api.json()).toEqual({ ok: true });

  const page = await fetch(`${base}/code-review/review/rev_1`);
  expect(page.status).toBe(200);
  expect(await page.text()).toContain('full SPA');
  expect(proxy).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run them and verify they fail**

Run: `pnpm vitest run packages/server/test/daemon/static.test.ts packages/dsh/test/ui.test.ts`
Expected: FAIL because `serveStatic` has no base argument and `ui.ts` does not exist.

- [ ] **Step 3: Implement base static serving and the UI dispatcher**

At the top of `serveStatic`:

```ts
const base = (basePath ?? '').replace(/\/+$/, '');
if (base !== '') {
  if (pathname === base) pathname = '/';
  else if (pathname.startsWith(`${base}/`)) pathname = pathname.slice(base.length);
  else return false;
}
```

Keep the existing `/api/` guard, asset traversal guard, SPA routes and security headers unchanged.

`packages/dsh/src/ui.ts`:

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { serveStatic } from '../../server/src/daemon/static.js';

export interface UiDeps {
  webDir: string | null;
  proxy: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
  basePath?: string;
}

export function createUiHandler(deps: UiDeps) {
  const base = deps.basePath ?? '/code-review';
  const api = `${base}/api`;
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    const url = new URL(req.url ?? '/', 'http://local');
    if (url.pathname === base) {
      res.writeHead(308, { location: `${base}/` }).end();
      return;
    }
    if (url.pathname === api || url.pathname.startsWith(`${api}/`)) {
      await deps.proxy(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405).end();
      return;
    }
    if (await serveStatic(url.pathname, res, deps.webDir, base)) return;
    res.writeHead(404).end();
  };
}

export function resolveUiDir(): string | null {
  const candidates = [
    fileURLToPath(new URL('./web', import.meta.url)),
    fileURLToPath(new URL('../web', import.meta.url)),
  ];
  return candidates.find((dir) => existsSync(join(dir, 'index.html'))) ?? null;
}
```

In `host.ts`, when `config.embedded` is true:

```ts
const uiProxy = createProxyHandler({
  config,
  prefix: '/code-review/api',
  ...(endpoint === undefined ? {} : { endpoint }),
  uiBase: config.uiBase,
});
const ui = createUiHandler({ webDir: resolveUiDir(), proxy: uiProxy, basePath: config.uiBase });
ctx.effect(() =>
  ctx.webServer.register({
    kind: 'prefix',
    path: config.uiBase,
    handler: withConnectionGate(ctx.connection, ui),
  }),
);
```

Do not register the UI route in external mode; external UI remains the daemon’s own origin and token login.

`client.js`: use `info.uiBase` first, then `info.publicUrl`, then `info.daemonUrl` when computing `uiBase`. Add to `client.test.ts`:

```ts
it('uses the host UI base for the Open link', () => {
  expect(client).toContain('info.uiBase');
});
```

Add a host test that captures both routes, calls the `/code-review` handler with unauthorized headers and expects 401, then authorized headers and expects a static 200. Use a temporary web directory rather than the built package in unit tests.

- [ ] **Step 4: Verify**

Run: `pnpm vitest run packages/server/test/daemon/static.test.ts packages/dsh/test/ui.test.ts packages/dsh/test/host.test.ts packages/dsh/test/client.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/server/src/daemon/static.ts packages/server/test/daemon/static.test.ts \
  packages/dsh/src/ui.ts packages/dsh/test/ui.test.ts packages/dsh/src/host.ts \
  packages/dsh/client.js packages/dsh/test/client.test.ts packages/dsh/test/host.test.ts
git commit -m "feat(dsh): serve full review UI under /code-review"
```

**Verify:** `pnpm vitest run packages/server/test/daemon/static.test.ts packages/dsh/test/ui.test.ts packages/dsh/test/host.test.ts packages/dsh/test/client.test.ts && pnpm typecheck`
**Done:** The full SPA is available at `/code-review/`, deep links refresh, assets are correct, API calls are proxied, and unauthenticated requests are rejected by the DSH gate.

## Task 6: Readiness, worker/delivery lifecycle and failure handling

**Files:**
- Modify: `packages/dsh/src/host.ts`
- Modify: `packages/dsh/test/host.test.ts`
- Modify: `packages/dsh/test/embedded.test.ts`
- Modify: `packages/dsh/test/worker.test.ts`

**Interfaces:**
- `startLoops(ctx, config, api, ready?)` starts worker/delivery only after `ready` resolves; aborts on dispose.
- Embedded startup failure leaves routes available but returning `503 daemon-unavailable`; it must not crash `apply`.
- Disposal aborts loops before closing the daemon.

- [ ] **Step 1: Write the failing readiness test**

Add a unit test around an exported readiness helper or around `startEmbeddedReview` with an injected `startDaemon` that rejects:

```ts
it('does not poll before the embedded daemon is ready', async () => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const api = {
    get: vi.fn(async () => ({})),
    post: vi.fn(async () => ({})),
  };
  const stop = startReviewLoops(
    {
      get: (key: string) => (key === 'agents' ? { create: vi.fn() } : undefined),
      logger: { warn: vi.fn() },
    } as never,
    normalizeConfig({ embedded: true, worker: true }),
    api,
    ready,
  );

  expect(api.post).not.toHaveBeenCalled();
  release();
  await vi.waitFor(() => expect(api.post).toHaveBeenCalled());
  stop();
});
```

Export the helper from `host.ts` as `startReviewLoops` so the test can exercise ordering without a real model.

- [ ] **Step 2: Run it and verify it fails**

Run: `pnpm vitest run packages/dsh/test/host.test.ts`
Expected: FAIL because loops start immediately.

- [ ] **Step 3: Implement the readiness wrapper**

Refactor `startLoops` so it creates the `AbortController` once and takes an optional `ready` promise:

```ts
export function startReviewLoops(
  ctx: HostContext,
  config: ReviewConfig,
  api: ReviewApiLike,
  ready?: Promise<unknown>,
): () => void {
  const controller = new AbortController();
  const start = (): void => {
    // existing worker/delivery body; use controller.signal
  };
  if (ready === undefined) start();
  else {
    void ready.then(start).catch((error: unknown) => {
      ctx.logger?.warn?.(
        `code-review: embedded daemon failed: ${
          error instanceof Error ? error.message : 'unknown'
        }`,
      );
    });
  }
  return () => controller.abort();
}
```

In `apply`, pass `embedded?.ready` for embedded mode and `undefined` for external mode. Keep the API deferred so tools and the panel can wait for readiness independently.

In `startEmbeddedReview`, ensure `close()` is idempotent and never rejects after a failed start. Add a test with an injected `startDaemon` that rejects; assert `embedded.ready` rejects, the host logs a warning, and the proxy returns 503 rather than throwing.

- [ ] **Step 4: Verify lifecycle tests**

Run: `pnpm vitest run packages/dsh/test/embedded.test.ts packages/dsh/test/host.test.ts packages/dsh/test/worker.test.ts`
Expected: PASS.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/dsh/src/host.ts packages/dsh/test/embedded.test.ts \
  packages/dsh/test/host.test.ts packages/dsh/test/worker.test.ts
git commit -m "fix(dsh): start worker after embedded daemon readiness"
```

**Verify:** `pnpm vitest run packages/dsh/test/embedded.test.ts packages/dsh/test/host.test.ts packages/dsh/test/worker.test.ts && pnpm typecheck`
**Done:** Loops never poll before readiness; startup failure is logged and yields a typed 503; disposal aborts loops and closes the daemon once.

## Task 7: Package smoke, install and live fat-package verification

**Files:**
- Create: `scripts/verify-fat-package.mjs`
- Modify: `package.json`

**Interfaces:**
- `pnpm fat:verify` builds, packs and checks the tarball.
- The tarball contains `index.js`, `client.js`, `cordis.patch.yml`, `web/index.html`, `web/assets/*`, `LICENSE`, `README.md`; it excludes `src`, tests, maps and `node_modules`.

- [ ] **Step 1: Write the failing tarball check**

Create `scripts/verify-fat-package.mjs` using `node:assert/strict`, `node:child_process` and `node:fs/promises`:

```js
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

execFileSync('pnpm', ['build'], { stdio: 'inherit' });
const out = execFileSync(
  'npm',
  ['pack', '--json', '--pack-destination', await mkdtemp(join(tmpdir(), 'cr-pack-'))],
  { cwd: 'packages/dsh', encoding: 'utf8' },
);
const info = JSON.parse(out).at(-1);
const files = new Set(info.files.map((file) => file.path));
assert.ok(files.has('index.js'));
assert.ok(files.has('client.js'));
assert.ok(files.has('web/index.html'));
assert.ok([...files].some((file) => file.startsWith('web/assets/')));
assert.ok(![...files].some((file) => file.startsWith('src/')));
assert.ok(![...files].some((file) => file.endsWith('.map')));
const pkg = JSON.parse(await readFile('packages/dsh/package.json', 'utf8'));
assert.notEqual(pkg.private, true);
assert.equal(pkg.license, 'MIT');
console.log(info.filename);
```

The command must run from the repository root and use a temporary pack destination. Do not publish.

- [ ] **Step 2: Run it and verify it fails**

Run: `node scripts/verify-fat-package.mjs`
Expected: FAIL until the fat package build and manifest include `web`.

- [ ] **Step 3: Add the script and run the install smoke**

Add to root `package.json`:

```json
"fat:verify": "node scripts/verify-fat-package.mjs"
```

Run: `pnpm fat:verify`
Expected: PASS and print the tarball path.

Then install the packed tarball into a disposable DSH profile:

```bash
TARBALL=$(ls -t /tmp/cr-pack-*/*.tgz | head -1)
dsh plugin --profile fat-test add "$TARBALL"
```

Launch DSH Web with that profile on a non-3099 port. Open the sidebar panel; verify:

- the panel loads without a token form;
- Create review works;
- Open opens `/code-review/review/<id>` in a new tab;
- the full SPA loads its assets, list, detail, diff, comments, findings, and SSE;
- reloading a deep link keeps the route;
- stopping the plugin closes the daemon port;
- `embedded: false` with an external `daemonUrl` still uses the existing token flow.

Record the profile, command, URL, and screenshot paths in the verification note. If a live DSH profile cannot be used, stop and report the exact blocker; do not claim live success from unit tests.

- [ ] **Step 4: Run the full verification matrix**

Run:

```bash
pnpm verify
pnpm fat:verify
```

Expected: both exit 0.

Run the existing standalone e2e suite:

```bash
pnpm test:e2e
```

Expected: PASS; external daemon behavior is unchanged.

- [ ] **Step 5: Commit**

```bash
git add scripts/verify-fat-package.mjs package.json
git commit -m "test(dsh): verify the packed fat bundle"
```

**Verify:** `pnpm verify && pnpm fat:verify && pnpm test:e2e`
**Done:** A packed tarball contains the full runtime and passes a disposable DSH install plus the full UI workflow; external mode still passes.

## Task 8: Release metadata and dsh.so submission pack

**Files:**
- Modify: `packages/dsh/package.json`
- Modify: `packages/dsh/README.md`
- Modify: `docs/dsh.md`
- Modify: `CHANGELOG.md`
- Verify: `README.md` root, `LICENSE`, `packages/dsh/LICENSE`

**Interfaces:**
- The public package has a recognizable SPDX license, a root README with install instructions, a valid `dsh` manifest, and no private flag.
- The package id is the last segment of the npm package name; current target is `dsh`.
- dsh.so receives an npm package URL, not a tarball.

- [ ] **Step 1: Write the release checklist test/check**

Use the existing `packages/dsh/test/package.test.ts`; extend it to assert:

```ts
expect(pkg.license).toBe('MIT');
expect(pkg.repository?.url).toContain('github.com');
expect(pkg.files).toContain('README.md');
expect(pkg.files).toContain('LICENSE');
```

Also assert that `README.md` contains the exact install command:

```ts
expect(readme).toContain('dsh plugin --profile web add @dsh-code-review/dsh');
```

Use the actual chosen package name once release metadata is final.

- [ ] **Step 2: Update docs and metadata**

`packages/dsh/README.md` must explain:

- one-package embedded mode;
- `dsh plugin --profile web add @dsh-code-review/dsh` (or the final published name);
- first-run store path and `storeDir` override;
- `embedded: false` external mode and its token requirement;
- DSH session auth for the embedded UI; no token in the browser;
- `worker: true` behavior and how to disable it;
- security notes for the loopback daemon and `/code-review` route;
- upgrade/uninstall and data retention.

`docs/dsh.md` must replace the “external reviewd owns the full UI” description with the two modes: embedded (default) and external. Update the architecture diagram text accordingly. `CHANGELOG.md` gets a “Fat DSH package” entry with the new base path and auth behavior.

Set the real repository/homepage/bugs URLs before publishing; do not leave the placeholder `dsh-code-review/dsh-code-review` if it is not the final public repo.

- [ ] **Step 3: Run the registry checks locally**

Run:

```bash
pnpm verify
pnpm fat:verify
```

Then inspect the tarball contents and the package metadata. Confirm:

- `package.json` has `dsh.bundle.patch`, `dsh.client`, `license`, `README`, `files`;
- `README` is at package root;
- no secrets, tokens, `.env`, store data, test fixtures or source maps;
- server entry is at the package root or included source, not hidden only under `dist/`;
- `dsh.so` scanner warnings for `child_process`, filesystem and network are documented as expected; no critical secret/exfiltration/destructive finding exists.

Submit the public npm package URL (or the public GitHub URL with a root `dsh` package) at `https://www.dsh.so/submit/`. Do not submit a local tarball or ZIP. Record the submission URL and status; the listing may remain “Declared/unverified” until independently tested.

- [ ] **Step 4: Commit and tag**

```bash
git add packages/dsh/package.json packages/dsh/README.md docs/dsh.md CHANGELOG.md README.md
git commit -m "docs(dsh): document and prepare the fat package release"
```

Only after human approval, publish the npm package and create the release tag. Do not publish from this plan automatically.

**Verify:** `pnpm verify && pnpm fat:verify`; package metadata contains the DSH signal, README, SPDX license, valid id and no critical scan finding.
**Done:** The package is ready for a human-controlled npm publish and dsh.so submission; the docs describe embedded vs external behavior accurately.

## Execution Waves

| Wave | Tasks | Reason |
| --- | --- | --- |
| 1 | Task 1, Task 2 | Packaging/build and daemon controller are independent |
| 2 | Task 3, Task 4 | Host embedded mode and SPA base can proceed in parallel |
| 3 | Task 5, Task 6 | UI route depends on 3/4; lifecycle depends on 3 |
| 4 | Task 7 | Package smoke needs all runtime pieces |
| 5 | Task 8 | Release metadata and submission last |

Between waves run `pnpm test` and `pnpm typecheck`; before the final wave run `pnpm verify`.

## Verification Matrix

| Gate | Command | Expected |
| --- | --- | --- |
| Build | `pnpm build` | exit 0; fat web assets exist |
| Format | `pnpm format` | exit 0 |
| Lint | `pnpm lint` | exit 0 |
| Typecheck | `pnpm typecheck` | exit 0 |
| Unit/integration | `pnpm test` | exit 0 |
| Final build | `pnpm build` | exit 0 |
| Fat tarball | `pnpm fat:verify` | exit 0 from repo root |
| Standalone e2e | `pnpm test:e2e` | exit 0 |
| DSH live | disposable profile install + panel/full UI workflow | screenshots and notes recorded |

## Risks and Mitigations

- **Base path regressions:** centralize base handling in `base.ts`; test deep links, assets, `Link`, `navigate`, and auth redirects.
- **Async host activation:** tools and proxy use a deferred API; loops wait for `ready`; no request uses an empty daemon URL.
- **Token exposure:** browser only sees DSH cookies; host proxy injects bearer; tests assert no token in `/info`, HTML, or client code.
- **Store collisions:** loopback port `0`, configurable `storeDir`, idempotent close; test restart/dispose.
- **DSH auth mismatch:** keep `/api/code-review` and `/code-review` behind the same `requestRejection`; test 401/403 before any proxy/static work.
- **Scanner warnings:** server code adds expected `child_process`/fs/network warnings; no critical patterns; document this in the submission notes.
- **Packaging drift:** `prepack` rebuilds; `fat:verify` checks the tarball; never rely on the working tree's untracked assets.

## Self-Review Checklist

- [ ] Every requirement in the approved design maps to a task: one package, embedded daemon, same-origin UI, DSH auth, new tab, external mode, tests, packaging, submission.
- [ ] No placeholders such as “handle errors” without a concrete behavior; failure paths specify 503/401/logging/cleanup.
- [ ] Interfaces are consistent: `ReviewApiLike`, `DeferredReviewApi`, `EmbeddedReview`, `serveStatic(..., basePath)`, `createUiHandler`, `BASE_PATH`, `AUTH_MODE`.
- [ ] No task requires an undeclared file or function from a later task.
- [ ] The plan does not implement now; it stops at the execution handoff.
