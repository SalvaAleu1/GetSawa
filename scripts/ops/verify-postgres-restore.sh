#!/usr/bin/env bash
set -Eeuo pipefail

: "${RESTORE_DATABASE_URL:?RESTORE_DATABASE_URL must point to the isolated restored database}"

command -v psql >/dev/null 2>&1 || { echo "Required command not found: psql" >&2; exit 1; }

evidence_dir="${DR_EVIDENCE_DIR:-.ops/dr-evidence}"
mkdir -p "$evidence_dir"
evidence="$evidence_dir/restore-$(date -u +%Y%m%dT%H%M%SZ).txt"

query=$(cat <<'SQL'
WITH required(name) AS (
  VALUES ('User'), ('Domain'), ('Order'), ('Payment'), ('AuditLog'), ('Tld')
), status AS (
  SELECT name, to_regclass(format('public.%I', name)) IS NOT NULL AS present
  FROM required
)
SELECT name, present FROM status ORDER BY name;

SELECT
  (SELECT count(*) FROM "User") AS users,
  (SELECT count(*) FROM "Domain") AS domains,
  (SELECT count(*) FROM "Order") AS orders,
  (SELECT count(*) FROM "Payment") AS payments,
  (SELECT count(*) FROM "AuditLog") AS audit_logs;
SQL
)

{
  echo "GetSawa disaster-recovery restore verification"
  echo "verified_at_utc=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "target_database_fingerprint=$(printf '%s' "$RESTORE_DATABASE_URL" | sha256sum | cut -d' ' -f1)"
  echo
  psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -c "$query"
} | tee "$evidence"

missing=$(psql "$RESTORE_DATABASE_URL" -v ON_ERROR_STOP=1 -Atc "SELECT count(*) FROM (VALUES ('User'),('Domain'),('Order'),('Payment'),('AuditLog'),('Tld')) required(name) WHERE to_regclass(format('public.%I', name)) IS NULL;")
if [[ "$missing" != "0" ]]; then
  echo "Restore verification failed: $missing required tables are missing." >&2
  exit 1
fi

printf 'Restore verification passed. Evidence: %s\n' "$evidence"
