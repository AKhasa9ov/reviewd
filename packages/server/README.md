# @sir_yami/reviewd-server

The `reviewd` HTTP daemon, worker/lease service and `review` CLI for
[reviewd](../../README.md).

The server exposes the authenticated API, the worker/lease service and the `review` CLI.
In a source checkout and the Docker image it also serves the built review SPA. It is a
single-tenant, self-hosted service: one shared token, no account system.

## Install

```bash
npm install -g @sir_yami/reviewd-server
review version
```

The package is part of the published `reviewd` 0.1.x release (`0.1.1`). From a source checkout use
`node packages/server/dist/cli.js` after `pnpm build`.

Requires Node.js 22+ and `git`. The daemon is ESM.

## Run

```bash
export CODE_REVIEW_TOKEN="$(openssl rand -hex 32)"
export CODE_REVIEW_STORE=/var/lib/code-review
reviewd
# or
review serve --store /var/lib/code-review --host 127.0.0.1 --port 3100
```

> The npm tarball ships the daemon and CLI, not the built SPA. `reviewd` still serves the
> API and a fallback page. Use the Docker Compose stack for the full standalone UI, set
> `CODE_REVIEW_WEB_DIR` to a built `packages/web/dist`, or use the DSH bundle's panel.

The default listener is `127.0.0.1:3100`. In a source checkout or Docker image the daemon
serves the SPA at `/` and the API under `/api`. Keep the listener on loopback or a private
network and terminate TLS at a reverse proxy.

### Environment

| Variable                 | Required | Meaning                                                       |
| ------------------------ | -------- | ------------------------------------------------------------- |
| `CODE_REVIEW_TOKEN`      | yes      | 32+ byte bearer token; never logged                           |
| `CODE_REVIEW_STORE`      | no       | Store root; defaults to the platform data directory           |
| `CODE_REVIEW_HOST`       | no       | Listener host; default `127.0.0.1`                            |
| `CODE_REVIEW_PORT`       | no       | Listener port; default `3100`                                 |
| `CODE_REVIEW_PUBLIC_URL` | no       | Browser origin used for links and same-origin mutation checks |
| `CODE_REVIEW_WEB_DIR`    | no       | Built SPA directory; defaults to `packages/web/dist`          |

`CODE_REVIEW_PUBLIC_URL` must match the browser origin exactly, including scheme and port.

## CLI

The package exposes both binary names:

- `reviewd` — the daemon entrypoint;
- `review` — the local snapshot and remote control CLI.

```bash
review diff --repo /srv/repo --base main --head HEAD --json
review start --repo /srv/repo --base main --reviewer worker --json
review status <id> --json
review feedback <id> --wait --format json
review comments list <id> --json
review refresh <id>
review health
```

The CLI has no `comments resolve` subcommand in this release; resolve through the HTTP
route or the DSH tool. Full command and exit-code reference:
[docs/reference/cli.md](../../docs/reference/cli.md).

## Docker

The repository root has a non-root Docker image and Compose stack:

```bash
docker compose up -d --build
curl -fsS http://127.0.0.1:3100/api/health
```

See [Deploy reviewd](../../docs/guides/deploy.md) for repository mounts, TLS, token
rotation, backups and retention.

## API and state

- [HTTP API](../../docs/reference/http-api.md)
- [Review state](../../docs/reference/review-state.md)
- [Worker protocol](../../docs/reference/worker-protocol.md)
- [SECURITY.md](../../SECURITY.md)

## License

MIT
