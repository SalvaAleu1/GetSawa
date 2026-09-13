# Vercel to Cloudflare production cutover

This is a controlled scheduler + traffic handoff. Do not treat it as a normal deploy.

## Current scheduler difference

The committed Vercel configuration has 8 scheduled jobs. Cloudflare production has 12: the same 8 plus message delivery, developer webhook delivery, security maintenance and analytics snapshots. `node scripts/ops/check-cutover-config.mjs` proves the Vercel schedules are covered and that all 12 Cloudflare expressions have Worker mappings.

The old Vercel project is not bound to this repository by `.vercel/project.json`, and the connected Vercel account did not expose a project/team during the Phase 29 preparation session. Therefore the operator must identify the real production Vercel project from the Vercel dashboard before scheduler shutdown. Never disable an unrelated project by name guesswork.

## Preconditions — all mandatory

1. Phase 27 has real restore-drill evidence meeting the agreed RPO/RTO target.
2. Phase 28 staging is live and has passed Cloudflare runtime, migration, cron, observability, Phase 26 accessibility/performance/PWA and representative product tests.
3. `getsawa-production` has been built/uploaded and verified on a non-production endpoint before the production Custom Domain is activated.
4. Production Cloudflare runtime/build variables and secrets are complete.
5. PayPal webhook ID/credentials, NameSilo, database, SMTP and every launch-enabled product provider have passed their Phase 30 preflight tests.
6. The last-known-good Vercel deployment and its DNS configuration are recorded for rollback.
7. The Cloudflare rollback deployment/version ID is recorded.
8. A change window is open and a single operator controls scheduler/DNS changes.

## Cutover sequence

1. Announce/freeze nonessential production changes.
2. Run `node scripts/ops/check-cutover-config.mjs` from the exact commit to deploy.
3. Verify Vercel is healthy one final time and record the current production deployment identifier.
4. Disable the **live production Vercel cron scheduler**. Because the actual legacy Vercel project is not repository-bound, do this on the verified project/dashboard rather than assuming a Git push changed it.
5. Confirm no Vercel cron execution starts after the recorded handoff timestamp.
6. If `getsawa.app` currently has a DNS record that conflicts with a Cloudflare Worker Custom Domain, record it for rollback and remove it only at this point. Cloudflare Custom Domains require the hostname to be in an active Cloudflare zone and cannot be created over a conflicting CNAME.
7. Export the production deployment acknowledgements:

```bash
export APP_URL=https://getsawa.app
export WEBSITE_PLATFORM_HOST=getsawa.app
export CLOUDFLARE_WORKER_SERVICE_NAME=getsawa-production
export CONFIRM_PRODUCTION_DEPLOY=DEPLOY_GETSAWA_PRODUCTION
export CONFIRM_PRODUCTION_WORKER_UPLOAD=UPLOAD_PRODUCTION_WORKER
export CONFIRM_PRODUCTION_CUTOVER=SWITCH_GETSAWA_TO_CLOUDFLARE
export APPLY_DATABASE_MIGRATIONS=APPLY_REVIEWED_MIGRATIONS
npm run deploy:cloudflare:production
```

Do not paste actual secret values into shell history; inject them through the approved secret mechanism.

8. The production deploy attaches the `getsawa.app` Custom Domain and enables all 12 Cloudflare crons. The deploy wrapper immediately runs `verify-production-cutover.sh`.
9. Verify TLS, root/login/domains/products/support, `robots.txt`, sitemap, manifest, and the Worker runtime headers.
10. The verifier sends `{}` to the PayPal webhook endpoint. A configured receiver must return HTTP 400 for that invalid event; 503 blocks launch and means provider/webhook configuration is incomplete. The probe cannot create a payment because it has no event ID/type/signature.
11. Run `payment-reconciliation`, then `domain-sync`, then `provisioning-recovery` using the Phase 27 manual reconciliation tool. Review results before resuming normal mutations.
12. Observe at least one scheduled Cloudflare job execution and confirm the job outcome appears in observability.
13. Verify real checkout only with a controlled approved transaction/domain scenario; reconcile the provider result before any retry.
14. Leave the prior Vercel deployment available for rollback during the validation window, but keep its scheduler disabled.

## Webhooks

The public PayPal webhook hostname remains `https://getsawa.app/api/webhooks/paypal`, so a hostname change is not required if PayPal already targets that URL. The origin changes from Vercel to Cloudflare. Verify signature validation and event processing after cutover, and make sure no firewall/access policy blocks PayPal.

## Rollback

Rollback is triggered by payment integrity risk, domain/provider divergence, authentication failure, sustained 5xx errors, missing production secrets, migration incompatibility, webhook failure or inability to prove the Cloudflare runtime.

1. Freeze customer mutations that could duplicate external side effects.
2. Disable Cloudflare production cron triggers before re-enabling the previous scheduler.
3. Restore the previously recorded DNS/route configuration so `getsawa.app` reaches the last-known-good Vercel deployment.
4. Verify Vercel production health.
5. Re-enable the Vercel scheduler only after Cloudflare schedules are disabled.
6. Reconcile payments/domains/provisioning; code/DNS rollback does not undo provider side effects.
7. Preserve logs and perform an incident review before another cutover attempt.

Exactly one production scheduler authority must be active at all times.
