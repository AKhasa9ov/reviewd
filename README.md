# dsh-code-review

Harness-agnostic code review control plane: independent agent pre-review, line-anchored
human comments, round-to-round fix tracking and feedback delivery back to the initiating
agent session. See `docs/design.md`.

## Status

Plan 1 of 6: the git diff/snapshot foundation. Reviews, reviewer jobs, UI and the DSH
bundle are implemented in later plans.

## Development

```bash
pnpm install
pnpm verify
```

## Snapshot CLI

Build once, then inspect a repository without a daemon:

```bash
pnpm build
node packages/server/dist/cli.js diff \
  --repo /path/to/repo --base main --head HEAD --json > snapshot.json
```

The JSON shape is stable for Plan 1:

```json
{
  "schemaVersion": 1,
  "scope": { "kind": "range", "baseSha": "…", "headSha": "…", "worktreeDigest": "…" },
  "files": [{ "path": "src/a.ts", "status": "modified", "added": 2, "deleted": 1 }],
  "totals": { "files": 1, "added": 2, "deleted": 1, "truncated": false },
  "warnings": []
}
```

Use `--worktree` to diff the base against the working tree (including staged, unstaged
and, by default, untracked files; `--no-untracked` excludes them), `--commit <sha>` for a
single commit, and `--no-content` to omit full file content. `--two-dot`, `--max-files`,
`--max-lines` and `--ignore <glob>` are available for large repositories.

Limits: 2 MiB of diff text, 500 files and 20 000 lines per file. Truncation and skipped
content are reported in `warnings` (for example `diff-truncated`, `files-truncated`,
`symlink-not-followed:<path>`). Git commands are read-only and run with
`--no-ext-diff --no-textconv`; external diff drivers are never executed.
