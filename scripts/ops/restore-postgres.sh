#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must point to an isolated restore target}"
: "${BACKUP_FILE:?BACKUP_FILE must point to a PostgreSQL custom-format dump}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: $BACKUP_FILE" >&2
  exit 1
fi

for command in pg_restore psql sha256sum; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done

if [[ -n "${DATABASE_URL:-}" && "$RESTORE_DATABASE_URL" == "$DATABASE_URL" ]]; then
  echo "Refusing to restore into DATABASE_URL. Use an isolated verification/recovery database." >&2
  exit 1
fi

if [[ "${CONFIRM_ISOLATED_RESTORE:-}" != "RESTORE_ISOLATED_DATABASE" ]]; then
  echo "Set CONFIRM_ISOLATED_RESTORE=RESTORE_ISOLATED_DATABASE after verifying the target is isolated." >&2
  exit 1
fi

checksum_file="${BACKUP_FILE}.sha256"
if [[ -f "$checksum_file" ]]; then
  (
    cd "$(dirname "$BACKUP_FILE")"
    sha256sum --check "$(basename "$checksum_file")"
  )
else
  echo "Warning: ${checksum_file} is missing; restore evidence will not have checksum verification." >&2
fi

pg_restore \
  --dbname="$RESTORE_DATABASE_URL" \
  --clean \
  --if-exists \
  --no-owner \
  --no-acl \
  --exit-on-error \
  "$BACKUP_FILE"

psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 <<'SQL'
SELECT current_database() AS restored_database, now() AT TIME ZONE 'UTC' AS verified_at_utc;
SELECT to_regclass('public."User"') AS user_table,
       to_regclass('public."Domain"') AS domain_table,
       to_regclass('public."Order"') AS order_table,
       to_regclass('public."Payment"') AS payment_table,
       to_regclass('public."AuditLog"') AS audit_log_table;
SQL

printf 'Restore completed into the isolated target. Run verify-postgres-restore.sh before accepting the backup.\n'
