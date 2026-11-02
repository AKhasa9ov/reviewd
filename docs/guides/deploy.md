# Deploy reviewd

This guide covers a self-hosted `reviewd` deployment with Docker Compose. The same daemon
can run directly on a host; see [HTTP API](../reference/http-api.md) for the process/CLI contract.

## 1. Prerequisites

- Docker Engine 26+ with Compose v2.
- A directory for review state. The Compose stack uses a named volume; back it up before
  upgrades.
- A repository tree visible at the **same absolute path** to the daemon, the DSH host and
  any reviewer worker. Review IDs refer to repository paths, not uploaded copies.
- A TLS-terminating reverse proxy for anything other than loopback use. `reviewd` speaks
  plain HTTP and has no account system.

## 2. First start

```bash
cp .env.example .env
chmod 600 .env
# Replace the placeholder. Never reuse this value for anything else.
openssl rand -hex 32
# Put the output in CODE_REVIEW_TOKEN=... in .env
docker compose up -d --build
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health
```

Open <http://127.0.0.1:3100>, sign in with the token, and create a review. The browser
exchanges the token for an HttpOnly `cr_session` cookie; API clients send
`Authorization: Bearer <token>`.

The stack binds `127.0.0.1:3100` by default. It is not reachable from the LAN until you
change the port binding or put a proxy in front of it.

### Repositories outside the container

The image does not see host repositories unless you mount them. Use the optional override
and keep the path identical on both sides:

```bash
mkdir -p /srv/repos
# make sure the container user (uid 1000) can read the tree
CODE_REVIEW_REPOS=/srv/repos \
  docker compose -f docker-compose.yml -f docker-compose.repo.yml up -d
```

Then create reviews with `repoRoot: "/srv/repos/my-project"`. If the DSH host sees
`/home/me/projects/my-project` instead, configure the DSH `repoHint` to the same path or
mount the tree at the path DSH uses. Do not rely on path translation: there is none.

## 3. TLS and reverse proxy

Terminate TLS at a reverse proxy and set `CODE_REVIEW_PUBLIC_URL` to the public HTTPS
origin. `reviewd` uses it for origin checks and sets `Secure` on the session cookie.
Forward the real client address only when the proxy is trusted; otherwise rate limiting
sees the proxy address. Do not enable `trustProxy` blindly on a directly exposed listener.

Caddy:

```caddyfile
review.example.com {
  reverse_proxy 127.0.0.1:3100
}
```

nginx:

```nginx
server {
  listen 443 ssl http2;
  server_name review.example.com;

  ssl_certificate     /etc/letsencrypt/live/review.example.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/review.example.com/privkey.pem;

  client_max_body_size 2m;

  location / {
    proxy_pass http://127.0.0.1:3100;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_read_timeout 90s;   # SSE/long-poll
    proxy_buffering off;
  }
}
```

Set `CODE_REVIEW_PUBLIC_URL=https://review.example.com` and restart. If the daemon itself
must trust a proxy's forwarded client IP, set `trustProxy` in the daemon configuration and
restrict the listener to the proxy network. The Compose stack exposes only loopback by
default, so the proxy should run on the host or in the same Docker network.

### LAN exposure warning

Binding to `0.0.0.0` exposes the review UI, diffs and comments to every host that can reach
the port. There is one shared token and no per-user accounts, audit identities or
revocation list. Use TLS, a firewall or VPN, and rotate the token if a device is lost. Do
not publish the port to the public internet without a proxy and network controls.

## 4. Token rotation

The token is read once at startup. Rotation is a restart, not a live operation:

1. Generate a new value: `openssl rand -hex 32`.
2. Update `CODE_REVIEW_TOKEN` in `.env` (mode `0600`).
3. `docker compose up -d` (or restart the service/process).
4. Verify `/api/health`, then update every DSH profile and CLI client.
5. Existing `cr_session` cookies are invalid because the cookie HMAC key changes.

There is no grace period with two valid tokens. If you need zero-downtime rotation, run a
second stack on another loopback port, switch clients, then retire the old one.

Never put the token in a URL, a screenshot, a review comment, an image label or a Compose
file that is committed. `.env` is gitignored.

## 5. Backup and restore

The entire state is the `/data` volume (event logs, snapshots, artifacts, lock). Back up
while the daemon is stopped, or accept a crash-consistent copy.

```bash
docker compose stop
docker run --rm \
  -v dsh-code-review_review-data:/data:ro \
  -v "$PWD/backups:/backup" \
  alpine:3.20 \
  tar -czf /backup/reviewd-$(date +%Y%m%d-%H%M%S).tar.gz -C /data .
docker compose start
```

Restore into a fresh volume, not over a live store:

```bash
docker compose down
docker volume create dsh-code-review_review-data-restore
docker run --rm \
  -v dsh-code-review_review-data-restore:/data \
  -v "$PWD/backups:/backup:ro" \
  alpine:3.20 \
  sh -c 'tar -xzf /backup/reviewd-YYYYmmdd-HHMMSS.tar.gz -C /data && chown -R 1000:1000 /data'
# Point the compose volume at the restored volume, or rename volumes while stopped.
```

Verify by starting a daemon against the restored volume and checking `/api/health` and a
known review. The event log is authoritative; `snapshot.json` is a replay cache and may be
rebuilt.

## 6. Retention and garbage collection

Reviews are retained until `review gc` removes reviews closed longer ago than the cutoff,
plus snapshots no remaining review references. GC rebuilds state from `events.jsonl` when a
`snapshot.json` cache is missing or stale, uses `closedAt` when present (falling back to
`createdAt` for older reviews), and never removes a snapshot that a still-present review
references:

```bash
# Against a local daemon, with the same token:
CODE_REVIEW_TOKEN=... review gc --older-than 90d

# Through the HTTP API:
curl -fsS -X POST \
  -H "Authorization: Bearer $CODE_REVIEW_TOKEN" \
  -H 'content-type: application/json' \
  -d '{"olderThanDays":90}' \
  http://127.0.0.1:3100/api/gc
```

Run a backup first if the audit trail matters. `gc` is irreversible. The default retention
target is 90 days; choose a shorter period only if your policy allows deleting review
history.

## 7. Upgrade and rollback

1. Back up `/data`.
2. Read `CHANGELOG.md` for release notes.
3. Pull/build the new image and recreate:

```bash
docker compose build --pull
docker compose up -d
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health
```

This release does not run automatic event-schema migrations. Read `CHANGELOG.md` for
release notes before upgrading; if startup fails, do not delete `/data` — restore the
previous image and the backup. A future release that changes the on-disk format must
document its migration or restore procedure here.

Rollback:

```bash
docker compose down
# restore the previous /data backup if the upgrade changed state
CODE_REVIEW_IMAGE=dsh-code-review:previous docker compose up -d
```

Keep the previous image tag locally (or in your registry) before upgrading.

## 8. Logs and health

Logs go to stdout/stderr as one JSON object per line. They must not contain tokens,
diff bodies or authorization headers.

```bash
docker compose logs -f --tail=200
docker compose ps
curl -fsS http://127.0.0.1:3100/api/health | jq .
```

`/api/health` is public and actively probes store writability and git availability in
addition to queue/job counts, worker count and version. It returns `503` with
`status: "degraded"` when the store cannot be written or git is unavailable, so the Docker
healthcheck fails instead of reporting a false positive. A `healthy` container means the
process is up, the store is writable and git works; it does not mean a reviewer worker is
online or that every review has been reviewed.

## 9. Failure recovery

| Symptom                                                         | Check / action                                                                                                                   |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Container exits at startup with `CODE_REVIEW_TOKEN is required` | Set the token in `.env` and restart. The image has no default.                                                                   |
| `lock` rejects startup                                          | Another daemon owns the store. Stop it; remove `lock` only after confirming its pid is not alive.                                |
| `torn-tail` warning                                             | The last event line was incomplete; the next append truncates it. Replay the review and verify it opens.                         |
| `store not writable` in health                                  | The `/data` volume is missing, read-only, or owned by another uid. It must be writable by uid 1000.                              |
| `git` errors for a mounted repo                                 | The path is not visible at the same absolute path, is not a git repository, or uid 1000 cannot read it.                          |
| Health is fine but reviews never get findings                   | No reviewer worker is registered. Start DSH with `worker: true` or configure the command backend.                                |
| Browser login loops                                             | `CODE_REVIEW_PUBLIC_URL` does not match the origin, or Secure cookies are used over plain HTTP. Fix the public URL or the proxy. |
| Disk full                                                       | Stop the daemon, free space, verify the event log is intact, then start. Run `gc` after a backup.                                |

## 10. Host process alternative

Without Docker:

```ini
# /etc/systemd/system/reviewd.service
[Unit]
Description=reviewd code review daemon
After=network.target

[Service]
Type=simple
User=review
EnvironmentFile=/etc/code-review/reviewd.env
ExecStart=/usr/bin/node /opt/dsh-code-review/packages/server/dist/reviewd.js
Restart=on-failure
RestartSec=2
NoNewPrivileges=true
ProtectSystem=strict
ReadWritePaths=/var/lib/code-review /tmp
PrivateTmp=true

[Install]
WantedBy=multi-user.target
```

Use a dedicated unprivileged user, a store directory writable only by that user, and a
reverse proxy for TLS. The same backup, retention and token rules apply.
