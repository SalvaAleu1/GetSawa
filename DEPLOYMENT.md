# Deployment

GetSawa is a standard Next.js 14 app and can be deployed anywhere that runs
Node.js 18.18+ and can reach a PostgreSQL database. These instructions are
generic; adapt them to your specific host (Vercel, Render, Railway, a plain
VPS, etc).

## 1. Provision infrastructure

- A PostgreSQL database (managed, e.g. RDS/Supabase/Neon/Railway, is
  strongly recommended over self-hosting for a production launch).
- A place to run the Next.js server (any Node host, or a platform with
  first-class Next.js support).

## 2. Set environment variables

Copy every variable from `.env.example` into your host's environment
variable / secrets manager. At minimum for a real launch:

- `DATABASE_URL`
- `SESSION_SECRET`
- `APP_URL` (your real production URL, used for email links and PayPal
  return URLs)
- `NAMESILO_API_KEY`
- `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_MODE=live`,
  `PAYPAL_WEBHOOK_ID`
- `SMTP_*` (so verification/receipt emails actually send)

Never commit `.env` to source control.

## 3. Run database migrations

```bash
npm run prisma:migrate    # runs `prisma migrate deploy`
npm run db:seed           # optional — adds a starter (inactive) TLD list
```

## 4. Create your first admin

Set `INITIAL_ADMIN_EMAIL` / `INITIAL_ADMIN_PASSWORD` as one-time environment
variables (or run locally against the production `DATABASE_URL`), then:

```bash
npm run setup:admin
```

Remove those two variables afterward.

## 5. Build and start

```bash
npm run build
npm run start
```

## 6. Configure PayPal webhooks

Point PayPal's webhook at `https://your-domain/api/webhooks/paypal` — see
`docs/PAYPAL.md`.

## 7. Go through the in-app checklist

Log into `/admin`:

1. **Providers** — both NameSilo and PayPal should show "Configured" and
   pass "Test connection".
2. **TLD Manager** — activate the TLDs you're launching with.
3. Place one real, small test order yourself end-to-end before announcing
   launch.

## HTTPS

Run behind HTTPS in production (most hosts handle this automatically). The
`next.config.js` sets `X-Frame-Options`, `X-Content-Type-Options`,
`Referrer-Policy`, and a restrictive `Permissions-Policy` on every response;
add HSTS at your reverse proxy / CDN layer if it isn't already applied
there.

## What this does NOT include

There's no Docker/Kubernetes manifest, CI/CD pipeline, or infrastructure-as-
code in this repo — the spec didn't require a specific hosting target, and
adding one would lock in an opinionated choice you didn't ask for. The app
itself has no assumptions about a specific platform beyond "Node.js +
Postgres reachable over the network."
