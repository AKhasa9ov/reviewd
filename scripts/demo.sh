#!/usr/bin/env bash
# Create a disposable git repository, start a local reviewd, create a review and
# print the URLs. Everything lives under a temporary directory and is removed when
# this script exits (Ctrl-C stops the daemon and cleans up).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

for cmd in git node openssl; do
  command -v "$cmd" >/dev/null 2>&1 || {
    printf 'demo: required command not found: %s\n' "$cmd" >&2
    exit 1
  }
done

if [[ ! -f packages/server/dist/reviewd.js || ! -f packages/web/dist/index.html ]]; then
  printf 'demo: building workspace...\n'
  pnpm build
fi

TMP="$(mktemp -d "${TMPDIR:-/tmp}/reviewd-demo.XXXXXX")"
REPO="$TMP/repo"
STORE="$TMP/store"
LOG="$TMP/reviewd.log"
PID=""

cleanup() {
  if [[ -n "$PID" ]] && kill -0 "$PID" 2>/dev/null; then
    kill -TERM "$PID" 2>/dev/null || true
    wait "$PID" 2>/dev/null || true
  fi
  rm -rf "$TMP"
}
trap cleanup EXIT INT TERM

mkdir -p "$REPO/src" "$STORE"
git init -q -b main "$REPO"
git -C "$REPO" config user.email demo@example.test
git -C "$REPO" config user.name "reviewd demo"
printf 'export function answer(): number {\n  return 1;\n}\n' >"$REPO/src/app.ts"
printf 'export const name = "demo";\n' >"$REPO/src/name.ts"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m "base"
git -C "$REPO" branch base
git -C "$REPO" checkout -q -b feature
printf 'export function answer(): number {\n  return 2;\n}\n' >"$REPO/src/app.ts"
printf 'export const name = "reviewd";\n' >"$REPO/src/name.ts"
git -C "$REPO" add -A
git -C "$REPO" commit -q -m "feature work"

TOKEN="$(openssl rand -hex 32)"
CODE_REVIEW_TOKEN="$TOKEN" \
CODE_REVIEW_STORE="$STORE" \
CODE_REVIEW_HOST=127.0.0.1 \
CODE_REVIEW_PORT=0 \
  node packages/server/dist/reviewd.js >"$LOG" 2>&1 &
PID=$!

BASE=""
for _ in $(seq 1 120); do
  BASE="$(sed -n 's/^reviewd listening on \(http:\/\/127\.0\.0\.1:[0-9][0-9]*\)$/\1/p' "$LOG" | head -n 1)"
  [[ -n "$BASE" ]] && break
  if ! kill -0 "$PID" 2>/dev/null; then
    printf 'demo: reviewd exited before listening:\n' >&2
    cat "$LOG" >&2
    exit 1
  fi
  sleep 0.1
done
if [[ -z "$BASE" ]]; then
  printf 'demo: reviewd did not become ready:\n' >&2
  cat "$LOG" >&2
  exit 1
fi

echo "reviewd: $BASE"
echo "token:   $TOKEN (ephemeral; use it at $BASE/auth)"
echo "repo:    $REPO (base..feature)"

RESPONSE="$(BASE="$BASE" TOKEN="$TOKEN" REPO="$REPO" node --input-type=module <<'NODE'
const { BASE, TOKEN, REPO } = process.env;
const response = await fetch(`${BASE}/api/reviews`, {
  method: 'POST',
  headers: {
    authorization: `Bearer ${TOKEN}`,
    'content-type': 'application/json',
  },
  body: JSON.stringify({
    repoRoot: REPO,
    title: 'Demo: base..feature',
    scope: { kind: 'range', baseRef: 'base', headRef: 'feature' },
    reviewer: { backend: 'none' },
  }),
});
const text = await response.text();
if (!response.ok) {
  console.error(`create review failed: ${response.status} ${text}`);
  process.exit(1);
}
process.stdout.write(text);
NODE
)"

URL="$(BASE="$BASE" RESPONSE="$RESPONSE" node -e 'const value = JSON.parse(process.env.RESPONSE); const url = String(value.url ?? `/review/${value.review.id}`); process.stdout.write(url.startsWith("http") ? url : `${process.env.BASE}${url}`);')"
echo "review:  $URL"
echo
echo "Open the URL, sign in with the token, add a line comment, then submit."
echo "Press Ctrl-C to stop the daemon and delete the temp repository/store."
wait "$PID"
