-- CloudSawa launch-safe TLD policy for the current NameSilo API.
-- These classic launch extensions can use standard registrar pricing.
-- Premium-capable extensions remain fail-closed until exact registry-premium
-- pricing can be verified before customer payment.

UPDATE "Tld"
SET "supportsPremium" = false
WHERE "extension" IN ('com', 'net', 'org')
  AND "supportsPremium" = true;
