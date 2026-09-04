# Security notes

GetSawa is designed to fail closed around authentication, payments, registrar operations and provider provisioning.

## Implemented

- Passwords use bcrypt with cost factor 12.
- Sessions are server-side Postgres records referenced by signed HS256 JWTs; sessions can be individually or globally revoked.
- TOTP MFA is implemented with encrypted-at-rest secrets, 30-second SHA-1 codes and a ±1 time-step tolerance.
- Login requires the MFA code when the account has MFA enabled.
- Privileged access can be globally gated behind MFA with `REQUIRE_ADMIN_MFA=true` after administrators have enrolled.
- Login attempts are rate limited by IP and invalid MFA attempts are recorded in `LoginEvent`.
- State-changing JSON APIs use same-origin cookies with `SameSite=Lax`.
- API inputs are validated with Zod before database writes.
- Provider secrets remain in environment variables; provider status tables never store credentials.
- PayPal webhooks are verified and idempotent.
- Sensitive actions are audit logged.
- Security headers are applied globally.
- Health checks report database and provider configuration status without exposing secrets.

## Provider rule

Hosting and business-email products must remain unavailable until a real provider is configured. The repository does not contain fake provisioning, fake mailbox creation, or simulated provider success. `HOSTING_API_KEY`/`HOSTING_API_BASE_URL` and `EMAIL_PROVIDER_API_KEY` are deployment credentials for the actual selected vendors.

## Scaling rule

The current rate limiter is an in-process safety net. It cleans expired buckets and is appropriate for one application instance. Before running multiple application instances, replace its storage layer with a shared Redis/Upstash implementation while preserving the existing `checkRateLimit()` contract. Do not simply increase limits to compensate for distributed deployment.

## Upload rule

No user-controlled file upload is considered production-ready until server-side MIME sniffing, extension allowlisting, byte-size limits, object-storage isolation and malware/content scanning are added.

## Production checklist

1. Use a strong random `SESSION_SECRET` of at least 32 characters.
2. Use live PayPal credentials and verify the webhook ID.
3. Use a real registrar account and test domain registration/renewal/transfer flows.
4. Enroll every administrator in MFA, then set `REQUIRE_ADMIN_MFA=true`.
5. Configure real hosting and business-email vendors before activating those products.
6. Use a shared rate-limit store before horizontal scaling.
7. Run dependency/security scanning and an independent penetration test before significant live volume.
