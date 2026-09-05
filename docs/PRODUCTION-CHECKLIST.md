# GetSawa Production Checklist

## Application
- [ ] Production domain configured
- [ ] PostgreSQL database configured
- [ ] Authentication/session secrets configured
- [ ] MFA encryption secret configured
- [ ] PayPal production credentials configured
- [ ] NameSilo production credentials configured
- [ ] Anthropic/AI credentials configured
- [ ] Transactional email credentials configured
- [ ] Hosting provider credentials configured

## Security
- [ ] Admin MFA enabled
- [ ] Recovery procedure tested
- [ ] Session revocation tested
- [ ] Cron secret configured
- [ ] Webhook signatures verified
- [ ] Sensitive credentials excluded from logs

## Operations
- [ ] Domain synchronization cron enabled
- [ ] Renewal reminder cron enabled
- [ ] Auction closing cron enabled
- [ ] Provider failures visible to operators
- [ ] Billing renewal lifecycle monitored
- [ ] Database backups enabled

## Launch gate

Do not label domains, payments, hosting, email, or AI services LIVE until the required production credentials are configured and a real end-to-end test succeeds.
