-- CloudSawa brand transition.
-- Historical migrations retain their original GetSawa-era checksums.
-- This forward migration updates persisted inventory identifiers safely.

ALTER TABLE "premium_inventory_meta"
  DROP CONSTRAINT IF EXISTS "premium_inventory_source_check";

UPDATE "premium_inventory_meta"
SET "source" = 'CLOUDSAWA_INVENTORY'
WHERE "source" = 'GETSAWA_INVENTORY';

ALTER TABLE "premium_inventory_meta"
  ADD CONSTRAINT "premium_inventory_source_check"
  CHECK ("source" IN ('UNVERIFIED','CLOUDSAWA_INVENTORY','CUSTOMER_CUSTODY','REGISTRY_PREMIUM'));

ALTER TABLE "auction_inventory"
  DROP CONSTRAINT IF EXISTS "auction_inventory_source_check";

UPDATE "auction_inventory"
SET "source" = 'CLOUDSAWA_INVENTORY'
WHERE "source" = 'GETSAWA_INVENTORY';

ALTER TABLE "auction_inventory"
  ADD CONSTRAINT "auction_inventory_source_check"
  CHECK ("source" IN ('CLOUDSAWA_INVENTORY','CUSTOMER_CUSTODY'));
