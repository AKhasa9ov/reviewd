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
- `truncated` — content was omitted by the snapshot-wide content budget or because the file
  lies beyond the diff cap; no lines and no hash.
- `reason` — `"unreadable"` when a per-file read failed (for example `EACCES` or an `ENOENT`
  race), or `"diff-truncated"` when metadata was recovered after the file fell beyond the
  diff cap. The file stays visible and the snapshot continues.

`contentHash` is a SHA-256 of the raw bytes when content was retained. It is `null` for
`--no-content`, oversized, ignored, budget/diff-truncated and unreadable entries, and for
submodules. `--no-content`, ignored files, oversized files and files recovered from raw
metadata do not trigger content reads; budget truncation, diff backfill and unreadable files
add warnings.

`--worktree` diffs the base against the working tree (staged, unstaged and, by default,
untracked files; `--no-untracked` excludes untracked files). `--commit <sha>` diffs a commit
against its first parent; a root commit uses the empty tree, while a commit whose parent is
missing (for example a shallow boundary) fails with a fetch/unshallow error instead of
silently pretending every file was added. `--two-dot`, `--max-files`, `--max-lines` and
`--ignore <glob>` are available for large repositories. `--max-files` caps reviewable files;
ignored entries remain visible and never consume that cap.

Limits: 2 MiB of diff text, 500 files, 20 000 lines per file, 1 MiB of content per file and
64 MiB of content per snapshot, and untracked path listings at 8 MiB. `totals.truncated`
is true for diff, file-count, content-budget or untracked-listing truncation. A file cut by
the diff cap remains visible as an `oversized`
synthetic entry; every changed path wholly beyond the cap is recovered from one `--raw -z`
metadata call as a `truncated`/`diff-truncated` entry with no content or hash. Backfilled
entries report `binary:false` because their content was not read; treat `truncated` and
`reason:"diff-truncated"` as authoritative. Reports include
`diff-truncated`, `diff-file-truncated:<path>`, `diff-file-skipped:<path>`,
`files-truncated`, `content-budget-truncated`, `worktree-digest-truncated`,
`untracked-list-truncated`, `symlink-not-followed:<path>` and `unreadable:<path>` where
relevant. A truncated untracked listing continues with the paths returned before the cap.
`scope.worktreeDigestTruncated` is present when the digest itself had to be computed from
truncated status/diff output or an overflowing untracked path listing.

For a worktree, `worktreeDigest` also hashes untracked file contents. The digest is versioned
and length-framed: status/diff byte fields and per-file records carry explicit tags and byte
lengths, and per-file records distinguish regular files, symlinks and unreadable paths. Paths
are sorted by UTF-8 bytes; regular files are opened with `O_NOFOLLOW` and streamed from the
handle; symlinks hash their link target rather than the target contents; unreadable or raced
paths hash a stable marker. On Linux the opened descriptor is verified through
`/proc/self/fd/<fd>` against the precomputed repository realpath, so a parent-directory swap
cannot redirect the read. Platforms without procfs fall back to `realpath(pathname)`, which
retains the parent-symlink TOCTOU limitation. Both the digest and the snapshot cap their untracked path
listing at 8 MiB; digest overflow sets `worktreeDigestTruncated`, while snapshot overflow
adds `untracked-list-truncated` and marks totals truncated. Untracked content itself is not
capped.

The human output prefixes the change letter with `I` (ignored), `B` (binary) or `L`
(oversized), for example `IM src/a.ts` or `B? image.bin`.

Git commands are read-only. They run with `--no-pager`, fixed diff prefixes and config
overrides, no external diff or textconv drivers, `GIT_CONFIG_NOSYSTEM=1`, and with inherited
`GIT_DIR`/`GIT_WORK_TREE`/`GIT_INDEX_FILE` removed. Flags take a separate value
(`--base main`); `--flag=value` and `--` are not supported.

Exit codes: `0` success, `1` internal failure, `5` usage, git validation or an unsupported
diff (for example an ambiguous path header).
