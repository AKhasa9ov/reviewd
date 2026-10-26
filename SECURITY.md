# Security

## Supported versions

The project is pre-1.0. Security fixes are made on `main`; there are no maintained release
branches yet. Use the latest commit or container image.

## Reporting a vulnerability

Please **do not** open a public issue. Report privately to the maintainers through the
repository's private security advisory form (GitHub: **Security → Advisories → Report a
vulnerability**) or by contacting the maintainers listed in the repository profile. Include:

- affected version/commit and deployment mode (Docker, host daemon, DSH bundle);
- a minimal reproduction or request sequence;
- the impact and any known workaround.

You can expect an acknowledgement within a few business days. Please give us time to
investigate and ship a fix before public disclosure.

## Threat model

`reviewd` is a single-tenant, bearer-token service. It is intended for a trusted team on a
private network or behind an authenticating reverse proxy. It is **not** a multi-tenant
SaaS: there are no user accounts, per-user permissions, audit identities or token
revocation lists.

Trust boundaries:

- **Daemon operator** controls the token, store, mounted repositories and reviewer command.
- **Reviewer backend** is untrusted output even when it runs locally. Findings and
  suggestions are data; they are never executed or applied automatically.
- **Review content** (diffs, comments, reviewer text) may contain secrets or hostile
  markdown. Access is gated by the token; logs must not contain diff bodies.
- **Repository mount** is read/write only because Apply suggestion is supported. A
  compromised daemon has the same filesystem access as the mount.

## Token handling

- `CODE_REVIEW_TOKEN` is required and must be at least 32 bytes. The daemon refuses to
  start without it.
- Generate with `openssl rand -hex 32`; keep it in `.env` with mode `0600` or a secret
  manager. Never commit it, bake it into an image, put it in a URL or paste it into a
  review.
- Browsers exchange the token for an HttpOnly, SameSite=Strict `cr_session` cookie.
  `Secure` is set when the public URL is HTTPS. Cookies are invalidated by token rotation.
- Machine clients send `Authorization: Bearer`. The DSH host keeps the token host-side and
  never sends it to the client bundle.
- Health and version endpoints are public; everything else is authenticated. Mutations
  reject cross-origin requests. There is no CORS.

If a token leaks: rotate it immediately, restart the daemon, update clients, and review the
audit trail for unexpected reviews, comments, submissions or GC operations.

## Network exposure

- Compose binds `127.0.0.1` by default. Do not change it to `0.0.0.0` on an untrusted
  network without TLS and firewall/VPN controls.
- Put TLS at a reverse proxy. `reviewd` itself is plain HTTP.
- The shared token has no per-device revocation; anyone with it can read every diff and
  comment and can mutate reviews. Treat the deployment as one trust domain.
- SSE/long-poll connections and review bodies are deliberately capped/rate-limited, but a
  token holder can still consume resources. Monitor disk and request rates.

## Reviewer and suggestion safety

- Reviewer backends are read-only by contract. The DSH worker denies `write`, `edit` and
  `apply_patch`; `CommandReviewer` runs an argv array with `shell:false` by default,
  captures output and checks `git status` before/after.
- Suggestions are shown as diffs and applied only by a human action against the expected
  snapshot. Stale/ambiguous suggestions are rejected rather than force-applied.
- Reviewer output is untrusted: validate enum fields, paths, line ranges, sizes and
  suggestion originals. Rejected items are retained as evidence, not executed.
- The command backend is a **trusted operator boundary**. If you configure a command, it
  runs with the daemon user's privileges; do not interpolate untrusted input into it.

## Git and path safety

- Git runs with inherited `GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` removed, fixed diff
  prefixes, no pager, no external diff/textconv and no hooks.
- Paths from requests are normalized and resolved against the repository root. Symlinks
  leading outside the root are not followed. On Linux, untracked file hashing verifies the
  opened descriptor through `/proc/self/fd`; non-procfs platforms retain a documented
  parent-symlink race.
- Diffs and comments can contain secrets. Do not paste production credentials into a
  review, and restrict access to the daemon and its backups.

## Container hardening

The provided image:

- runs as uid/gid `1000` (the `node` user), not root;
- has no default token and will exit if the token is absent;
- contains no agent CLIs, source, tests or dev dependencies;
- is compatible with a read-only root filesystem; Compose mounts `/data` and a tmpfs
  `/tmp`, drops all capabilities and sets `no-new-privileges`.

Review the Compose file before exposing it. The repository path mount can be made `:ro` if
you do not use Apply.

## Supply chain

- Dependencies are locked by `pnpm-lock.yaml`; CI uses `--frozen-lockfile`.
- Prefer the provided Dockerfile and pin the base image by digest in regulated
  environments. The public image is built from this repository's source.
- Run `pnpm audit` and rebuild periodically. The project keeps runtime dependencies
  minimal; React is a UI peer and is bundled only into the web artifacts.
- Do not install unreviewed Cordis/DSH bundles into a profile that can reach a production
  daemon.
