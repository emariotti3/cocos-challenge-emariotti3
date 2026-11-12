#!/bin/sh
# Apply schema migrations, optionally load the challenge dataset, then start.
# `exec` hands PID 1 to node so SIGTERM reaches the app for graceful shutdown.
set -eu

echo "[entrypoint] applying migrations"
node dist/database/cli.js up

if [ "${RUN_SEED:-true}" != "false" ]; then
  echo "[entrypoint] loading seed dataset (RUN_SEED=${RUN_SEED:-true})"
  node dist/database/cli.js seed
fi

echo "[entrypoint] starting api"
exec node dist/main.js
