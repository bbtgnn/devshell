#!/usr/bin/env bash
# Real Bun CLI file into bin/bun (never a directory named bun).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$ROOT/bin/bun"
mkdir -p "$ROOT/bin"

if [[ -n "${DEVSHELL_BUN_PATH:-}" && -f "${DEVSHELL_BUN_PATH}" ]]; then
  SRC="$DEVSHELL_BUN_PATH"
elif [[ -n "${PROTOTYPE_BUN_PATH:-}" && -f "${PROTOTYPE_BUN_PATH}" ]]; then
  SRC="$PROTOTYPE_BUN_PATH"
elif command -v bun >/dev/null 2>&1; then
  SRC="$(command -v bun)"
else
  echo "No bun on PATH and DEVSHELL_BUN_PATH unset." >&2
  exit 1
fi

if [[ -d "$SRC" ]]; then
  echo "Refusing directory named bun: $SRC" >&2
  exit 1
fi

cp -f "$SRC" "$DEST"
chmod +x "$DEST"
echo "Vendored bun → $DEST"
file "$DEST"
"$DEST" --version
