# Production monitoring and alerting

## Public/runtime monitor

`scripts/ops/monitor-production.sh` checks critical public pages, SEO/PWA endpoints, Cloudflare runtime/environment fingerprints and PayPal webhook readiness. Run it after deployment/cutover and from an independent external monitor after launch. A failed blocking check requires investigation; do not suppress a failing check merely to obtain a green launch gate.

## Operational signals

Review and alert on:

- sustained 5xx rate, latency and Worker exceptions;
- login/session/MFA error spikes;
- payment create/capture/refund/webhook failures and unresolved reconciliation mismatches;
- registrar quote/register/renew/transfer failures and domain-sync divergence;
- provisioning recovery backlog for hosting/email/security/publishing;
- scheduled-job failures or missing expected job runs;
- developer/transactional message delivery backlog;
- unusual admin/audit/security events;
- database availability, connection exhaustion and storage growth;
- provider credential/authentication failures.

## Initial severity targets

- **SEV-1:** duplicate/incorrect money movement, destructive domain/provider divergence, active compromise, broad data corruption, or production unavailable for most users. Page/notify immediately.
- **SEV-2:** checkout or major provider capability unavailable, significant elevated 5xx, stalled reconciliation/provisioning queue. Notify on-call promptly.
- **SEV-3:** isolated feature degradation with a safe workaround and no integrity risk. Track during operating hours.

Thresholds should be calibrated from real production traffic after launch. Integrity signals (duplicate charge/domain side effect, failed reconciliation, security compromise) are alert-worthy regardless of traffic volume.

## Ownership and evidence

Before launch, record the monitoring service, notification destination, on-call/operator owner, escalation backup and a tested alert event in the launch evidence file. Cloudflare observability is useful but is not a substitute for an independent outside-in availability check.
