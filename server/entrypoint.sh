#!/bin/sh
set -e

PB="pocketbase --dir=/pb_data --migrationsDir=/pb_migrations"

# Optional: create/update the superuser from env, so no install link is needed.
if [ -n "$PB_ADMIN_EMAIL" ] && [ -n "$PB_ADMIN_PASSWORD" ]; then
    $PB superuser upsert "$PB_ADMIN_EMAIL" "$PB_ADMIN_PASSWORD"
fi

# shellcheck disable=SC2086
exec $PB serve --http=0.0.0.0:8090 --publicDir=/pb_public "$@"
