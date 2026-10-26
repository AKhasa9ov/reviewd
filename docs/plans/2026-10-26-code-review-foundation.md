# Code Review Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the standalone `dsh-code-review` repository and ship a tested `review diff` engine that resolves `range`/`worktree`/`commit` scopes and emits a deterministic JSON snapshot.

**Architecture:** A pnpm workspace with a dependency-free `@dsh-code-review/core` package (git runner, scope resolution, unified-diff parser, snapshot builder) and a thin `@dsh-code-review/server` CLI. All git access goes through one safe `runGit` function; every file path is validated against the repository root; the snapshot is a pure, sorted data structure so later rounds and anchors can diff it.

**Tech Stack:** Node 22.23.2, TypeScript 5.9.3 strict, pnpm 11.22.0, Vitest 5.0.5, Vite 8.3.5, esbuild 0.28.2, ESLint 10.13.0, typescript-eslint 8.72.0, Prettier 3.9.10, `@types/node` 22.20.5. No runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-10-26-code-review-control-plane-design.md` (copy to the new repo as `docs/design.md`).

**Plan set:** This is Plan 1 of 6. It implements roadmap changes C1–C2. Later plans: (2) event store, review service, daemon, CLI lifecycle; (3) reviewer protocol, rounds, anchors, delivery; (4) standalone UI + Playwright; (5) DSH bundle, worker, delivery bridge, panel; (6) Docker, hardening, OSS release. Do not implement later-plan features here.

## Global Constraints

- Repository path: `~/projects/dsh-code-review`; default branch `main`; MIT license.
- Node `>=22`; pnpm `11.22.0`; ESM only (`"type": "module"`); TypeScript `strict: true`; no `any` (use `unknown` + narrowing); no runtime dependencies.
- All imports inside `src` use the `.js` extension (NodeNext resolution).
- Git is invoked with `spawn('git', args, { shell: false })`; never a shell string.
- Diff/limits: 2 MiB diff cap, 500 files, 20 000 lines per file, rename detection 50%, `-U3`.
- Git environment for every call: `GIT_TERMINAL_PROMPT=0`, `GIT_OPTIONAL_LOCKS=0`, `LC_ALL=C`; every diff-producing command adds `--no-color --no-ext-diff --no-textconv` and runs non-interactively (no pager).
- Sort snapshot files by `path` (byte-wise) and emit stable JSON; no absolute paths inside file entries (only `scope.repoRoot`).
- Every task ends with `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test` and one conventional commit.
- No secrets, no network at runtime, no mutation of the inspected repository (read-only git commands; no `git add`, `checkout`, `apply` in this plan).
- Test everything through temporary repositories created under `os.tmpdir()`; never depend on the current workspace repository.

---

## File Structure

```
dsh-code-review/
  .github/workflows/ci.yml
  .gitignore
  .prettierrc.json
  .prettierignore
  LICENSE
  README.md
  eslint.config.js
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  tsconfig.json
  vitest.config.ts
  scripts/build.mjs
  docs/design.md
  packages/core/
    package.json
    src/index.ts
    src/types.ts
    src/paths.ts
    src/git/run.ts
    src/git/repo.ts
    src/git/scope.ts
    src/git/content.ts
    src/diff/parse.ts
    src/diff/glob.ts
    src/diff/snapshot.ts
    test/helpers/repo.ts
    test/smoke.test.ts
    test/parse.test.ts
    test/parse-edge.test.ts
    test/git.test.ts
    test/scope.test.ts
    test/snapshot.test.ts
    test/snapshot-untracked.test.ts
    test/snapshot-safety.test.ts
  packages/server/
    package.json
    src/cli.ts
    src/cli/run.ts
    test/cli.test.ts
```

Responsibilities: `git/*` only talks to git and returns data; `diff/parse.ts` is a pure string-to-structure parser; `diff/snapshot.ts` composes scope + git + parser + content + limits; `paths.ts` is the only place that joins untrusted paths; `cli/run.ts` is I/O-injected so tests do not spawn the built binary.

---

## SDD Task Contract

Each task is one commit and one atomic review unit. The detailed steps below are authoritative;
this table is the gate contract for the SDD ledger.

```xml
<tasks>
  <task type="auto">
    <name>Bootstrap repository and toolchain</name>
    <files>root configs, packages/core, packages/server, CI, LICENSE, README, docs/design.md</files>
    <verify>pnpm install &amp;&amp; pnpm verify &amp;&amp; node packages/server/dist/cli.js</verify>
    <evidence>cmd:pnpm verify; path:packages/server/dist/cli.js</evidence>
    <done>Workspace installs; all gates pass; built CLI prints review 0.1.0; initial commit exists.</done>
  </task>
  <task type="auto">
    <name>Parse unified diffs</name>
    <files>packages/core/src/types.ts, packages/core/src/diff/parse.ts, packages/core/src/index.ts, packages/core/test/parse.test.ts</files>
    <verify>pnpm test -- packages/core/test/parse.test.ts &amp;&amp; pnpm typecheck</verify>
    <evidence>cmd:pnpm test -- packages/core/test/parse.test.ts</evidence>
    <done>Simple modified file parses into typed hunks with correct line numbers and counts.</done>
  </task>
  <task type="auto">
    <name>Cover parser edge cases</name>
    <files>packages/core/test/parse-edge.test.ts, packages/core/src/diff/parse.ts</files>
    <verify>pnpm test -- packages/core/test/parse-edge.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/parse-edge.test.ts</evidence>
    <done>Added, deleted, renamed, binary, mode-only, spaces and no-newline diffs pass.</done>
  </task>
  <task type="auto">
    <name>Safe git runner and repository root</name>
    <files>packages/core/src/git/run.ts, packages/core/src/git/repo.ts, packages/core/test/helpers/repo.ts, packages/core/test/git.test.ts</files>
    <verify>pnpm test -- packages/core/test/git.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/git.test.ts</evidence>
    <done>Git runs without a shell, failures are typed, and the root resolves from a subdirectory.</done>
  </task>
  <task type="auto">
    <name>Resolve range, worktree and commit scopes</name>
    <files>packages/core/src/git/scope.ts, packages/core/test/scope.test.ts, packages/core/src/index.ts</files>
    <verify>pnpm test -- packages/core/test/scope.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/scope.test.ts</evidence>
    <done>Merge-base, parent commit, root commit and worktree digest are deterministic.</done>
  </task>
  <task type="auto">
    <name>Build text snapshots with content</name>
    <files>packages/core/src/paths.ts, packages/core/src/git/content.ts, packages/core/src/diff/glob.ts, packages/core/src/diff/snapshot.ts, packages/core/test/snapshot.test.ts</files>
    <verify>pnpm test -- packages/core/test/snapshot.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/snapshot.test.ts</evidence>
    <done>Range and worktree snapshots include stats, hunks, hashes, content and limits.</done>
  </task>
  <task type="auto">
    <name>Untracked files, ignores and limits</name>
    <files>packages/core/src/diff/glob.ts, packages/core/src/diff/snapshot.ts, packages/core/src/git/content.ts, packages/core/test/snapshot-untracked.test.ts</files>
    <verify>pnpm test -- packages/core/test/snapshot-untracked.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/snapshot-untracked.test.ts</evidence>
    <done>Untracked text, binary and oversized files behave correctly and ignore globs apply.</done>
  </task>
  <task type="auto">
    <name>Path safety, symlinks and submodules</name>
    <files>packages/core/test/snapshot-safety.test.ts, packages/core/src/diff/snapshot.ts, packages/core/src/paths.ts</files>
    <verify>pnpm test -- packages/core/test/snapshot-safety.test.ts</verify>
    <evidence>cmd:pnpm test -- packages/core/test/snapshot-safety.test.ts</evidence>
    <done>Traversal is rejected, symlinks are not followed, submodules are marked and content-free.</done>
  </task>
  <task type="auto">
    <name>Expose review diff CLI</name>
    <files>packages/server/src/cli/run.ts, packages/server/src/cli.ts, packages/server/test/cli.test.ts</files>
    <verify>pnpm test -- packages/server/test/cli.test.ts &amp;&amp; pnpm build &amp;&amp; node packages/server/dist/cli.js version</verify>
    <evidence>cmd:pnpm test -- packages/server/test/cli.test.ts; path:packages/server/dist/cli.js</evidence>
    <done>JSON and human snapshots print; help/version work; invalid input exits 5.</done>
  </task>
  <task type="auto">
    <name>Document and verify the foundation</name>
    <files>README.md, docs/plans/2026-10-26-code-review-foundation.md, .github/workflows/ci.yml</files>
    <verify>pnpm verify &amp;&amp; real-repository smoke test from Task 10</verify>
    <evidence>cmd:pnpm verify; path:README.md; path:docs/plans/2026-10-26-code-review-foundation.md</evidence>
    <done>README documents the contract and limits; full verification and smoke tests pass; tree is clean.</done>
  </task>
</tasks>
```

---

### Task 1: Bootstrap the repository and verification gates

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.prettierrc.json`, `.prettierignore`, `.gitignore`, `LICENSE`, `README.md`, `scripts/build.mjs`
- Create: `packages/core/package.json`, `packages/core/src/index.ts`, `packages/core/test/smoke.test.ts`
- Create: `packages/server/package.json`, `packages/server/src/cli.ts`
- Copy: `docs/design.md` from the spec

**Interfaces:**
- Produces: `CORE_VERSION: string` from `@dsh-code-review/core`; `review` binary that prints `review 0.1.0`.
- Produces commands: `pnpm format`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build`, `pnpm verify`.

- [ ] **Step 1: Create the repository directory and guard against an existing one**

```bash
test ! -e "$HOME/projects/dsh-code-review" || { echo "refusing: $HOME/projects/dsh-code-review already exists"; exit 1; }
mkdir -p "$HOME/projects/dsh-code-review"
cd "$HOME/projects/dsh-code-review"
mkdir -p .github/workflows docs packages/core/src/git packages/core/src/diff packages/core/test/helpers packages/server/src/cli packages/server/test scripts
```

- [ ] **Step 2: Write the root configuration files**

`package.json`:

```json
{
  "name": "dsh-code-review-workspace",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "license": "MIT",
  "packageManager": "pnpm@11.22.0",
  "engines": { "node": ">=22", "pnpm": ">=11" },
  "scripts": {
    "build": "node scripts/build.mjs",
    "format": "prettier --check .",
    "format:write": "prettier --write .",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "verify": "pnpm build && pnpm format && pnpm lint && pnpm typecheck && pnpm test && pnpm build"
  },
  "devDependencies": {
    "@eslint/js": "10.0.1",
    "@types/node": "22.20.5",
    "esbuild": "0.28.2",
    "eslint": "10.13.0",
    "prettier": "3.9.10",
    "typescript": "5.9.3",
    "typescript-eslint": "8.72.0",
    "vite": "8.3.5",
    "vitest": "5.0.5"
  }
}
```

`pnpm-workspace.yaml`:

```yaml
packages:
  - packages/*
```

`tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2023"],
    "strict": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["node"],
    "baseUrl": ".",
    "paths": {
      "@dsh-code-review/core": ["packages/core/src/index.ts"]
    }
  }
}
```

`tsconfig.json`:

```json
{
  "extends": "./tsconfig.base.json",
  "include": [
    "packages/*/src/**/*.ts",
    "packages/*/test/**/*.ts",
    "vitest.config.ts"
  ],
  "exclude": ["**/dist/**", "node_modules"]
}
```

`vitest.config.ts`:

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@dsh-code-review/core': fileURLToPath(new URL('./packages/core/src/index.ts', import.meta.url)),
    },
  },
  test: {
    include: ['packages/**/test/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 20_000,
  },
});
```

`eslint.config.js`:

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
);
```

`.prettierrc.json`:

```json
{ "singleQuote": true, "semi": true, "printWidth": 100, "trailingComma": "all" }
```

`.prettierignore`:

```
node_modules/
dist/
coverage/
docs/design.md
docs/plans/
pnpm-lock.yaml
```

`.gitignore`:

```
node_modules/
dist/
coverage/
.env
*.log
.DS_Store
```

- [ ] **Step 3: Write the workspace packages and build script**

`packages/core/package.json`:

```json
{
  "name": "@dsh-code-review/core",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "main": "./dist/index.js",
  "exports": { ".": "./dist/index.js" },
  "files": ["dist"]
}
```

`packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.1.0';
```

`packages/core/test/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { CORE_VERSION } from '../src/index.js';

describe('core package', () => {
  it('exports its version', () => {
    expect(CORE_VERSION).toBe('0.1.0');
  });
});
```

`packages/server/package.json`:

```json
{
  "name": "@dsh-code-review/server",
  "version": "0.1.0",
  "private": true,
  "license": "MIT",
  "type": "module",
  "bin": { "review": "./dist/cli.js" },
  "dependencies": { "@dsh-code-review/core": "workspace:*" },
  "files": ["dist"]
}
```

`packages/server/src/cli.ts`:

```ts
#!/usr/bin/env node
import { CORE_VERSION } from '@dsh-code-review/core';

console.log(`review ${CORE_VERSION}`);
```

`scripts/build.mjs`:

```js
import { chmod } from 'node:fs/promises';
import { join } from 'node:path';
import { build } from 'esbuild';

const coreEntry = join(import.meta.dirname, '..', 'packages/core/src/index.ts');

await build({
  entryPoints: ['packages/core/src/index.ts'],
  outfile: 'packages/core/dist/index.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
});

await build({
  entryPoints: ['packages/server/src/cli.ts'],
  outfile: 'packages/server/dist/cli.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
  alias: { '@dsh-code-review/core': coreEntry },
});

await chmod('packages/server/dist/cli.js', 0o755);
```

- [ ] **Step 4: Write LICENSE, README, CI and copy the design spec**

`LICENSE`:

```
MIT License

Copyright (c) 2026 dsh-code-review contributors

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

`README.md`:

```markdown
# dsh-code-review

Harness-agnostic code review control plane: independent agent pre-review, line-anchored
human comments, round-to-round fix tracking and feedback delivery back to the initiating
agent session. See `docs/design.md`.

## Status

Plan 1 of 6: the git diff/snapshot foundation. Reviews, reviewer jobs, UI and the DSH
bundle are implemented in later plans.

## Development

~~~bash
pnpm install
pnpm verify
~~~

Inspect a repository without a daemon:

~~~bash
pnpm build
node packages/server/dist/cli.js diff --repo /path/to/repo --base main --head HEAD --json
~~~
```

`.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm build
      - run: pnpm format
      - run: pnpm lint
      - run: pnpm typecheck
      - run: pnpm test
      - run: pnpm build
```

Copy the approved spec:

```bash
cp "$HOME/projects/harness-tests/gsd-type/docs/superpowers/specs/2026-10-26-code-review-control-plane-design.md" docs/design.md
```

- [ ] **Step 5: Install, format and run all gates**

Run:

```bash
pnpm install
pnpm format:write
pnpm verify
```

Expected: install succeeds; esbuild writes `packages/core/dist/index.js` and `packages/server/dist/cli.js` twice; `prettier`, `eslint`, `tsc` exit 0; Vitest reports `1 passed`.

- [ ] **Step 6: Smoke-test the built CLI**

Run:

```bash
node packages/server/dist/cli.js
```

Expected output: `review 0.1.0`.

- [ ] **Step 7: Initialize git and commit**

Run:

```bash
git init -b main
git add -A
git commit -m "chore: bootstrap the code review workspace"
git status --porcelain
```

Expected: the commit succeeds and `git status --porcelain` prints nothing.

---

### Task 2: Parse a simple unified diff into typed structures

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/diff/parse.ts`, `packages/core/test/parse.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `DiffLine`, `DiffHunk`, `ParsedFile`, `FileStatus`, `DiffScope`, `ResolvedScope`, `FileDiff`, `Snapshot`, `SnapshotOptions`.
- Produces: `parseUnifiedDiff(diff: string): ParsedFile[]`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/parse.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse.js';

const SIMPLE = `diff --git a/src/a.ts b/src/a.ts
index 1111111..2222222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 const a = 1;
-const b = 2;
+const b = 3;
+const c = 4;
 const d = 5;
`;

describe('parseUnifiedDiff', () => {
  it('parses one hunk with line numbers and counts', () => {
    const files = parseUnifiedDiff(SIMPLE);
    expect(files).toHaveLength(1);

    const file = files[0];
    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.binary).toBe(false);
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(1);
    expect(file?.hunks).toHaveLength(1);
    expect(file?.hunks[0]?.header).toBe('');
    expect(file?.hunks[0]?.lines).toEqual([
      { kind: 'context', oldNo: 1, newNo: 1, text: 'const a = 1;' },
      { kind: 'del', oldNo: 2, newNo: null, text: 'const b = 2;' },
      { kind: 'add', oldNo: null, newNo: 2, text: 'const b = 3;' },
      { kind: 'add', oldNo: null, newNo: 3, text: 'const c = 4;' },
      { kind: 'context', oldNo: 3, newNo: 4, text: 'const d = 5;' },
    ]);
  });

  it('returns an empty array for an empty diff', () => {
    expect(parseUnifiedDiff('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/core/test/parse.test.ts`

Expected: FAIL because `../src/diff/parse.js` cannot be resolved.

- [ ] **Step 3: Write the domain types**

`packages/core/src/types.ts`:

```ts
export type DiffLineKind = 'context' | 'add' | 'del';

export interface DiffLine {
  kind: DiffLineKind;
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface DiffHunk {
  oldStart: number;
  oldLines: number;
  newStart: number;
  newLines: number;
  header: string;
  lines: DiffLine[];
}

export type FileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'binary'
  | 'oversized'
  | 'submodule'
  | 'untracked';

export interface ParsedFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  oldMode?: string;
  newMode?: string;
}

export type DiffScope =
  | { kind: 'range'; baseRef: string; headRef: string; twoDot?: boolean }
  | { kind: 'worktree'; baseRef: string }
  | { kind: 'commit'; sha: string };

export interface ResolvedScope {
  kind: DiffScope['kind'];
  repoRoot: string;
  baseRef?: string;
  headRef?: string;
  baseSha: string;
  headSha: string | null;
  label: string;
  worktreeDigest: string;
}

export interface FileDiff {
  path: string;
  oldPath?: string;
  status: FileStatus;
  binary: boolean;
  oversized: boolean;
  added: number;
  deleted: number;
  hunks: DiffHunk[];
  oldLines?: string[];
  newLines?: string[];
  contentHash: string;
}

export interface Snapshot {
  schemaVersion: 1;
  scope: ResolvedScope;
  files: FileDiff[];
  totals: { files: number; added: number; deleted: number; truncated: boolean };
  warnings: string[];
}

export interface SnapshotOptions {
  repoRoot: string;
  scope: DiffScope;
  includeUntracked?: boolean;
  includeContent?: boolean;
  maxDiffBytes?: number;
  maxFileLines?: number;
  maxFiles?: number;
  ignore?: readonly string[];
  signal?: AbortSignal;
}
```

- [ ] **Step 4: Implement the parser**

`packages/core/src/diff/parse.ts`:

```ts
import type { DiffHunk, DiffLine, ParsedFile } from '../types.js';

interface MutableFile {
  path: string;
  oldPath?: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  binary: boolean;
  hunks: DiffHunk[];
  added: number;
  deleted: number;
  oldMode?: string;
  newMode?: string;
  oldIsNull: boolean;
  newIsNull: boolean;
}

const FILE_HEADER = /^diff --git a\/(.+) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: ?(.*))?$/;

export function parseUnifiedDiff(diff: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  let current: MutableFile | null = null;
  let hunk: DiffHunk | null = null;
  let oldNo = 0;
  let newNo = 0;

  const finish = (): void => {
    if (current === null) return;
    if (hunk !== null) current.hunks.push(hunk);
    const hunks = current.hunks.filter((candidate) => candidate.lines.length > 0);

    let status = current.status;
    if (current.oldIsNull && !current.newIsNull) status = 'added';
    else if (!current.oldIsNull && current.newIsNull) status = 'deleted';
    else if (current.oldPath !== undefined && current.oldPath !== current.path) status = 'renamed';

    const parsed: ParsedFile = {
      path: current.path,
      status,
      binary: current.binary,
      hunks,
      added: current.added,
      deleted: current.deleted,
    };
    if (current.oldPath !== undefined && current.oldPath !== current.path) {
      parsed.oldPath = current.oldPath;
    }
    if (current.oldMode !== undefined) parsed.oldMode = current.oldMode;
    if (current.newMode !== undefined) parsed.newMode = current.newMode;
    files.push(parsed);

    current = null;
    hunk = null;
  };

  for (const line of diff.split('\n')) {
    if (line.startsWith('diff --git ')) {
      finish();
      const match = FILE_HEADER.exec(line);
      const oldPath = match?.[1] ?? '';
      const newPath = match?.[2] ?? oldPath;
      current = {
        path: newPath,
        ...(oldPath !== newPath ? { oldPath } : {}),
        status: 'modified',
        binary: false,
        hunks: [],
        added: 0,
        deleted: 0,
        oldIsNull: false,
        newIsNull: false,
      };
      continue;
    }

    if (current === null) continue;

    if (line.startsWith('@@ ')) {
      if (hunk !== null) current.hunks.push(hunk);
      const match = HUNK_HEADER.exec(line);
      if (match === null) {
        hunk = null;
        continue;
      }
      const oldStart = Number(match[1]);
      const oldLines = match[2] === undefined ? 1 : Number(match[2]);
      const newStart = Number(match[3]);
      const newLines = match[4] === undefined ? 1 : Number(match[4]);
      hunk = {
        oldStart,
        oldLines,
        newStart,
        newLines,
        header: match[5] ?? '',
        lines: [],
      };
      oldNo = oldStart;
      newNo = newStart;
      continue;
    }

    if (hunk === null) {
      if (line.startsWith('new file mode ')) {
        current.status = 'added';
        current.newMode = line.slice('new file mode '.length);
        continue;
      }
      if (line.startsWith('deleted file mode ')) {
        current.status = 'deleted';
        current.oldMode = line.slice('deleted file mode '.length);
        continue;
      }
      if (line.startsWith('old mode ')) {
        current.oldMode = line.slice('old mode '.length);
        continue;
      }
      if (line.startsWith('new mode ')) {
        current.newMode = line.slice('new mode '.length);
        continue;
      }
      if (line.startsWith('rename from ')) {
        current.oldPath = line.slice('rename from '.length);
        current.status = 'renamed';
        continue;
      }
      if (line.startsWith('rename to ')) {
        current.path = line.slice('rename to '.length);
        current.status = 'renamed';
        continue;
      }
      if (line.startsWith('--- ')) {
        const value = line.slice(4);
        if (value === '/dev/null') {
          current.oldIsNull = true;
          current.status = 'added';
        } else {
          current.oldPath = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith('+++ ')) {
        const value = line.slice(4);
        if (value === '/dev/null') {
          current.newIsNull = true;
          current.status = 'deleted';
        } else {
          current.path = stripPrefix(value);
        }
        continue;
      }
      if (line.startsWith('Binary files ') || line === 'GIT binary patch') {
        current.binary = true;
        continue;
      }
      continue;
    }

    if (line.startsWith('\\ No newline')) continue;

    if (line.startsWith('+') || line.startsWith('-') || line.startsWith(' ')) {
      const kind: DiffLine['kind'] = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'context';
      const text = line.slice(1);
      hunk.lines.push({
        kind,
        oldNo: kind === 'add' ? null : oldNo,
        newNo: kind === 'del' ? null : newNo,
        text,
      });
      if (kind === 'add') {
        current.added += 1;
        newNo += 1;
      } else if (kind === 'del') {
        current.deleted += 1;
        oldNo += 1;
      } else {
        oldNo += 1;
        newNo += 1;
      }
    }
  }

  finish();
  return files;
}

function stripPrefix(path: string): string {
  return path.startsWith('a/') || path.startsWith('b/') ? path.slice(2) : path;
}
```

Update `packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.1.0';
export { parseUnifiedDiff } from './diff/parse.js';
export type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffScope,
  FileDiff,
  FileStatus,
  ParsedFile,
  ResolvedScope,
  Snapshot,
  SnapshotOptions,
} from './types.js';
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm test -- packages/core/test/parse.test.ts`

Expected: PASS, 2 tests.

- [ ] **Step 6: Run all gates and commit**

Run:

```bash
pnpm format:write
pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(core): parse unified diffs into typed hunks"
```

---

### Task 3: Cover parser edge cases: add/delete/rename/binary/spaces

**Files:**
- Create: `packages/core/test/parse-edge.test.ts`
- Modify: `packages/core/src/diff/parse.ts` only if a case fails

**Interfaces:**
- Consumes: `parseUnifiedDiff(diff: string): ParsedFile[]`.
- Produces: confirmed behavior for `added`, `deleted`, `renamed`, `binary`, multiple files, `\ No newline`, paths with spaces and mode-only changes.

- [ ] **Step 1: Write the failing edge-case tests**

`packages/core/test/parse-edge.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseUnifiedDiff } from '../src/diff/parse.js';

const ADDED = `diff --git a/src/new.ts b/src/new.ts
new file mode 100644
index 0000000..1111111
--- /dev/null
+++ b/src/new.ts
@@ -0,0 +1,2 @@
+one
+two
`;

const DELETED = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index 2222222..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-one
-two
`;

const RENAMED = `diff --git a/src/old.ts b/src/new.ts
similarity index 90%
rename from src/old.ts
rename to src/new.ts
--- a/src/old.ts
+++ b/src/new.ts
@@ -1 +1 @@
-old
+new
`;

const BINARY = `diff --git a/logo.png b/logo.png
new file mode 100644
index 0000000..3333333
Binary files /dev/null and b/logo.png differ
`;

const TWO_FILES = `diff --git a/a.txt b/a.txt
--- a/a.txt
+++ b/a.txt
@@ -1 +1 @@
-a
+A
diff --git a/b.txt b/b.txt
--- a/b.txt
+++ b/b.txt
@@ -1 +1,2 @@
 b
+c
`;

const NO_NEWLINE = `diff --git a/n.txt b/n.txt
--- a/n.txt
+++ b/n.txt
@@ -1 +1 @@
-old
\\ No newline at end of file
+new
\\ No newline at end of file
`;

const SPACES = `diff --git a/assets/with space.txt b/assets/with space.txt
--- a/assets/with space.txt
+++ b/assets/with space.txt
@@ -1 +1 @@
-old
+new
`;

const MODE_ONLY = `diff --git a/run.sh b/run.sh
old mode 100644
new mode 100755
`;

const HUNK_TEXT = `diff --git a/notes.txt b/notes.txt
--- a/notes.txt
+++ b/notes.txt
@@ -1,3 +1,3 @@
 keep
---- three dashes
++++ four pluses
 tail
`;

describe('parseUnifiedDiff edge cases', () => {
  it('marks an added file and keeps the new path', () => {
    const [file] = parseUnifiedDiff(ADDED);
    expect(file?.status).toBe('added');
    expect(file?.path).toBe('src/new.ts');
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(0);
    expect(file?.hunks[0]?.oldStart).toBe(0);
  });

  it('marks a deleted file and keeps the old path', () => {
    const [file] = parseUnifiedDiff(DELETED);
    expect(file?.status).toBe('deleted');
    expect(file?.path).toBe('src/gone.ts');
    expect(file?.added).toBe(0);
    expect(file?.deleted).toBe(2);
  });

  it('records rename source and target', () => {
    const [file] = parseUnifiedDiff(RENAMED);
    expect(file?.status).toBe('renamed');
    expect(file?.path).toBe('src/new.ts');
    expect(file?.oldPath).toBe('src/old.ts');
  });

  it('marks a binary file without hunks', () => {
    const [file] = parseUnifiedDiff(BINARY);
    expect(file?.binary).toBe(true);
    expect(file?.path).toBe('logo.png');
    expect(file?.hunks).toEqual([]);
  });

  it('parses multiple files in one diff', () => {
    const files = parseUnifiedDiff(TWO_FILES);
    expect(files.map((file) => file.path)).toEqual(['a.txt', 'b.txt']);
    expect(files[1]?.added).toBe(1);
  });

  it('ignores the no-newline marker', () => {
    const [file] = parseUnifiedDiff(NO_NEWLINE);
    expect(file?.hunks[0]?.lines.map((line) => line.text)).toEqual(['old', 'new']);
  });

  it('keeps spaces in paths', () => {
    const [file] = parseUnifiedDiff(SPACES);
    expect(file?.path).toBe('assets/with space.txt');
  });

  it('parses a mode-only change without hunks', () => {
    const [file] = parseUnifiedDiff(MODE_ONLY);
    expect(file?.status).toBe('modified');
    expect(file?.oldMode).toBe('100644');
    expect(file?.newMode).toBe('100755');
    expect(file?.hunks).toEqual([]);
  });

  it('does not mistake hunk content for file headers', () => {
    const [file] = parseUnifiedDiff(HUNK_TEXT);
    expect(file?.hunks[0]?.lines[1]).toEqual({
      kind: 'del',
      oldNo: 2,
      newNo: null,
      text: '--- three dashes',
    });
    expect(file?.hunks[0]?.lines[2]).toEqual({
      kind: 'add',
      oldNo: null,
      newNo: 2,
      text: '+++ four pluses',
    });
  });
});
```

- [ ] **Step 2: Run the tests and verify the failing ones**

Run: `pnpm test -- packages/core/test/parse-edge.test.ts`

Expected: the added/deleted/rename/spaces/counts cases FAIL against the Task 2 parser; the hunk-content case may also fail if header detection is not guarded by `hunk === null`. The binary and mode-only cases should pass.

- [ ] **Step 3: Fix the parser**

Only the failures matter; the expected fixes are:

1. In `finish()`, prefer `added`/`deleted` from `oldIsNull`/`newIsNull` over `new file mode`/`deleted file mode`.
2. For `ADDED`, `path` must come from the `+++ b/...` line, not from the `diff --git` header.
3. For `DELETED`, `path` must stay the old path when `+++` is `/dev/null`.
4. For `RENAMED`, both `rename from/to` and `---/+++` must set `oldPath`/`path` consistently.
5. Header lines (`---`, `+++`, `Binary files`, `new file mode`, …) must only be read while `hunk === null`; the task-2 code already does this, so keep it.

The final `finish()` logic must be exactly:

```ts
let status = current.status;
if (current.oldIsNull && !current.newIsNull) status = 'added';
else if (!current.oldIsNull && current.newIsNull) status = 'deleted';
else if (current.oldPath !== undefined && current.oldPath !== current.path) status = 'renamed';
```

If `path` is wrong for added/deleted, inspect that `+++` and `---` handlers run before the `hunk === null` guard ends. Do not special-case the test strings.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test -- packages/core/test/parse-edge.test.ts`

Expected: PASS, 9 tests.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "test(core): lock diff parser edge cases"
```

---

### Task 4: Run git safely and resolve the repository root

**Files:**
- Create: `packages/core/src/git/run.ts`, `packages/core/src/git/repo.ts`, `packages/core/test/helpers/repo.ts`, `packages/core/test/git.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `runGit(cwd, args, options?): Promise<GitResult>`, `GitError` (codes `git-missing | not-a-repo | git-failed`), `resolveRepoRoot(path): Promise<string>`, test helper `makeRepo()`.
- Consumes: nothing from earlier tasks.

- [ ] **Step 1: Write the failing test and helper**

`packages/core/test/helpers/repo.ts`:

```ts
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface TestRepo {
  root: string;
  git: (...args: string[]) => Promise<string>;
  write: (path: string, content: string) => Promise<void>;
  commit: (message: string) => Promise<string>;
  commitStaged: (message: string) => Promise<string>;
  cleanup: () => Promise<void>;
}

export async function makeRepo(): Promise<TestRepo> {
  const root = await mkdtemp(join(tmpdir(), 'cr-repo-'));
  const env = { ...process.env, GIT_CONFIG_NOSYSTEM: '1' };
  const git = async (...args: string[]): Promise<string> => {
    const { stdout } = await execFileAsync('git', args, { cwd: root, env });
    return stdout.trim();
  };
  const write = async (path: string, content: string): Promise<void> => {
    const absolute = join(root, path);
    await mkdir(dirname(absolute), { recursive: true });
    await writeFile(absolute, content, 'utf8');
  };
  const commit = async (message: string): Promise<string> => {
    await git('add', '-A');
    return await commitStaged(message);
  };
  const commitStaged = async (message: string): Promise<string> => {
    await git('commit', '-m', message);
    return git('rev-parse', 'HEAD');
  };

  await git('init', '-b', 'main');
  await git('config', 'user.email', 'test@example.com');
  await git('config', 'user.name', 'Test User');

  return {
    root,
    git,
    write,
    commit,
    commitStaged,
    cleanup: async () => {
      await rm(root, { recursive: true, force: true });
    },
  };
}
```

`packages/core/test/git.test.ts`:

```ts
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { GitError, resolveRepoRoot, runGit } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('runGit', () => {
  it('runs git without a shell and returns stdout', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'hello\n');
    await repo.commit('base');

    const result = await runGit(repo.root, ['rev-parse', 'HEAD']);
    expect(result.code).toBe(0);
    expect(result.stdout.trim()).toMatch(/^[0-9a-f]{40}$/);
  });

  it('throws a GitError with stderr for a failed command', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);

    await expect(runGit(repo.root, ['rev-parse', 'HEAD'])).rejects.toMatchObject({
      name: 'GitError',
      code: 'git-failed',
    });
  });

  it('returns a non-zero result when allowFailure is set', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);

    const result = await runGit(repo.root, ['rev-parse', 'HEAD'], { allowFailure: true });
    expect(result.code).not.toBe(0);
  });
});

describe('resolveRepoRoot', () => {
  it('finds the root from a subdirectory', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('sub/file.txt', 'x\n');
    await repo.commit('base');

    await expect(resolveRepoRoot(join(repo.root, 'sub'))).resolves.toBe(repo.root);
  });

  it('rejects a directory that is not a git repository', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cr-not-repo-'));
    cleanups.push(async () => rm(directory, { recursive: true, force: true }));

    await expect(resolveRepoRoot(directory)).rejects.toBeInstanceOf(GitError);
    await expect(resolveRepoRoot(directory)).rejects.toMatchObject({ code: 'not-a-repo' });
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/core/test/git.test.ts`

Expected: FAIL because `runGit` and `resolveRepoRoot` are not exported.

- [ ] **Step 3: Implement the git runner**

`packages/core/src/git/run.ts`:

```ts
import { spawn } from 'node:child_process';

export type GitErrorCode = 'git-missing' | 'not-a-repo' | 'git-failed';

export class GitError extends Error {
  constructor(
    readonly code: GitErrorCode,
    message: string,
    readonly stderr = '',
  ) {
    super(message);
    this.name = 'GitError';
  }
}

export interface GitRunOptions {
  allowFailure?: boolean;
  maxBytes?: number;
  signal?: AbortSignal;
  env?: NodeJS.ProcessEnv;
}

export interface GitResult {
  stdout: string;
  stderr: string;
  code: number;
}

const DEFAULT_MAX_BYTES = 16 * 1024 * 1024;

export async function runGit(
  cwd: string,
  args: readonly string[],
  options: GitRunOptions = {},
): Promise<GitResult> {
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  if (options.signal?.aborted === true) {
    throw new GitError('git-failed', 'git command aborted');
  }

  return await new Promise<GitResult>((resolve, reject) => {
    const child = spawn('git', ['-c', 'core.quotePath=false', ...args], {
      cwd,
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      signal: options.signal,
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0',
        GIT_OPTIONAL_LOCKS: '0',
        LC_ALL: 'C',
        ...options.env,
      },
    });

    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let bytes = 0;
    let settled = false;

    const fail = (error: GitError): void => {
      if (settled) return;
      settled = true;
      reject(error);
    };

    child.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') {
        fail(new GitError('git-missing', 'git executable not found'));
      } else {
        fail(new GitError('git-failed', error.message));
      }
    });

    child.stdout.on('data', (chunk: Buffer) => {
      bytes += chunk.length;
      if (bytes > maxBytes) {
        child.kill('SIGKILL');
        fail(new GitError('git-failed', `git output exceeded ${maxBytes} bytes`));
        return;
      }
      stdout.push(chunk);
    });

    child.stderr.on('data', (chunk: Buffer) => {
      stderr.push(chunk);
    });

    child.on('close', (code) => {
      if (settled) return;
      const result: GitResult = {
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        code: code ?? 1,
      };
      if (result.code !== 0 && options.allowFailure !== true) {
        settled = true;
        reject(
          new GitError(
            'git-failed',
            `git ${args.join(' ')} failed (${result.code}): ${result.stderr.trim()}`,
            result.stderr,
          ),
        );
        return;
      }
      settled = true;
      resolve(result);
    });
  });
}
```

`packages/core/src/git/repo.ts`:

```ts
import { realpath, stat } from 'node:fs/promises';
import { GitError, runGit } from './run.js';

export async function resolveRepoRoot(input: string): Promise<string> {
  const absolute = await realpath(input).catch(() => {
    throw new GitError('not-a-repo', `path does not exist: ${input}`);
  });
  const info = await stat(absolute);
  if (!info.isDirectory()) {
    throw new GitError('not-a-repo', `not a directory: ${input}`);
  }

  const result = await runGit(absolute, ['rev-parse', '--show-toplevel'], {
    allowFailure: true,
  });
  if (result.code !== 0) {
    throw new GitError('not-a-repo', `not a git repository: ${input}`, result.stderr);
  }
  return await realpath(result.stdout.trim());
}
```

Update `packages/core/src/index.ts`:

```ts
export const CORE_VERSION = '0.1.0';
export { parseUnifiedDiff } from './diff/parse.js';
export { GitError, runGit } from './git/run.js';
export type { GitErrorCode, GitResult, GitRunOptions } from './git/run.js';
export { resolveRepoRoot } from './git/repo.js';
export type {
  DiffHunk,
  DiffLine,
  DiffLineKind,
  DiffScope,
  FileDiff,
  FileStatus,
  ParsedFile,
  ResolvedScope,
  Snapshot,
  SnapshotOptions,
} from './types.js';
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test -- packages/core/test/git.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(core): run git safely and resolve repository roots"
```

---

### Task 5: Resolve range, worktree and commit scopes

**Files:**
- Create: `packages/core/src/git/scope.ts`, `packages/core/test/scope.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `runGit`, `resolveRepoRoot`.
- Produces: `EMPTY_TREE_SHA`, `resolveDefaultBase(repoRoot): Promise<string>`, `resolveScope({ repoRoot, scope, signal? }): Promise<ResolvedScope>`, `worktreeDigest(repoRoot, baseSha, signal?): Promise<string>`.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/scope.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  EMPTY_TREE_SHA,
  resolveDefaultBase,
  resolveScope,
  worktreeDigest,
} from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function repoWithFeature(): Promise<Awaited<ReturnType<typeof makeRepo>> & {
  baseSha: string;
  featureSha: string;
}> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\ntwo\n');
  const baseSha = await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo changed\nthree\n');
  const featureSha = await repo.commit('feature');
  return { ...repo, baseSha, featureSha };
}

describe('resolveScope', () => {
  it('resolves a range to merge-base and head commits', async () => {
    const repo = await repoWithFeature();
    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    });

    expect(scope.kind).toBe('range');
    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBe(repo.featureSha);
    expect(scope.label).toBe('main...feature');
  });

  it('resolves a commit to its parent', async () => {
    const repo = await repoWithFeature();
    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: repo.featureSha },
    });

    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBe(repo.featureSha);
  });

  it('uses the empty tree for a root commit', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'root\n');
    const rootSha = await repo.commit('root');

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: rootSha },
    });
    expect(scope.baseSha).toBe(EMPTY_TREE_SHA);
  });

  it('resolves a worktree base without a head commit', async () => {
    const repo = await repoWithFeature();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'one\ntwo changed in worktree\n');

    const scope = await resolveScope({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(scope.baseSha).toBe(repo.baseSha);
    expect(scope.headSha).toBeNull();
    expect(scope.worktreeDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes the worktree digest when tracked content changes', async () => {
    const repo = await repoWithFeature();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'one\ntwo\n');

    const first = await worktreeDigest(repo.root, repo.baseSha);
    await repo.write('src/a.ts', 'one\ntwo plus\n');
    const second = await worktreeDigest(repo.root, repo.baseSha);

    expect(first).not.toBe(second);
  });
});

describe('resolveDefaultBase', () => {
  it('prefers main', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.commit('base');

    await expect(resolveDefaultBase(repo.root)).resolves.toBe('main');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/core/test/scope.test.ts`

Expected: FAIL because the exports do not exist.

- [ ] **Step 3: Implement scope resolution**

`packages/core/src/git/scope.ts`:

```ts
import { createHash } from 'node:crypto';
import type { DiffScope, ResolvedScope } from '../types.js';
import { resolveRepoRoot } from './repo.js';
import { GitError, runGit } from './run.js';

export const EMPTY_TREE_SHA = '4b825dc642cb6eb9a060e54bf8d69288fbee4904';

export async function resolveDefaultBase(repoRoot: string): Promise<string> {
  const origin = await runGit(repoRoot, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'], {
    allowFailure: true,
  });
  if (origin.code === 0 && origin.stdout.trim() !== '') return origin.stdout.trim();

  for (const candidate of ['main', 'master']) {
    const result = await runGit(
      repoRoot,
      ['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`],
      { allowFailure: true },
    );
    if (result.code === 0) return candidate;
  }

  const head = await runGit(repoRoot, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true });
  if (head.code === 0 && head.stdout.trim() !== '') return head.stdout.trim();
  throw new GitError('git-failed', 'cannot determine the default base branch');
}

export interface ResolveScopeInput {
  repoRoot: string;
  scope: DiffScope;
  signal?: AbortSignal;
}

export async function resolveScope(input: ResolveScopeInput): Promise<ResolvedScope> {
  const root = await resolveRepoRoot(input.repoRoot);
  const signal = input.signal;

  if (input.scope.kind === 'range') {
    const head = await runGit(
      root,
      ['rev-parse', '--verify', `${input.scope.headRef}^{commit}`],
      { signal },
    );
    const headSha = head.stdout.trim();
    const base = input.scope.twoDot === true
      ? await runGit(root, ['rev-parse', '--verify', `${input.scope.baseRef}^{commit}`], { signal })
      : await runGit(root, ['merge-base', input.scope.baseRef, input.scope.headRef], { signal });
    return {
      kind: 'range',
      repoRoot: root,
      baseRef: input.scope.baseRef,
      headRef: input.scope.headRef,
      baseSha: base.stdout.trim(),
      headSha,
      label: `${input.scope.baseRef}${input.scope.twoDot === true ? '..' : '...'}${input.scope.headRef}`,
      worktreeDigest: headSha,
    };
  }

  if (input.scope.kind === 'worktree') {
    const base = await runGit(
      root,
      ['rev-parse', '--verify', `${input.scope.baseRef}^{commit}`],
      { signal },
    );
    const baseSha = base.stdout.trim();
    return {
      kind: 'worktree',
      repoRoot: root,
      baseRef: input.scope.baseRef,
      baseSha,
      headSha: null,
      label: `${input.scope.baseRef} (worktree)`,
      worktreeDigest: await worktreeDigest(root, baseSha, signal),
    };
  }

  const head = await runGit(
    root,
    ['rev-parse', '--verify', `${input.scope.sha}^{commit}`],
    { signal },
  );
  const headSha = head.stdout.trim();
  const parent = await runGit(root, ['rev-parse', '--verify', `${headSha}^`], {
    allowFailure: true,
    signal,
  });
  const baseSha = parent.code === 0 ? parent.stdout.trim() : EMPTY_TREE_SHA;

  return {
    kind: 'commit',
    repoRoot: root,
    baseSha,
    headSha,
    label: headSha.slice(0, 12),
    worktreeDigest: headSha,
  };
}

export async function worktreeDigest(
  repoRoot: string,
  baseSha: string,
  signal?: AbortSignal,
): Promise<string> {
  const status = await runGit(
    repoRoot,
    ['status', '--porcelain=v2', '-z', '--untracked-files=all'],
    { signal, maxBytes: 8 * 1024 * 1024 },
  );
  const diff = await runGit(
    repoRoot,
    [
      'diff',
      '--no-color',
      '--no-ext-diff',
      '--no-textconv',
      '--binary',
      baseSha,
      '--',
    ],
    { signal, maxBytes: 8 * 1024 * 1024 },
  );
  return createHash('sha256')
    .update(status.stdout)
    .update('\0')
    .update(diff.stdout)
    .digest('hex');
}
```

Update `packages/core/src/index.ts`:

```ts
export { EMPTY_TREE_SHA, resolveDefaultBase, resolveScope, worktreeDigest } from './git/scope.js';
export type { ResolveScopeInput } from './git/scope.js';
```

- [ ] **Step 4: Run the test and verify it passes**

Run: `pnpm test -- packages/core/test/scope.test.ts`

Expected: PASS, 6 tests.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(core): resolve range, worktree and commit scopes"
```

---

### Task 6: Build a text snapshot with full file content

**Files:**
- Create: `packages/core/src/paths.ts`, `packages/core/src/git/content.ts`, `packages/core/src/diff/glob.ts` (stub, replaced in Task 7), `packages/core/src/diff/snapshot.ts`, `packages/core/test/snapshot.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `resolveScope`, `runGit`, `parseUnifiedDiff`, types.
- Produces: `safeJoin(root, relative): string`; `readBlob(...)`; `buildSnapshot(options: SnapshotOptions): Promise<Snapshot>`.
- `buildSnapshot` resolves the scope itself and returns sorted files.

- [ ] **Step 1: Write the failing snapshot test**

`packages/core/test/snapshot.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/index.js';
import type { Snapshot } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function featureRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'line1\nline2\nline3\n');
  await repo.write('src/keep.ts', 'keep\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'line1\nline2 changed\nline3\nline4\n');
  await repo.commit('feature');
  return repo;
}

async function snapshot(repoRoot: string, options: Partial<Parameters<typeof buildSnapshot>[0]> = {}): Promise<Snapshot> {
  return await buildSnapshot({
    repoRoot,
    scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    ...options,
  });
}

describe('buildSnapshot', () => {
  it('builds a range snapshot with stats, hunks and file content', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root);

    expect(result.schemaVersion).toBe(1);
    expect(result.scope.kind).toBe('range');
    expect(result.scope.headSha).toMatch(/^[0-9a-f]{40}$/);
    expect(result.totals.files).toBe(1);
    expect(result.totals.added).toBe(2);
    expect(result.totals.deleted).toBe(1);
    expect(result.totals.truncated).toBe(false);

    const file = result.files[0];
    expect(file?.path).toBe('src/a.ts');
    expect(file?.status).toBe('modified');
    expect(file?.added).toBe(2);
    expect(file?.deleted).toBe(1);
    expect(file?.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(file?.oldLines).toEqual(['line1', 'line2', 'line3']);
    expect(file?.newLines).toEqual(['line1', 'line2 changed', 'line3', 'line4']);
    expect(file?.hunks).toHaveLength(1);
  });

  it('includes an added file and a deleted file', async () => {
    const repo = await featureRepo();
    await repo.write('src/added.ts', 'new\n');
    await repo.git('rm', 'src/keep.ts');
    await repo.commit('add and remove');

    const result = await snapshot(repo.root);
    const added = result.files.find((file) => file.path === 'src/added.ts');
    const deleted = result.files.find((file) => file.path === 'src/keep.ts');

    expect(added?.status).toBe('added');
    expect(added?.newLines).toEqual(['new']);
    expect(added?.oldLines).toBeUndefined();
    expect(deleted?.status).toBe('deleted');
    expect(deleted?.oldLines).toEqual(['keep']);
    expect(deleted?.newLines).toBeUndefined();
  });

  it('snapshots uncommitted worktree changes', async () => {
    const repo = await featureRepo();
    await repo.git('checkout', 'main');
    await repo.write('src/a.ts', 'line1\nline2 worktree\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    expect(result.scope.headSha).toBeNull();
    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.newLines).toEqual(['line1', 'line2 worktree']);
  });

  it('marks files over maxFileLines as oversized and skips their content', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root, { maxFileLines: 2 });
    expect(result.files[0]?.oversized).toBe(true);
    expect(result.files[0]?.newLines).toBeUndefined();
  });

  it('omits content when includeContent is false', async () => {
    const repo = await featureRepo();
    const result = await snapshot(repo.root, { includeContent: false });
    expect(result.files[0]?.newLines).toBeUndefined();
    expect(result.files[0]?.oldLines).toBeUndefined();
  });

  it('marks the snapshot truncated when maxFiles is exceeded', async () => {
    const repo = await featureRepo();
    for (const name of ['b', 'c', 'd']) {
      await repo.write(`src/${name}.ts`, `${name}\n`);
    }
    await repo.commit('more files');

    const result = await snapshot(repo.root, { maxFiles: 1 });
    expect(result.files).toHaveLength(1);
    expect(result.totals.truncated).toBe(true);
  });

  it('sorts files by path', async () => {
    const repo = await featureRepo();
    await repo.write('src/z.ts', 'z\n');
    await repo.commit('z');
    const result = await snapshot(repo.root);
    const paths = result.files.map((file) => file.path);
    expect(paths).toEqual([...paths].sort());
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/core/test/snapshot.test.ts`

Expected: FAIL because `buildSnapshot` is not exported.

- [ ] **Step 3: Implement path safety and content reads**

`packages/core/src/paths.ts`:

```ts
import { resolve, sep } from 'node:path';

export class PathEscapeError extends Error {
  constructor(readonly relative: string) {
    super(`path escapes repository root: ${relative}`);
    this.name = 'PathEscapeError';
  }
}

export function safeJoin(root: string, relative: string): string {
  if (relative.includes('\0')) throw new PathEscapeError(relative);
  const absolute = resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(root + sep)) {
    throw new PathEscapeError(relative);
  }
  return absolute;
}
```

`packages/core/src/git/content.ts`:

```ts
import { createHash } from 'node:crypto';
import { lstat, readFile } from 'node:fs/promises';
import { safeJoin } from '../paths.js';
import { GitError, runGit } from './run.js';
import type { GitResult } from './run.js';

export interface BlobRead {
  lines: string[] | null;
  binary: boolean;
  oversized: boolean;
  symlink: boolean;
  hash: string;
}

const EMPTY: BlobRead = {
  lines: null,
  binary: false,
  oversized: false,
  symlink: false,
  hash: '',
};

function hashOf(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function splitLines(buffer: Buffer): string[] {
  const lines = buffer.toString('utf8').split('\n');
  if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

export async function readBlob(
  repoRoot: string,
  revision: string | null,
  path: string,
  maxLines: number,
): Promise<BlobRead> {
  let buffer: Buffer;

  if (revision === null) {
    const absolute = safeJoin(repoRoot, path);
    const info = await lstat(absolute).catch(() => null);
    if (info === null || !info.isFile()) {
      return { ...EMPTY, symlink: info?.isSymbolicLink() ?? false };
    }
    if (info.size > 8 * 1024 * 1024) {
      return { ...EMPTY, oversized: true };
    }
    buffer = await readFile(absolute);
  } else {
    let result: GitResult;
    try {
      result = await runGit(repoRoot, ['show', `${revision}:${path}`], {
        allowFailure: true,
        maxBytes: 8 * 1024 * 1024,
      });
    } catch (error) {
      if (error instanceof GitError && error.message.includes('exceeded')) {
        return { ...EMPTY, oversized: true };
      }
      throw error;
    }
    if (result.code !== 0) return EMPTY;
    buffer = Buffer.from(result.stdout, 'utf8');
  }

  if (buffer.includes(0)) {
    return { ...EMPTY, binary: true, hash: hashOf(buffer) };
  }

  const lines = splitLines(buffer);
  if (lines.length > maxLines) {
    return { ...EMPTY, oversized: true, hash: hashOf(buffer) };
  }

  return {
    lines,
    binary: false,
    oversized: false,
    symlink: false,
    hash: hashOf(buffer),
  };
}
```

- [ ] **Step 4: Implement the snapshot builder**

`packages/core/src/diff/snapshot.ts`:

```ts
import type { FileDiff, Snapshot, SnapshotOptions } from '../types.js';
import { readBlob } from '../git/content.js';
import { resolveScope } from '../git/scope.js';
import { GitError, runGit } from '../git/run.js';
import type { GitResult } from '../git/run.js';
import { parseUnifiedDiff } from './parse.js';
import { isIgnored } from './glob.js';

const DEFAULTS = {
  includeUntracked: true,
  includeContent: true,
  maxDiffBytes: 2 * 1024 * 1024,
  maxFileLines: 20_000,
  maxFiles: 500,
} as const;

interface DiffText {
  text: string;
  truncated: boolean;
}

function diffArgs(scope: Snapshot['scope']): string[] {
  const common = [
    'diff',
    '--no-color',
    '--no-ext-diff',
    '--no-textconv',
    '--unified=3',
    '--find-renames=50%',
  ];
  if (scope.kind === 'worktree') return [...common, scope.baseSha, '--'];
  return [...common, `${scope.baseSha}..${scope.headSha}`, '--'];
}

function truncateAtFileBoundary(text: string, maxBytes: number): DiffText {
  if (Buffer.byteLength(text, 'utf8') <= maxBytes) {
    return { text, truncated: false };
  }
  const cut = Buffer.from(text, 'utf8').subarray(0, maxBytes).toString('utf8');
  const boundary = cut.lastIndexOf('\ndiff --git ');
  if (boundary <= 0) return { text: '', truncated: true };
  return { text: cut.slice(0, boundary + 1), truncated: true };
}

export async function buildSnapshot(options: SnapshotOptions): Promise<Snapshot> {
  const includeUntracked = options.includeUntracked ?? DEFAULTS.includeUntracked;
  const includeContent = options.includeContent ?? DEFAULTS.includeContent;
  const maxDiffBytes = options.maxDiffBytes ?? DEFAULTS.maxDiffBytes;
  const maxFileLines = options.maxFileLines ?? DEFAULTS.maxFileLines;
  const maxFiles = options.maxFiles ?? DEFAULTS.maxFiles;
  const ignore = options.ignore ?? [];

  const scope = await resolveScope({
    repoRoot: options.repoRoot,
    scope: options.scope,
    signal: options.signal,
  });

  const warnings: string[] = [];
  let diff: GitResult;
  try {
    diff = await runGit(scope.repoRoot, diffArgs(scope), {
      signal: options.signal,
      maxBytes: Math.max(maxDiffBytes * 8, 16 * 1024 * 1024),
    });
  } catch (error) {
    if (error instanceof GitError && error.message.includes('exceeded')) {
      warnings.push('diff-truncated');
      diff = { stdout: '', stderr: '', code: 0 };
    } else {
      throw error;
    }
  }
  const limited = truncateAtFileBoundary(diff.stdout, maxDiffBytes);
  if (limited.truncated) warnings.push('diff-truncated');

  const parsed = parseUnifiedDiff(limited.text);
  const files: FileDiff[] = [];

  for (const entry of parsed) {
    if (isIgnored(entry.path, ignore)) continue;

    const oldPath = entry.oldPath ?? entry.path;
    const base = entry.status === 'added' || !includeContent
      ? null
      : await readBlob(scope.repoRoot, scope.baseSha, oldPath, maxFileLines);
    const head = entry.status === 'deleted' || !includeContent
      ? null
      : await readBlob(scope.repoRoot, scope.headSha, entry.path, maxFileLines);

    const binary = entry.binary || base?.binary === true || head?.binary === true;
    const oversized = base?.oversized === true || head?.oversized === true;
    const contentHash = head !== null && head.hash !== '' ? head.hash : (base?.hash ?? '');

    const file: FileDiff = {
      path: entry.path,
      status: entry.status,
      binary,
      oversized,
      added: entry.added,
      deleted: entry.deleted,
      hunks: entry.hunks,
      contentHash,
    };
    if (entry.oldPath !== undefined) file.oldPath = entry.oldPath;
    if (!binary && !oversized && base !== null && base.lines !== null) {
      file.oldLines = base.lines;
    }
    if (!binary && !oversized && head !== null && head.lines !== null) {
      file.newLines = head.lines;
    }
    files.push(file);
  }

  files.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  let truncated = limited.truncated;
  let selected = files;
  if (files.length > maxFiles) {
    selected = files.slice(0, maxFiles);
    truncated = true;
    warnings.push('files-truncated');
  }

  const totals = selected.reduce(
    (accumulator, file) => ({
      files: accumulator.files + 1,
      added: accumulator.added + file.added,
      deleted: accumulator.deleted + file.deleted,
      truncated,
    }),
    { files: 0, added: 0, deleted: 0, truncated },
  );

  return {
    schemaVersion: 1,
    scope,
    files: selected,
    totals,
    warnings,
  };
}
```

Task 6 does not yet implement untracked or `glob.ts`; import `isIgnored` would fail. Create a minimal `packages/core/src/diff/glob.ts` stub now; Task 7 replaces it and adds tests:
```ts
export function isIgnored(path: string, patterns: readonly string[]): boolean {
  void path;
  void patterns;
  return false;
}
```

Update `packages/core/src/index.ts`:

```ts
export { safeJoin, PathEscapeError } from './paths.js';
export { buildSnapshot } from './diff/snapshot.js';
export { readBlob } from './git/content.js';
export type { BlobRead } from './git/content.js';
```

- [ ] **Step 5: Run the test and verify it passes**

Run: `pnpm test -- packages/core/test/snapshot.test.ts`

Expected: PASS, 7 tests.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(core): build text diff snapshots with file content"
```

---

### Task 7: Add untracked files, ignores, binary and size limits

**Files:**
- Modify: `packages/core/src/diff/glob.ts`, `packages/core/src/diff/snapshot.ts`, `packages/core/src/git/content.ts`
- Create: `packages/core/test/snapshot-untracked.test.ts`

**Interfaces:**
- Consumes: `buildSnapshot`.
- Produces: real `isIgnored(path, patterns)`, untracked `FileDiff` entries, binary/oversized flags, ignore filtering.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/snapshot-untracked.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { buildSnapshot } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

async function repoAtMain(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'a\n');
  await repo.commit('base');
  return repo;
}

describe('untracked files', () => {
  it('includes an untracked text file in a worktree snapshot', async () => {
    const repo = await repoAtMain();
    await repo.write('notes.md', 'one\ntwo\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const notes = result.files.find((file) => file.path === 'notes.md');

    expect(notes?.status).toBe('untracked');
    expect(notes?.added).toBe(2);
    expect(notes?.deleted).toBe(0);
    expect(notes?.newLines).toEqual(['one', 'two']);
    expect(notes?.hunks).toHaveLength(1);
        expect(notes?.hunks[0]?.lines.every((line) => line.kind === 'add')).toBe(true);
  });

  it('can exclude untracked files', async () => {
    const repo = await repoAtMain();
    await repo.write('notes.md', 'one\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      includeUntracked: false,
    });
    expect(result.files.map((file) => file.path)).not.toContain('notes.md');
  });
});

describe('ignores, binary and limits', () => {
  it('applies ignore patterns to tracked and untracked files', async () => {
    const repo = await repoAtMain();
    await repo.write('dist/bundle.js', 'built\n');
    await repo.write('notes.md', 'note\n');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      ignore: ['dist/**', '*.md'],
    });
    expect(result.files).toEqual([]);
  });

  it('marks an untracked binary file without content', async () => {
    const repo = await repoAtMain();
    await repo.write('image.bin', 'abc\u0000def');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });
    const image = result.files.find((file) => file.path === 'image.bin');

    expect(image?.binary).toBe(true);
    expect(image?.newLines).toBeUndefined();
  });

  it('marks an oversized untracked file without content', async () => {
    const repo = await repoAtMain();
    await repo.write('big.txt', Array.from({ length: 50 }, (_, index) => `line ${index}`).join('\n'));

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
      maxFileLines: 10,
    });
    const big = result.files.find((file) => file.path === 'big.txt');

    expect(big?.oversized).toBe(true);
    expect(big?.newLines).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/core/test/snapshot-untracked.test.ts`

Expected: FAIL because untracked files and ignore patterns are not implemented.

- [ ] **Step 3: Implement glob matching**

`packages/core/src/diff/glob.ts`:

```ts
function globToRegExp(glob: string): RegExp {
  let pattern = glob.trim();
  if (pattern.endsWith('/')) pattern += '**';
  const anchored = pattern.includes('/');
  let source = '';

  for (let index = 0; index < pattern.length; index += 1) {
    const character = pattern[index] ?? '';
    if (character === '*') {
      if (pattern[index + 1] === '*') {
        index += 1;
        if (pattern[index + 1] === '/') {
          index += 1;
          source += '(?:.*/)?';
        } else {
          source += '.*';
        }
      } else {
        source += '[^/]*';
      }
      continue;
    }
    if (character === '?') {
      source += '[^/]';
      continue;
    }
    source += character.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  return new RegExp(anchored ? `^${source}$` : `(?:^|.*/)${source}$`);
}

export function isIgnored(path: string, patterns: readonly string[]): boolean {
  return patterns.some((pattern) => globToRegExp(pattern).test(path));
}
```

- [ ] **Step 4: Add untracked collection and wire it into the snapshot**

Add to `packages/core/src/diff/snapshot.ts`:

```ts
import { lstat } from 'node:fs/promises';
import { safeJoin } from '../paths.js';

async function listUntracked(repoRoot: string, signal?: AbortSignal): Promise<string[]> {
  const result = await runGit(repoRoot, ['ls-files', '--others', '--exclude-standard', '-z'], {
    signal,
    maxBytes: 8 * 1024 * 1024,
  });
  return result.stdout.split('\0').filter((path) => path.length > 0);
}

async function untrackedFile(
  repoRoot: string,
  path: string,
  maxFileLines: number,
): Promise<FileDiff | null> {
  const absolute = safeJoin(repoRoot, path);
  const info = await lstat(absolute).catch(() => null);
  if (info === null) return null;
  if (info.isSymbolicLink() || !info.isFile()) return null;

  const read = await readBlob(repoRoot, null, path, maxFileLines);
  if (read.lines === null) {
    return {
      path,
      status: 'untracked',
      binary: read.binary,
      oversized: read.oversized,
      added: 0,
      deleted: 0,
      hunks: [],
      contentHash: read.hash,
    };
  }

  const hunk = {
    oldStart: 0,
    oldLines: 0,
    newStart: 1,
    newLines: read.lines.length,
    header: '',
    lines: read.lines.map((text, index) => ({
      kind: 'add' as const,
      oldNo: null,
      newNo: index + 1,
      text,
    })),
  };

  return {
    path,
    status: 'untracked',
    binary: false,
    oversized: false,
    added: read.lines.length,
    deleted: 0,
    hunks: [hunk],
    newLines: read.lines,
    contentHash: read.hash,
  };
}
```

In `buildSnapshot`, after the parsed-file loop and before sorting:

```ts
if (scope.kind === 'worktree' && includeUntracked) {
  const untracked = await listUntracked(scope.repoRoot, options.signal);
  for (const path of untracked) {
    if (isIgnored(path, ignore)) continue;
    const file = await untrackedFile(scope.repoRoot, path, maxFileLines);
    if (file !== null) files.push(file);
  }
}
```

- [ ] **Step 5: Run the tests and verify they pass**

Run: `pnpm test -- packages/core/test/snapshot-untracked.test.ts`

Expected: PASS, 5 tests.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(core): include untracked files with ignore and size limits"
```

---

### Task 8: Reject path escapes, do not follow symlinks, mark submodules

**Files:**
- Create: `packages/core/test/snapshot-safety.test.ts`
- Modify: `packages/core/src/diff/snapshot.ts`
- Optionally modify: `packages/core/src/paths.ts`

**Interfaces:**
- Consumes: `safeJoin`, `buildSnapshot`.
- Produces: submodule entries with `status: 'submodule'`; symlink warnings; `PathEscapeError` for `..` and absolute paths.

- [ ] **Step 1: Write the failing tests**

`packages/core/test/snapshot-safety.test.ts`:

```ts
import { mkdtemp, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { PathEscapeError, buildSnapshot, safeJoin } from '../src/index.js';
import { makeRepo } from './helpers/repo.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

describe('safeJoin', () => {
  it('rejects parent traversal and absolute paths', () => {
    const root = '/tmp/example-root';
    expect(() => safeJoin(root, '../outside.txt')).toThrow(PathEscapeError);
    expect(() => safeJoin(root, '/etc/passwd')).toThrow(PathEscapeError);
    expect(safeJoin(root, 'src/a.ts')).toBe('/tmp/example-root/src/a.ts');
  });
});

describe('symlinks', () => {
  it('does not follow an untracked symlink outside the repository', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('src/a.ts', 'a\n');
    await repo.commit('base');

    const outside = await mkdtemp(join(tmpdir(), 'cr-outside-'));
    cleanups.push(async () => rm(outside, { recursive: true, force: true }));
    await symlink(join(outside, 'secret.txt'), join(repo.root, 'link.txt'));

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'worktree', baseRef: 'main' },
    });

    expect(result.files.map((file) => file.path)).not.toContain('link.txt');
    expect(result.warnings).toContain('symlink-not-followed:link.txt');
  });
});

describe('submodules', () => {
  it('marks gitlink entries as submodules and skips content reads', async () => {
    const repo = await makeRepo();
    cleanups.push(repo.cleanup);
    await repo.write('a.txt', 'a\n');
    await repo.git('add', 'a.txt');
    await repo.git('update-index', '--add', '--cacheinfo', '160000,1111111111111111111111111111111111111111,vendor/lib');
    await repo.commitStaged('base');

    await repo.git('update-index', '--add', '--cacheinfo', '160000,2222222222222222222222222222222222222222,vendor/lib');
    const head = await repo.commitStaged('bump submodule');

    const result = await buildSnapshot({
      repoRoot: repo.root,
      scope: { kind: 'commit', sha: head },
    });
    const submodule = result.files.find((file) => file.path === 'vendor/lib');

    expect(submodule?.status).toBe('submodule');
    expect(submodule?.newLines).toBeUndefined();
    expect(submodule?.oldLines).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run the tests and verify they fail**

Run: `pnpm test -- packages/core/test/snapshot-safety.test.ts`

Expected: FAIL because symlinks are not warned about and submodules are not marked.

- [ ] **Step 3: Implement the safety behavior**

In `packages/core/src/diff/snapshot.ts`:

1. Import `lstat` and `safeJoin` (already imported for untracked).
2. In the untracked loop, do not silently skip symlinks; push a warning:

```ts
const absolute = safeJoin(scope.repoRoot, path);
const info = await lstat(absolute).catch(() => null);
if (info?.isSymbolicLink() === true) {
  warnings.push(`symlink-not-followed:${path}`);
  continue;
}
```

3. Add a helper that reads head modes:

```ts
async function headModes(
  repoRoot: string,
  headSha: string | null,
  signal?: AbortSignal,
): Promise<Map<string, string>> {
  const result = await runGit(
    repoRoot,
    headSha === null ? ['ls-files', '-s', '-z'] : ['ls-tree', '-r', '-z', headSha],
    { allowFailure: true, signal, maxBytes: 8 * 1024 * 1024 },
  );
  const modes = new Map<string, string>();
  for (const entry of result.stdout.split('\0')) {
    const tab = entry.indexOf('\t');
    if (tab < 0) continue;
    const mode = entry.slice(0, tab).split(' ')[0];
    const path = entry.slice(tab + 1);
    if (mode !== undefined && path !== '') modes.set(path, mode);
  }
  return modes;
}
```

4. Before the parsed-file loop, compute `const modes = await headModes(scope.repoRoot, scope.headSha, options.signal);`.

5. Inside the parsed-file loop, after `const oldPath = ...`:

```ts
if (modes.get(entry.path) === '160000') {
  files.push({
    path: entry.path,
    ...(entry.oldPath === undefined ? {} : { oldPath: entry.oldPath }),
    status: 'submodule',
    binary: false,
    oversized: false,
    added: entry.added,
    deleted: entry.deleted,
    hunks: entry.hunks,
    contentHash: '',
  });
  continue;
}
```

6. For untracked files, the helper `untrackedFile` already returns `null` for symlinks; the caller must warn before calling it (step 2). Remove the duplicate lstat inside `untrackedFile` or keep it as defense in depth.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test -- packages/core/test/snapshot-safety.test.ts`

Expected: PASS, 3 tests.

- [ ] **Step 5: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "fix(core): reject path escapes and mark submodules"
```

---

### Task 9: Expose the snapshot through the `review diff` CLI

**Files:**
- Create: `packages/server/src/cli/run.ts`, `packages/server/test/cli.test.ts`
- Modify: `packages/server/src/cli.ts`
- Modify: `packages/server/package.json` if needed

**Interfaces:**
- Consumes: `buildSnapshot`, `resolveDefaultBase`, `resolveRepoRoot`, `GitError`.
- Produces: `runCli(argv: readonly string[], io: CliIO): Promise<number>`; commands `diff`, `help`, `version`; exit codes `0` success, `5` usage/git validation.

- [ ] **Step 1: Write the failing CLI tests**

`packages/server/test/cli.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import { makeRepo } from '../../core/test/helpers/repo.js';
import type { Snapshot } from '@dsh-code-review/core';
import { runCli } from '../src/cli/run.js';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map(async (cleanup) => cleanup()));
});

function capture(): { io: { stdout: { write: (text: string) => boolean }; stderr: { write: (text: string) => boolean } }; out: string[]; err: string[] } {
  const out: string[] = [];
  const err: string[] = [];
  return {
    out,
    err,
    io: {
      stdout: { write: (text: string) => { out.push(text); return true; } },
      stderr: { write: (text: string) => { err.push(text); return true; } },
    },
  };
}

async function featureRepo(): Promise<Awaited<ReturnType<typeof makeRepo>>> {
  const repo = await makeRepo();
  cleanups.push(repo.cleanup);
  await repo.write('src/a.ts', 'one\n');
  await repo.commit('base');
  await repo.git('checkout', '-b', 'feature');
  await repo.write('src/a.ts', 'one\ntwo\n');
  await repo.commit('feature');
  return repo;
}

describe('review diff', () => {
  it('prints a JSON snapshot', async () => {
    const repo = await featureRepo();
    const { io, out, err } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--head', 'feature', '--json'],
      io,
    );

    expect(code).toBe(0);
    expect(err).toEqual([]);
    const snapshot = JSON.parse(out.join('')) as Snapshot;
    expect(snapshot.schemaVersion).toBe(1);
    expect(snapshot.files[0]?.path).toBe('src/a.ts');
    expect(snapshot.files[0]?.added).toBe(1);
  });

  it('prints a human summary', async () => {
    const repo = await featureRepo();
    const { io, out } = capture();

    const code = await runCli(
      ['diff', '--repo', repo.root, '--base', 'main', '--head', 'feature'],
      io,
    );

    expect(code).toBe(0);
    expect(out.join('')).toContain('main...feature');
    expect(out.join('')).toContain('src/a.ts');
  });

  it('returns 5 for a non-repository path', async () => {
    const { io, err } = capture();
    const code = await runCli(['diff', '--repo', '/tmp', '--json'], io);

    expect(code).toBe(5);
    expect(err.join('')).toContain('not a git repository');
  });

  it('prints help and version with exit code 0', async () => {
    const help = capture();
    expect(await runCli(['help'], help.io)).toBe(0);
    expect(help.out.join('')).toContain('review diff');

    const version = capture();
    expect(await runCli(['version'], version.io)).toBe(0);
    expect(version.out.join('')).toContain('review 0.1.0');
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm test -- packages/server/test/cli.test.ts`

Expected: FAIL because `../src/cli/run.js` does not exist.

- [ ] **Step 3: Implement the CLI**

`packages/server/src/cli/run.ts`:

```ts
import {
  CORE_VERSION,
  GitError,
  buildSnapshot,
  resolveDefaultBase,
  resolveRepoRoot,
} from '@dsh-code-review/core';
import type { DiffScope, Snapshot } from '@dsh-code-review/core';

export interface CliIO {
  stdout: { write: (text: string) => unknown };
  stderr: { write: (text: string) => unknown };
}

class UsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UsageError';
  }
}

interface DiffOptions {
  repo: string;
  base?: string;
  head?: string;
  worktree: boolean;
  commit?: string;
  twoDot: boolean;
  json: boolean;
  includeUntracked: boolean;
  includeContent: boolean;
  maxFiles?: number;
  maxFileLines?: number;
  ignore: string[];
}

function value(args: string[], flag: string): string {
  const found = args.shift();
  if (found === undefined || found.startsWith('--')) {
    throw new UsageError(`${flag} requires a value`);
  }
  return found;
}

function integer(raw: string, flag: string): number {
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new UsageError(`${flag} must be a positive integer`);
  }
  return parsed;
}

function parseDiff(args: string[]): DiffOptions {
  const options: DiffOptions = {
    repo: process.cwd(),
    worktree: false,
    twoDot: false,
    json: false,
    includeUntracked: true,
    includeContent: true,
    ignore: [],
  };

  while (args.length > 0) {
    const flag = args.shift();
    if (flag === undefined) break;
    switch (flag) {
      case '--repo':
        options.repo = value(args, flag);
        break;
      case '--base':
        options.base = value(args, flag);
        break;
      case '--head':
        options.head = value(args, flag);
        break;
      case '--worktree':
        options.worktree = true;
        break;
      case '--commit':
        options.commit = value(args, flag);
        break;
      case '--two-dot':
        options.twoDot = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--no-untracked':
        options.includeUntracked = false;
        break;
      case '--no-content':
        options.includeContent = false;
        break;
      case '--max-files':
        options.maxFiles = integer(value(args, flag), flag);
        break;
      case '--max-lines':
        options.maxFileLines = integer(value(args, flag), flag);
        break;
      case '--ignore':
        options.ignore.push(value(args, flag));
        break;
      default:
        throw new UsageError(`unknown flag: ${flag}`);
    }
  }

  const selectors = [options.worktree, options.commit !== undefined].filter(Boolean).length;
  if (selectors > 1) throw new UsageError('choose only one of --worktree or --commit');
  return options;
}

function scope(options: DiffOptions, baseRef: string): DiffScope {
  if (options.commit !== undefined) return { kind: 'commit', sha: options.commit };
  if (options.worktree) return { kind: 'worktree', baseRef };
  return {
    kind: 'range',
    baseRef,
    headRef: options.head ?? 'HEAD',
    ...(options.twoDot ? { twoDot: true } : {}),
  };
}

function statusLetter(status: string): string {
  const letters: Record<string, string> = {
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    binary: 'B',
    oversized: 'L',
    submodule: 'S',
    untracked: '?',
    modified: 'M',
  };
  return letters[status] ?? 'M';
}

function format(snapshot: Snapshot): string {
  const lines = [
    `${snapshot.scope.label}  ${snapshot.totals.files} files  +${snapshot.totals.added} -${snapshot.totals.deleted}`,
  ];
  for (const file of snapshot.files) {
    lines.push(`${statusLetter(file.status)} ${file.path} +${file.added} -${file.deleted}`);
  }
  for (const warning of snapshot.warnings) lines.push(`warning: ${warning}`);
  return `${lines.join('\n')}\n`;
}

function help(): string {
  return [
    'review diff — inspect changes without a daemon',
    '',
    'usage: review diff --repo <path> [--base <ref>] [--head <ref>] [--worktree] [--commit <sha>]',
    '',
    'options:',
    '  --repo <path>       repository root (default: current directory)',
    '  --base <ref>        base ref (default: origin/HEAD, main, master, current branch)',
    '  --head <ref>        head ref for a range (default: HEAD)',
    '  --worktree          diff the base against the working tree',
    '  --commit <sha>      diff a commit against its parent',
    '  --two-dot           use base..head instead of merge-base',
    '  --json              emit the full snapshot JSON',
    '  --no-untracked      exclude untracked files',
    '  --no-content        omit full file content',
    '  --max-files <n>     cap the number of files',
    '  --max-lines <n>     cap lines per file',
    '  --ignore <glob>     exclude a path pattern (repeatable)',
    '',
  ].join('\n');
}

export async function runCli(argv: readonly string[], io: CliIO): Promise<number> {
  const args = [...argv];
  const command = args.shift() ?? 'help';

  try {
    if (command === 'help' || command === '--help' || command === '-h') {
      io.stdout.write(help());
      return 0;
    }
    if (command === 'version' || command === '--version' || command === '-v') {
      io.stdout.write(`review ${CORE_VERSION}\n`);
      return 0;
    }
    if (command !== 'diff') {
      throw new UsageError(`unknown command: ${command}`);
    }

    const options = parseDiff(args);
    const repoRoot = await resolveRepoRoot(options.repo);
    const baseRef =
      options.commit === undefined ? (options.base ?? (await resolveDefaultBase(repoRoot))) : 'HEAD';
    const snapshot = await buildSnapshot({
      repoRoot,
      scope: scope(options, baseRef),
      includeUntracked: options.includeUntracked,
      includeContent: options.includeContent,
      ...(options.maxFiles === undefined ? {} : { maxFiles: options.maxFiles }),
      ...(options.maxFileLines === undefined ? {} : { maxFileLines: options.maxFileLines }),
      ignore: options.ignore,
    });

    if (options.json) {
      io.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
    } else {
      io.stdout.write(format(snapshot));
    }
    return 0;
  } catch (error) {
    if (error instanceof UsageError || error instanceof GitError) {
      io.stderr.write(`error: ${error.message}\n`);
      return 5;
    }
    const message = error instanceof Error ? error.message : String(error);
    io.stderr.write(`error: ${message}\n`);
    return 5;
  }
}
```

`packages/server/src/cli.ts`:

```ts
#!/usr/bin/env node
import { runCli } from './cli/run.js';

const code = await runCli(process.argv.slice(2), {
  stdout: process.stdout,
  stderr: process.stderr,
});
process.exitCode = code;
```

- [ ] **Step 4: Run the tests and verify they pass**

Run: `pnpm test -- packages/server/test/cli.test.ts`

Expected: PASS, 4 tests.

- [ ] **Step 5: Build and smoke-test the binary**

Run:

```bash
pnpm build
node packages/server/dist/cli.js version
```

Expected: `review 0.1.0`; the shebang is preserved and the file is executable.

- [ ] **Step 6: Run all gates and commit**

```bash
pnpm format:write && pnpm lint && pnpm typecheck && pnpm test
git add -A
git commit -m "feat(cli): expose review diff snapshots"
```

---

### Task 10: Document, copy the plan, and run the final verification

**Files:**
- Modify: `README.md`
- Create: `docs/plans/2026-10-26-code-review-foundation.md` (copy of this plan)
- Modify: `.github/workflows/ci.yml` only if the gates need adjustment

**Interfaces:**
- Consumes: the built `review` binary.
- Produces: a documented, reproducible verification run with real command output.

- [ ] **Step 1: Update the README with the snapshot contract and limits**

Replace the `Inspect a repository` block with:

```markdown
## Snapshot CLI

~~~bash
pnpm build
node packages/server/dist/cli.js diff \
  --repo /path/to/repo --base main --head HEAD --json > snapshot.json
~~~

The JSON shape is stable for Plan 1:

~~~json
{
  "schemaVersion": 1,
  "scope": { "kind": "range", "baseSha": "…", "headSha": "…", "worktreeDigest": "…" },
  "files": [{ "path": "src/a.ts", "status": "modified", "added": 2, "deleted": 1 }],
  "totals": { "files": 1, "added": 2, "deleted": 1, "truncated": false },
  "warnings": []
}
~~~

Limits: 2 MiB diff, 500 files, 20 000 lines per file. Git commands are read-only and
run with `--no-ext-diff --no-textconv`; external diff drivers are never executed.
```

- [ ] **Step 2: Copy the plan into the repository**

```bash
mkdir -p docs/plans
cp "$HOME/projects/harness-tests/gsd-type/docs/superpowers/plans/2026-10-26-code-review-foundation.md" docs/plans/
```

- [ ] **Step 3: Run the full verification**

```bash
pnpm verify
```

Expected: esbuild, `prettier`, `eslint`, `tsc`, all Vitest tests, and the final esbuild exit 0. Record the test count.

- [ ] **Step 4: Prove the binary against a real temporary repository**

```bash
fixture=$(mktemp -d)
cd "$fixture"
git init -b main
git config user.email test@example.com
git config user.name "Test User"
printf 'one\ntwo\n' > a.txt
git add -A && git commit -m base
git checkout -b feature
printf 'one\ntwo changed\nthree\n' > a.txt
git add -A && git commit -m feature

node "$HOME/projects/dsh-code-review/packages/server/dist/cli.js" \
  diff --repo "$fixture" --base main --head feature --json > "$fixture/snapshot.json"

node -e "
const s = require('$fixture/snapshot.json');
if (s.schemaVersion !== 1) throw new Error('bad schema');
if (s.files.length !== 1) throw new Error('expected one file');
if (s.files[0].added !== 2 || s.files[0].deleted !== 1) throw new Error('bad stats');
console.log('snapshot ok', s.files[0].path, s.totals);
"
```

Expected: `snapshot ok a.txt { files: 1, added: 2, deleted: 1, truncated: false }`.

- [ ] **Step 5: Verify the worktree path and path safety**

```bash
cd "$fixture"
printf 'one\ntwo plus worktree\n' > a.txt
node "$HOME/projects/dsh-code-review/packages/server/dist/cli.js" \
  diff --repo "$fixture" --worktree --base main --json \
  | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const s=JSON.parse(d);if(s.scope.headSha!==null)throw new Error('head should be null');console.log('worktree ok',s.totals)})"
```

Expected: `worktree ok { files: 1, added: 1, deleted: 1, truncated: false }` (the assertion is the null head and exit 0).

- [ ] **Step 6: Confirm the repository is clean and commit**

```bash
cd "$HOME/projects/dsh-code-review"
git status --porcelain
git add -A
git commit -m "docs: document the snapshot foundation"
```

- [ ] **Step 7: Final gate evidence**

Run:

```bash
pnpm verify
git log --oneline --decorate -12
git status --porcelain
```

Expected: all gates pass, the log shows 10 commits, and the working tree is clean. Record the exact Vitest total in the handoff note.

---

## Self-Review

**Spec coverage (Plan 1 = C1–C2):**

| Spec section | Task |
|---|---|
| §7.1 scope resolution (range/worktree/commit, default base) | Task 5 |
| §7.2 safe git commands and env | Tasks 4, 5 |
| §7.3 unified diff parsing, renames, binary, untracked, limits | Tasks 2, 3, 7 |
| §7.3 path safety, symlinks, submodules | Task 8 |
| §7.4 snapshot, content, digests | Tasks 5, 6 |
| §5.2 module boundaries, no runtime deps | Task 1 |
| §19.1 unit/integration tests, CI | Tasks 2–10 |

Not covered here by design: store, review lifecycle, reviewer jobs, rounds/anchors, HTTP, UI, DSH, Docker. They are Plans 2–6.

**Placeholder scan:** no `TBD`, `TODO`, “implement later” or “similar to Task N”. Every code step contains the code; every test step contains the test; every verification step names the command and expected result.

**Type consistency:** `SnapshotOptions` fields match `buildSnapshot`; `DiffScope` is used by both `resolveScope` and the CLI; `ResolvedScope.headSha` is `string | null`; `readBlob` returns `BlobRead` with `lines/binary/oversized/symlink/hash`; `FileDiff` requires `binary`, `oversized`, `hunks`, `contentHash` and optionally `oldLines/newLines`; `runCli` returns `Promise<number>`; `GitError` is exported from the package root.

**Failure-mode review:** A diff larger than the 16 MiB git-output guard becomes `warnings: ["diff-truncated"]` with an empty file list instead of throwing; a tracked file larger than 8 MiB becomes `oversized` instead of aborting the snapshot. Both paths are defensive and are recorded for Plan 2 tests.

**Known limitation recorded for Plan 2:** `worktreeDigest` covers tracked changes plus untracked paths, not untracked file contents. Plan 2 must extend the digest before it is used for stale-comment guards.

**Execution note:** The first task creates the repository at `~/projects/dsh-code-review`. If a directory already exists, stop and ask the human instead of overwriting it.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-10-26-code-review-foundation.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review the diff between tasks, and keep the current session's context clean. Use `superpowers:subagent-driven-development`.
2. **Inline Execution** — execute the tasks in this session with `superpowers:executing-plans`, pausing at the review checkpoints in this plan.

**Which approach?**

Do not start Task 1 until the human chooses an approach and confirms that `~/projects/dsh-code-review` does not already contain work that must be preserved.
