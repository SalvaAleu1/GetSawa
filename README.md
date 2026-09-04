# GetSawa

GetSawa is the production domain and digital-services platform being rebuilt around live provider integrations and a durable customer/admin system.

## Current platform architecture

- Next.js 14 App Router + TypeScript
- PostgreSQL + Prisma
- Tailwind CSS
- NameSilo server-side domain integration
- PayPal server-side checkout, capture, webhook verification and payouts
- Anthropic server-side AI website generation
- Secure sessions, password hashing, encrypted transfer auth codes, rate limiting and audit logging

The repository is being reconstructed from the uploaded project source and expanded into the complete GetSawa product. Provider-backed functionality must never be represented as active when its real provisioning integration is unavailable.

## Production principles

1. Browser clients never receive registrar/payment secrets.
2. Prices are calculated on the server from database configuration.
3. Domain availability is revalidated before registration.
4. Payment is confirmed from PayPal server-side before provisioning.
5. PayPal webhooks are signature-verified and idempotently recorded.
6. Provisioning is stateful and retryable; failed provisioning is never presented as successful.
7. Customer and administrator data are isolated by authorization checks.
8. All production routes return predictable JSON error responses.

## Application layout

The active application lives under `src/`, with App Router pages/API routes and shared business logic under `src/lib`. Prisma schema and database tooling live under `prisma/`.

## Development

```bash
npm install
npm run prisma:generate
npm run typecheck
npm run test
npm run build
```

Production deployment requires the database and provider environment variables described in `.env.example` and the deployment documentation.
