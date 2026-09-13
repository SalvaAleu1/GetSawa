# GetSawa production launch runbook

The repository can be technically complete while launch remains blocked. `npm run ops:launch-readiness` is the final evidence gate and must exit successfully from the exact production commit before launch approval.

## 1. Prepare evidence

Copy `docs/operations/LAUNCH_EVIDENCE.template.json` to `.ops/launch-evidence.json`. `.ops/` is gitignored. Do not set a gate to `passed: true` until the referenced evidence exists and has been reviewed. Use non-secret evidence IDs/paths/ticket references rather than credentials or customer data.

## 2. Mandatory gates

- Phase 26 runtime Lighthouse/mobile/accessibility/PWA evidence from Cloudflare staging/production.
- Phase 27 real database backup + isolated restore drill with measured RPO/RTO and reconciliation.
- Phase 28 Cloudflare staging deployment/runtime/cron/observability evidence.
- Phase 29 verified Vercel scheduler shutdown, Cloudflare `getsawa.app` cutover, webhook/scheduler/reconciliation proof.
- Prisma production migration status and reviewed migration deployment evidence.
- Security review including admin/MFA, secret permissions/rotation path, rate limits and audit/incident readiness.
- Legal approval of public Terms, Privacy and Refund policies for actual launch jurisdictions.
- Support contact/escalation channel configured and tested; `SUPPORT_EMAIL` must point to an actively monitored authorized mailbox before approval.
- Production monitoring/alerts configured with an independently tested notification.
- Operator handover covering rollback, DR, payment/domain reconciliation and provider escalation.

## 3. Provider scope

NameSilo, PayPal, Cloudflare and SMTP are required launch providers for the baseline domain-commerce platform. WHM hosting, OpenSRS email, AI and storage may remain disabled, but if any is sold or publicly enabled its evidence entry must be changed to `enabled: true` and pass acceptance first.

## 4. Approval command

```bash
cp docs/operations/LAUNCH_EVIDENCE.template.json .ops/launch-evidence.json
# attach/review real evidence and update the ignored JSON
npm run ops:launch-readiness
```

A non-zero exit means launch is blocked. Do not edit the checker or evidence requirements during a launch window to bypass a legitimate failure; resolve the underlying gate or explicitly change product scope before the window.

## 5. Post-launch watch

Run the production public monitor immediately after cutover and maintain a heightened watch on payments, registrar operations, reconciliation, provisioning and cron outcomes during the initial launch window. Keep the recorded rollback target available until stability is established.
