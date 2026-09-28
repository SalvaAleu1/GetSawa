# CloudSawa deployment

The authoritative deployment and launch procedure is maintained in the repository-root `DEPLOYMENT.md`.

The current sequence is intentionally **pre-domain first**: deploy CloudSawa to Cloudflare `workers.dev`, verify the Neon database and live providers, purchase `cloudsawa.com` only at the final cutover stage, activate the guarded custom-domain configuration, and then complete one controlled real domain purchase before public launch.

Do not follow older phase-verification documents as deployment instructions; they are historical implementation records.
