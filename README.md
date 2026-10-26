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
  "files": [
    {
      "path": "src/a.ts",
      "status": "modified",
      "binary": false,
      "oversized": false,
      "added": 2,
      "deleted": 1,
      "hunks": [],
      "contentHash": "…"
    }
  ],
  "totals": { "files": 1, "added": 2, "deleted": 1, "truncated": false },
  "warnings": []
}
```

`status` is always the actual change kind (`added`, `modified`, `deleted`, `renamed`,
`submodule` or `untracked`). Content conditions are separate flags:

- `binary` — NUL bytes or invalid UTF-8; `encoding` is `"unknown"` for the latter.
- `oversized` — the file exceeded the line or per-file content cap; no lines and no hash.
- `ignored` — matched `--ignore`; the file stays visible but has no content or hash.
- `truncated` — the snapshot-wide content budget was exhausted; no lines and no hash.
- `reason` — set to `"unreadable"` when a per-file read failed (for example `EACCES` or an
  `ENOENT` race); the file stays visible and the snapshot continues.

`contentHash` is a SHA-256 of the raw bytes when content was retained. It is `null` for
`--no-content`, oversized, ignored, budget-truncated and unreadable entries, and for
submodules. `--no-content`, ignored files and oversized files do not add warnings; budget
truncation and unreadable files do.

`--worktree` diffs the base against the working tree (staged, unstaged and, by default,
untracked files; `--no-untracked` excludes untracked files). `--commit <sha>` diffs a commit
against its first parent; a root commit uses the empty tree, while a commit whose parent is
missing (for example a shallow boundary) fails with a fetch/unshallow error instead of
silently pretending every file was added. `--two-dot`, `--max-files`, `--max-lines` and
`--ignore <glob>` are available for large repositories.

Limits: 2 MiB of diff text, 500 files, 20 000 lines per file, 1 MiB of content per file and
64 MiB of content per snapshot. A single file cut by the diff cap is still reported with its
path and kind as an `oversized` entry. Reports include `diff-truncated`,
`diff-file-truncated:<path>`, `files-truncated`, `content-budget-truncated`,
`worktree-digest-truncated`, `symlink-not-followed:<path>` and `unreadable:<path>` where
relevant. `scope.worktreeDigestTruncated` is present when the digest itself had to be
computed from truncated status/diff output.

The human output prefixes the change letter with `I` (ignored), `B` (binary) or `L`
(oversized), for example `IM src/a.ts` or `B? image.bin`.

Git commands are read-only. They run with `--no-pager`, fixed diff prefixes and config
overrides, no external diff or textconv drivers, `GIT_CONFIG_NOSYSTEM=1`, and with inherited
`GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` removed. Flags take a separate value
(`--base main`); `--flag=value` and `--` are not supported.

Exit codes: `0` success, `1` internal failure, `5` usage, git validation or an unsupported
diff (for example an ambiguous path header).
