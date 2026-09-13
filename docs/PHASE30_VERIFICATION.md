# Phase 30 verification — launch readiness and final acceptance

Status: repository launch-readiness controls complete. **Production launch remains BLOCKED until the external evidence file passes every required gate.**

## Implemented

- Public `/support` help centre with safe self-service routes and a support-email contact only when `SUPPORT_EMAIL` is actually configured.
- Customer-facing legal pages are separated from internal legal-review warnings; legal counsel/launch-jurisdiction approval is now an internal evidence gate instead of public placeholder text.
- Fail-closed `check-launch-readiness.mjs` requiring both `passed: true` and a non-empty evidence reference for every mandatory gate and every enabled provider.
- Launch evidence template defaults every gate/provider acceptance to false.
- Baseline required providers: NameSilo, PayPal, Cloudflare and SMTP. Optional product providers become mandatory automatically when marked enabled in the evidence scope.
- Provider production acceptance matrix covering positive test, failure behavior and reconciliation.
- Production outside-in monitor for public routes, Cloudflare runtime identity and PayPal webhook configuration.
- Monitoring/severity guidance and launch/operator runbook.

## Static acceptance

Before merge, verify:

1. `node scripts/ops/check-launch-readiness.mjs` returns BLOCKED when the real `.ops/launch-evidence.json` is absent or incomplete.
2. `node scripts/ops/check-cutover-config.mjs` still passes.
3. `bash -n scripts/ops/monitor-production.sh` passes.
4. `/support` exists and sitemap/cutover health checks no longer reference a missing public page.
5. Public Terms, Privacy and Refund pages contain no internal draft/review-before-launch notice.

## Live acceptance

Phase 30's repository implementation can be complete without declaring GetSawa production-ready. Actual launch approval requires the ignored evidence file to contain reviewed proof for runtime quality, restore drill, Cloudflare staging, production cutover, migrations, security, legal, support, monitoring, operator handover and all enabled providers. The checker must pass from the exact release commit.
