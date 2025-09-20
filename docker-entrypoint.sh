#!/bin/sh
set -e

DATA_DIR="${REPOS_ROOT:-/app/data}"
mkdir -p "$DATA_DIR/users" "$DATA_DIR/auth" "$DATA_DIR/repos" "$DATA_DIR/audit"
[ -f "$DATA_DIR/users/users.json" ] || echo '[]' > "$DATA_DIR/users/users.json"
[ -f "$DATA_DIR/auth/refresh-tokens.json" ] || echo '[]' > "$DATA_DIR/auth/refresh-tokens.json"
[ -f "$DATA_DIR/audit/log.ndjson" ] || touch "$DATA_DIR/audit/log.ndjson"

exec node backend/dist/index.js
