# Quick start

reviewd is a self-hosted daemon with a browser review UI, a CLI and an authenticated HTTP
API. Choose the path that matches how you want to run it.

- [Docker](#docker) — fastest way to try the full UI.
- [Local Node](#local-node) — work from a source checkout.
- [DSH](#dsh) — use the native review panel and tools.
- [First review](#your-first-review) — what to click and what happens next.

## Prerequisites

| Path   | Requirements                                                    |
| ------ | --------------------------------------------------------------- |
| Docker | Docker Engine 26+ with Compose v2                               |
| Local  | Node.js 22+, pnpm 11+, `git`, `openssl`                         |
| DSH    | Node.js 22+, DSH 0.2.x, `git` on `PATH`                         |
| Agent  | A running daemon plus `CODE_REVIEW_URL` and `CODE_REVIEW_TOKEN` |

Review repositories must be visible to the daemon at the **same absolute path**. There is
no path translation and no repository upload.

## Docker

Generate a token, start the stack and check health:

```bash
TOKEN="$(openssl rand -hex 32)"
CODE_REVIEW_TOKEN="$TOKEN" CODE_REVIEW_PUBLIC_URL=http://127.0.0.1:3100 \
  docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health
```

Open <http://127.0.0.1:3100> and sign in with `$TOKEN`.

To keep the token across restarts:

```bash
cp .env.example .env
chmod 600 .env
# put CODE_REVIEW_TOKEN=<generated value> in .env
docker compose up -d
```

The default stack binds `127.0.0.1:3100` and only sees repositories you mount. To review a
host tree, keep the path identical inside and outside the container:

```bash
CODE_REVIEW_REPOS=/srv/repos \
  docker compose -f docker-compose.yml -f docker-compose.repo.yml up -d
```

Then create a review with `repoRoot: "/srv/repos/my-project"`.

> **Do not expose port 3100 directly to the public internet.** There is one shared token,
> no accounts and no token revocation list. Put TLS and network controls in front of it;
> see [Deploy reviewd](../guides/deploy.md).

## Local Node

```bash
pnpm install
pnpm build

export CODE_REVIEW_TOKEN="$(openssl rand -hex 32)"
export CODE_REVIEW_STORE=/tmp/code-review-store
node packages/server/dist/reviewd.js
```

The daemon prints its listener URL, normally <http://127.0.0.1:3100>. The same process
serves the API and the built SPA. Stop it with Ctrl-C.

If you prefer one command, the CLI starts the same server:

```bash
node packages/server/dist/cli.js serve \
  --store /var/lib/code-review \
  --public-url https://review.example
```

Install the published CLI with `npm install -g @sir_yami/reviewd-server`, then run
`review version`. In a source checkout use `node packages/server/dist/cli.js`.

### Disposable demo

`scripts/demo.sh` creates a temporary git repository, starts a daemon on a random loopback
port, creates a `base..feature` review and prints the URL and token:

```bash
pnpm install
pnpm build
scripts/demo.sh
```

The script stays in the foreground and deletes the temporary repository/store when you
stop it. See [Demo](demo.md) for the walkthrough.

## DSH

Install the bundle into the DSH web profile:

```bash
dsh plugin --profile web add @sir_yami/reviewd
```

Restart the profile so the Host routes, tools and loops load. Embedded mode starts
`reviewd` in-process and serves the review UI at `/code-review`; no separate daemon is
needed. See [DSH integration](../agents/dsh.md) for configuration, modes, worker behavior
and data retention.

From a local checkout, pack and install the tarball:

```bash
pnpm fat:verify
dsh plugin --profile web add /absolute/path/to/sir_yami-reviewd-0.2.0.tgz
```

## Your first review

1. Open the UI and sign in with the daemon token.
2. Choose **New review**.
3. Select a repository, a base branch and a head branch (or use the current worktree).
4. Choose a reviewer backend. `worker` needs a registered worker; `none` records a
   skipped report and lets you try the UI without a model.
5. Open the review, read the diff and add a line comment.
6. Use **Submit** with `Request changes` and a summary.
7. If a worker is connected, read its findings and accept or dismiss them.

The next agent pass can read the feedback with `review feedback <id> --wait --format json`
or the DSH `review_feedback` tool. See [Run a fix agent](../guides/run-a-fix-agent.md).

## Health and troubleshooting

```bash
curl -fsS http://127.0.0.1:3100/api/health
curl -fsS http://127.0.0.1:3100/api/version
```

`/api/health` probes store writability and git availability. A healthy process does not
mean a reviewer worker is registered. If the UI loads but mutations fail, check that
`CODE_REVIEW_PUBLIC_URL` exactly matches the browser origin.

More: [Troubleshoot](../guides/troubleshoot.md).
