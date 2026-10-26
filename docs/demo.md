# Demo

`scripts/demo.sh` creates a disposable git repository with a `base..feature` range,
starts a local `reviewd` on a random loopback port, creates a review and prints the
review URL and an ephemeral token.

```bash
pnpm install
pnpm build
scripts/demo.sh
```

Then:

1. Open the printed `review:` URL.
2. Sign in with the printed token (the token is only for this demo).
3. Add a line comment on `src/app.ts`.
4. Use **Submit** to produce feedback; with the `none` reviewer backend there is no model
   call and no network download.
5. Press Ctrl-C in the terminal. The daemon stops and the temporary repository/store are
   deleted.

The script needs `git`, `node` and `openssl`. It stays in the foreground on purpose: the
review and its URLs remain usable until you stop it. If the workspace has not been built,
the script runs `pnpm build` first.

For a persistent deployment, use Docker Compose instead:

```bash
cp .env.example .env
# replace CODE_REVIEW_TOKEN with: openssl rand -hex 32
docker compose up -d --build
```

See [ops.md](ops.md) for repository mounts, TLS, backups and upgrades.
