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

Inspect a repository without a daemon:

```bash
pnpm build
node packages/server/dist/cli.js diff --repo /path/to/repo --base main --head HEAD --json
```
