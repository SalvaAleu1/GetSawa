# GetSawa disaster recovery and continuity runbook

This runbook defines the recovery order for GetSawa. It is operational guidance, not evidence that a live restore has already been performed.

## Recovery objectives

These are launch requirements. Phase 30 must reject launch if the selected production services cannot meet them.

| Capability | Target RPO | Target RTO | Recovery source |
| --- | ---: | ---: | --- |
| PostgreSQL commerce/identity data | <= 15 minutes | <= 4 hours | Provider PITR/snapshots, plus independent logical backup evidence |
| Payment/domain/provider convergence | Provider-source truth after DB recovery | <= 2 hours after app recovery | PayPal, registrar and provisioning reconciliation jobs |
| Application source | Effectively zero after pushed commit | <= 1 hour | GitHub + last-known-good Cloudflare deployment |
| Customer DNS/site publishing configuration | Same as PostgreSQL | <= 4 hours | Database + Cloudflare/provider reconciliation |
| Transactional/developer message delivery | Same as PostgreSQL | <= 4 hours | Durable delivery ledger + retry jobs |

RPO/RTO are objectives, not guarantees. If the database host does not provide PITR capable of the database target, production launch is blocked until an equivalent mechanism exists.

## Recovery priority

1. Stop or restrict risky mutations if data integrity is uncertain.
2. Preserve logs, webhook payload records, finance/audit records and provider references.
3. Restore the database into an isolated target and validate it before touching production.
4. Restore/deploy the last-known-good application artifact.
5. Reconcile payment state before permitting retries/refunds.
6. Reconcile registrar/domain and provisioning state.
7. Resume queues, scheduled jobs and customer mutations gradually.
8. Validate customer-facing health and administrative reconciliation dashboards.
9. Record incident timeline, recovery evidence and any manual corrections in the audit trail.

## Database backup

Use `scripts/ops/backup-postgres.sh` only from an approved operations host with PostgreSQL client tools. The script writes a PostgreSQL custom-format dump, SHA-256 checksum and metadata with restrictive local permissions. The generated `.ops` directory is never committed.

A local backup file is not a durable backup. Copy it to an approved encrypted destination with independent credentials/access controls. Do not place database dumps in GitHub, chat, tickets, public object storage or application logs.

## Restore drill

A restore drill must use an isolated disposable PostgreSQL database. Never point `RESTORE_DATABASE_URL` at production. When both source and target URLs are supplied, the restore script also compares the live server/database identity and refuses a match. The explicit isolation confirmation phrase remains mandatory.

Example flow:

```bash
export DATABASE_URL='...production-or-source-url...'
./scripts/ops/backup-postgres.sh

export BACKUP_FILE='.ops/backups/getsawa-YYYYMMDDTHHMMSSZ.dump'
export RESTORE_DATABASE_URL='...isolated-disposable-db...'
export CONFIRM_ISOLATED_RESTORE=RESTORE_ISOLATED_DATABASE
./scripts/ops/restore-postgres.sh

export DR_TARGET_LABEL='restore-drill-YYYYMMDD'
./scripts/ops/verify-postgres-restore.sh
```

Attach the generated `.ops/dr-evidence/restore-*.txt` to the restricted operations evidence store. `DR_TARGET_LABEL` must be a non-secret operations label; do not put connection strings, credentials, customer data or other secrets in the label/evidence.

## Production restoration

Production restoration is intentionally not automated by the repository script. After a verified isolated drill:

1. Declare an incident and establish a change freeze.
2. Capture current provider/payment state and the latest corrupted/failed database snapshot for forensics.
3. Select the recovery point based on the incident timeline.
4. Use the database provider's production restore/PITR mechanism into a new database or provider-supported safe restore target.
5. Apply only reviewed post-recovery migrations.
6. Point staging/recovery deployment at the restored database first; validate auth, domain portfolio, orders, invoices, payments, audit logs and admin access.
7. Switch production database connectivity through the approved secret/configuration change.
8. Run payment reconciliation, domain sync and provisioning recovery before reopening mutation-heavy traffic.
9. Validate scheduled jobs and webhook intake.
10. Reopen traffic in a controlled manner and monitor reconciliation gaps/error fingerprints.

## Evidence required for Phase 27/30

A real drill record must contain: backup timestamp, recovery point, backup checksum, non-secret isolated target label, restore start/end times, observed RPO/RTO, required-table checks, representative record checks, Prisma migration status, reconciliation results, operator/reviewer, anomalies and remediation. Secrets and customer data must not be copied into the evidence record.
