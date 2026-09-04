# Security notes

Read this before accepting real payments.

## What's implemented

- **Passwords**: bcrypt, cost factor 12. Never logged, never returned by any
  API response.
- **Sessions**: signed JWT (HS256) carrying only a session ID; the session
  itself lives server-side in Postgres and is individually revocable
  (used on password reset and account suspension, which immediately deletes
  all of that user's sessions).
- **CSRF**: all state-changing routes are `POST`/`PUT`/`PATCH`/`DELETE` JSON
  APIs read via `fetch` with same-origin cookies (`SameSite=Lax`), which
  mitigates classic form-based CSRF. If you add any endpoint that accepts
  `multipart/form-data` or is callable from a third-party page, add explicit
  CSRF token verification.
- **Rate limiting**: in-process, per-bucket (`lib/rate-limit.ts`) on login,
  registration, password reset, domain search, and checkout creation. This
  is per-instance — if you deploy multiple instances behind a load balancer,
  replace this with a shared store (Redis) so limits apply globally.
- **Input validation**: every API route validates its body with Zod before
  touching the database.
- **SQL injection**: not applicable in the direct sense — all queries go
  through Prisma's parameterized query builder; nowhere does the app
  concatenate raw SQL from user input.
- **Secrets**: NameSilo and PayPal credentials are read from environment
  variables only, never stored in the database, never returned by any API
  response, never logged. `ProviderCredential` rows store only
  configuration *status*, not the secrets themselves.
- **Webhook verification**: the PayPal webhook handler calls PayPal's own
  signature-verification endpoint before processing anything, and is
  idempotent by `WebhookEvent.eventId`.
- **Authorization**: every `/api/dashboard/**` route re-checks that the
  resource (domain, order, invoice) belongs to the calling user — nothing
  relies on the client not asking for someone else's data. Every
  `/api/admin/**` route requires `adminRole` to be set, and several further
  restrict by specific role.
- **Security headers**: `X-Frame-Options: DENY`, `X-Content-Type-Options:
  nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, and a
  restrictive `Permissions-Policy` are set on every response
  (`next.config.js`).
- **Audit logging**: sensitive actions (login, order paid, DNS changes,
  domain lock/unlock, admin actions on customers/products/promotions) write
  an `AuditLog` row with actor, action, resource, and metadata.

## What you must add before/while scaling

- **MFA**: the `User.mfaEnabled`/`mfaSecret` columns exist in the schema but
  there is no TOTP enrollment/verification flow built yet.
- **Distributed rate limiting**: swap `lib/rate-limit.ts`'s in-memory map for
  Redis (or similar) if you run more than one app instance.
- **File uploads**: no object storage integration is wired up yet (spec
  section 70) — if you add logo/image uploads, validate MIME type,
  extension, and size server-side, and never trust a client-supplied
  content type.
- **Login throttling / brute-force protection**: current rate limiting is
  IP-based; consider adding account-based lockout with backoff for repeated
  failed logins against a single email.
- **Dependency scanning**: run `npm audit` (or a tool like Dependabot/Snyk)
  regularly once this is a real, deployed app with real users.
- **Penetration testing**: before processing real payments at any scale,
  have a third party test this, not just yourself.

## Things that are deliberately strict, on purpose

- Registration and login return the same generic error either way when an
  email doesn't exist vs. exists with a different password, to avoid
  account enumeration.
- Forgot-password always returns success regardless of whether the email
  exists, for the same reason.
- The PayPal webhook receiver returns HTTP 503 and refuses to process
  anything if `PAYPAL_WEBHOOK_ID` isn't set — an unverifiable webhook is
  treated as untrusted input, not as free money.
