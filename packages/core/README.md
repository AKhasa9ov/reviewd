# @dsh-code-review/core

Review state, lifecycle and reviewer contracts for [reviewd](../../README.md).

This package has no HTTP, React, Cordis or DSH imports. The daemon, CLI, browser UI and
harness integrations are adapters over it.

## Install

```bash
npm install @dsh-code-review/core
```

The package is part of the `reviewd` 0.1.0 release candidate. npm publication is pending
registry credentials; use the workspace build or a local tarball until then.

```bash
pnpm --filter @dsh-code-review/core pack --pack-destination /tmp
```

Requires Node.js 22+ and ESM.

## Exports

| Entry                           | Contents                                                                                         |
| ------------------------------- | ------------------------------------------------------------------------------------------------ |
| `@dsh-code-review/core`         | `ReviewStore`, `ReviewLifecycle`, `ReviewServiceImpl`, snapshots, diff types, feedback contracts |
| `@dsh-code-review/core/browser` | Browser-safe types and helpers without Node-only imports                                         |

The exact public surface is defined in [`src/index.ts`](src/index.ts). Internal files are
not a stable API; use the package entrypoints.

## Example

```ts
import {
  ReviewLifecycle,
  ReviewServiceImpl,
  ReviewStore,
  buildSnapshot,
} from '@dsh-code-review/core';

const store = await ReviewStore.open('/var/lib/code-review');
const lifecycle = new ReviewLifecycle(store);
const service = new ReviewServiceImpl({
  lifecycle,
  store,
  snapshots: { build: ({ repoRoot, scope }) => buildSnapshot({ repoRoot, scope }) },
});

const view = await service.create(
  {
    repoRoot: '/srv/repo',
    title: 'Feature review',
    scope: { kind: 'range', baseRef: 'main', headRef: 'feature' },
    reviewer: { backend: 'none' },
  },
  { actor: { name: 'Ada', kind: 'human' }, requestId: 'create-1' },
);
```

All mutations take `CallContext { actor, requestId? }`. Repeating the same `requestId` for
the same operation and review on one service instance returns the same result and appends
once.

## Related packages

- [`@dsh-code-review/server`](../server/README.md) — daemon and CLI
- [`@dsh-code-review/dsh`](../dsh/README.md) — DSH bundle
- [`@dsh-code-review/worker`](../worker/README.md) — worker lease loop

## Documentation

- [Review state](../../docs/reference/review-state.md)
- [Architecture](../../docs/architecture.md)
- [Worker protocol](../../docs/reference/worker-protocol.md)

## License

MIT
