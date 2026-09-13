# Incident response playbook

## Severity

- **SEV-1:** active security compromise; incorrect/duplicate money movement; widespread domain loss/corruption; production unavailable for most customers; destructive data corruption.
- **SEV-2:** major provider outage, checkout unavailable, important provisioning/reconciliation backlog, significant partial production outage.
- **SEV-3:** isolated customer/product defect with workaround and no systemic integrity risk.

## First 15 minutes

1. Name an incident lead and timestamp the incident.
2. Preserve evidence. Do not delete logs or retry uncertain destructive/financial operations blindly.
3. Determine whether customer mutations, checkout, provider provisioning or admin actions must be temporarily restricted.
4. Identify last-known-good deploy/database state and affected provider(s).
5. Communicate a factual internal status: observed impact, known/unknown scope, mitigation underway. Do not speculate.

## Payment integrity incident

Freeze automatic/manual retries that could double-charge. Use provider reconciliation and finance records to classify each payment as created/approved/captured/refunded/disputed/unknown before corrections.

## Registrar/domain incident

Disable affected registration/renewal/transfer actions when provider truth is unavailable. Preserve provider order/reference IDs and run domain synchronization before any retry.

## Database corruption/data loss

Freeze risky writes, follow `DISASTER_RECOVERY.md`, restore into an isolated database first, then reconcile provider state before production reopening.

## Credential compromise

Follow `SECRET_ROTATION.md`. Revoke compromised credentials where safe, rotate dependent secrets, inspect audit/provider logs and restrict high-risk operations during uncertainty.

## Bad deployment

Prefer Cloudflare's last-known-good deployment rollback once Phase 28 is live. If a schema migration is involved, application rollback alone may be unsafe; inspect migration compatibility before rollback.

## DNS/cutover incident

During Phase 29 keep the previous production deployment intact until the validation window closes. If the Cloudflare route/DNS cutover fails, restore the previous DNS/route target and validate webhooks/jobs against the restored endpoint.

## Closure

An incident is not closed until customer impact has ended, reconciliation gaps are cleared or explicitly tracked, monitoring is stable, manual corrections are audited, and follow-up actions have owners. SEV-1/2 incidents require a blameless post-incident review focused on controls and system behavior.
