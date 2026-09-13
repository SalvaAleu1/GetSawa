# Deployment and data rollback rules

## Application rollback

Use a known-good immutable Cloudflare deployment/version once Phase 28 establishes the environment. Record the bad commit/deployment and rollback target. Validate homepage, login, representative authenticated page, critical API health, webhook routes and cron execution after rollback.

## Database migrations

Do not automatically reverse a production migration. Prisma migrations may contain data transformations that cannot be safely rolled back. Prefer forward fixes unless a reviewed restore/PITR is safer. Always pair application rollback decisions with schema compatibility review.

## Provider side effects

Code rollback does not undo a PayPal capture, domain registration/renewal/transfer, hosting account, mailbox, Cloudflare zone/domain attachment, payout or webhook delivery. Reconcile external provider state independently.

## Cutover rollback

Phase 29 must keep Vercel/previous production available during the validation window. DNS/route rollback is allowed only when it does not send webhooks or scheduled jobs to two active mutation-capable deployments simultaneously. Exactly one production scheduler/webhook authority should be active.
