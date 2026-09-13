# Phase 27 verification — backup, disaster recovery and operational runbooks

Status: repository implementation complete; live restore drill evidence is still required before Phase 27 can be marked fully verified.

## Repository controls implemented

- PostgreSQL custom-format backup script with restrictive permissions, SHA-256 checksum and retention cleanup.
- Isolated restore script that refuses `DATABASE_URL` as its target and requires an explicit isolation confirmation phrase.
- Restore-verification script checking critical commerce/identity tables and emitting a restricted evidence artifact.
- Manual provider reconciliation runner mapped to the same jobs as the Cloudflare scheduled worker.
- Deployment HTTP health verifier.
- Recovery objectives, restore sequence, provider recovery ordering, secret rotation, incident response and rollback runbooks.
- `.ops/` is excluded from Git so database dumps/restore evidence cannot be committed accidentally.

## Static verification

- All committed shell scripts pass `bash -n` syntax validation.
- Database restore is intentionally destructive only against the explicitly supplied isolated restore target.
- Secrets are accepted through environment/stdin paths and are not written into evidence by the scripts.
- Recovery documentation treats provider state as authoritative for external side effects.

## Mandatory live evidence before marking Phase 27 DONE

1. Run a real backup against the intended production-class database service.
2. Restore it into an isolated disposable database.
3. Run `verify-postgres-restore.sh` and Prisma migration/status checks.
4. Measure observed RPO and RTO and compare them with the launch objectives.
5. Run payment/domain/provisioning reconciliation against a safe staging/recovery environment.
6. Store the signed/reviewed drill record in the restricted operations evidence location.

No live database credentials are available to this repository session, so claiming that a restoration drill passed would be false. Phase 30 must treat missing restore evidence as a launch blocker.
