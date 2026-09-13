# Secret rotation runbook

Secrets are rotated one provider at a time. Values must never be committed, pasted into issue comments, logged, included in screenshots or stored in verification documents.

## General rotation procedure

1. Open an incident/change record identifying the secret by variable name only.
2. Confirm an emergency rollback path and an authorized operator/reviewer.
3. Create a new provider credential with the minimum required production permissions.
4. Store it in the target Cloudflare environment as a secret, not a plaintext repository variable.
5. Deploy or restart the affected environment and run the narrowest live health/provider test.
6. Monitor authentication failures and provider/webhook health.
7. Revoke the old credential at the provider only after the new credential is proven.
8. Record timestamp, variable name, operator, verification result and provider credential identifier/fingerprint where safe. Never record the secret value.

## High-impact variables

- `SESSION_SECRET`: rotating it invalidates current application sessions. Schedule or declare this impact; verify login/MFA after deployment.
- `CRON_SECRET`: rotate Cloudflare secret and deployed worker together; immediately verify one safe scheduled/manual job.
- `PAYPAL_CLIENT_ID` / `PAYPAL_CLIENT_SECRET`: create/activate the replacement in PayPal, update Cloudflare, verify OAuth plus a non-destructive provider check, then revoke old credentials.
- `PAYPAL_WEBHOOK_ID`: change only when the configured webhook resource changes; verify webhook signature validation before cutover.
- `NAMESILO_API_KEY`: verify account/quote/domain read operations before revoking the former key.
- `CLOUDFLARE_API_TOKEN`: issue least-privilege replacement, verify account/zone/Worker operations required by GetSawa, then revoke old token.
- `WHM_API_TOKEN`, OpenSRS email credentials, SMTP credentials, AI provider key and storage credentials: rotate independently and run their product-specific readiness check before old credential removal.

## Suspected compromise

For suspected credential compromise, revoke/disable the exposed credential first when the provider permits safe immediate replacement. Freeze dependent high-risk actions if replacement cannot be proven immediately. Review audit/application/provider logs for misuse and rotate any credential that shared the same exposure path.
