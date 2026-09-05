# GetSawa Phase 3F — Customer Account & Security Center

## Delivered

- Customer profile self-service with server-side validation.
- Secure password change requiring the current password.
- Password changes invalidate every existing session.
- Active-session inventory with IP, user-agent, creation and expiry timestamps.
- Individual session revocation with ownership enforcement.
- Sign-out-everywhere control.
- Customer notification center with unread counts and read-state management.
- Account & Security dashboard at `/dashboard/settings`.
- Audit records for profile changes, password changes and session security actions.
- Existing TOTP MFA remains the authoritative second-factor mechanism; this phase exposes its current status without weakening MFA requirements.

## Security rules

All account operations require an authenticated customer session. Session and notification records are always scoped to the authenticated user's ID. Passwords are hashed with the existing bcrypt-based authentication layer and are never returned by an API. Session tokens remain server-side hashed records and are never exposed to the customer UI.

## Production boundary

This phase contains no fake verification or security success states. External identity/KYC providers are not invented or simulated. Where a future regulated identity workflow is required, it must be connected to a real provider before being represented as verified.
