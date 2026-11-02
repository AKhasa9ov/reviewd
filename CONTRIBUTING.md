# Contributing

Thanks for helping improve `dsh-code-review`. The project is a pnpm/TypeScript monorepo:
a dependency-free core, an HTTP daemon/CLI, a React UI, a standalone web app and a DSH
Cordis bundle.

## Development setup

- Node.js 22.23+ and pnpm 11.22 (`corepack` or `npm install -g pnpm@11.22.0`).
- Git 2.39+ for the integration tests.
- Chromium for the browser tests: `pnpm exec playwright install chromium`.
- Docker 26+ with Compose v2 for the container gates.

```bash
pnpm install
pnpm verify          # build, format check, lint, typecheck, unit/integration tests, build
pnpm test:e2e        # build + Playwright UI/a11y suite
```

`pnpm verify` must be green before a pull request. Browser and Docker gates are required
when the change touches the UI, static serving, the daemon, deployment files or packaging.

## Workflow

1. Open an issue or describe the change and its user-visible effect.
2. Work in a focused branch. Keep commits small and scoped.
3. Use TDD where practical: write the failing test, run it, implement the minimum, then
   run the focused suite and the full gates.
4. Add or update tests for every behavior change. A test that only exercises a mock of the
   code under test is not enough for a safety or persistence change.
5. Update `README.md`, `docs/`, `CHANGELOG.md` or `.env.example` when behavior, setup or
   security assumptions change.
6. Open a pull request with the commands you ran and their results. Do not claim a gate
   passed without output.

## Commit style

Use imperative, scoped subjects:

```text
feat(core): re-anchor comments across renamed files
fix(server): reject cross-origin cookie mutations
docs: document token rotation
test(ui): cover keyboard-only comment flow
chore: bump playwright
```

One logical change per commit. Do not mix formatting-only churn with behavior changes.

## Code rules

- `packages/core` uses Node built-ins only and must not import React, Cordis, DSH or
  `node:http`. Business logic stays out of transports.
- Validate every path against the repository root; never follow a symlink outside it.
- Treat reviewer output, comments and markdown as untrusted data. Do not add
  `dangerouslySetInnerHTML` for user content.
- Never log tokens, authorization headers or diff bodies.
- Do not add a runtime dependency without a strong reason. The current runtime surface is
  Node built-ins plus React as a UI peer.
- Keep the event log append-only. Rounds and snapshots are immutable; comments are never
  physically deleted.
- Preserve the public JSON/CLI contracts; add fields instead of renaming or silently
  changing semantics.

## Tests and evidence

- Unit/integration tests live next to the package under `packages/*/test`.
- Browser tests live in `tests/e2e` and use a real daemon + temporary git repository.
- Docker gates are D1–D7 in the plan; record commands and tails under
  `.superpowers/sdd/<plan>/docker/` when doing a release-ready pass.
- For UI changes, attach a screenshot or a short recording. For accessibility changes, run
  `pnpm test:a11y` and report serious/critical findings.

## Publishing

The canonical registry is [npmjs.com](https://www.npmjs.com/). The public packages keep the
`@dsh-code-review/*` scope for continuity with the existing package names. The release
order is `core` → `server` → `dsh`; the DSH package depends on the other two.

```bash
pnpm --filter @dsh-code-review/core publish --access public
pnpm --filter @dsh-code-review/server publish --access public
pnpm --filter @dsh-code-review/dsh publish --access public
```

npm requires either an interactive one-time password or a **granular access token with
Bypass 2FA** and read/write access to the package scope. A token that can authenticate but
cannot bypass 2FA fails with `E403` even when its account owns the scope.

This project does not publish to GitHub Packages. GitHub Packages requires the npm package
scope to match a GitHub user or organization, and consumers need registry authentication
even for public packages. The current scope has no matching GitHub owner, so GitHub Packages
would add a consumer setup step without replacing npmjs. See
[Working with the npm registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-npm-registry).

Never commit `.npmrc`, a token or a registry credential. Rotate a token immediately if it
leaks.

## Security reports

Do not open a public issue for a vulnerability. See [SECURITY.md](SECURITY.md).

## License

By contributing you agree that your contribution is licensed under the MIT License.
