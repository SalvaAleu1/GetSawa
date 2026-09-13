#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

: "${DATABASE_URL:?DATABASE_URL must point to the PostgreSQL database to back up}"
BACKUP_DIR="${BACKUP_DIR:-.ops/backups}"
BACKUP_PREFIX="${BACKUP_PREFIX:-getsawa}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-14}"

for command in pg_dump sha256sum date; do
  command -v "$command" >/dev/null 2>&1 || { echo "Required command not found: $command" >&2; exit 1; }
done

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]]; then
  echo "BACKUP_RETENTION_DAYS must be a non-negative integer." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup="$BACKUP_DIR/${BACKUP_PREFIX}-${timestamp}.dump"
checksum="$backup.sha256"
metadata="$backup.meta"
partial="$backup.partial"

cleanup() { rm -f "$partial"; }
trap cleanup EXIT

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-acl \
  --file="$partial"

mv "$partial" "$backup"
(
  cd "$BACKUP_DIR"
  sha256sum "$(basename "$backup")" > "$(basename "$checksum")"
)

cat > "$metadata" <<META
created_at_utc=$timestamp
format=postgres-custom
checksum_file=$(basename "$checksum")
retention_days=$RETENTION_DAYS
source=DATABASE_URL
META

if (( RETENTION_DAYS > 0 )); then
  find "$BACKUP_DIR" -type f \( -name "${BACKUP_PREFIX}-*.dump" -o -name "${BACKUP_PREFIX}-*.dump.sha256" -o -name "${BACKUP_PREFIX}-*.dump.meta" \) -mtime "+$RETENTION_DAYS" -delete
fi

printf 'Backup created: %s\nChecksum: %s\nMetadata: %s\n' "$backup" "$checksum" "$metadata"
printf 'Store the backup and checksum in the approved encrypted, access-controlled backup destination.\n'
