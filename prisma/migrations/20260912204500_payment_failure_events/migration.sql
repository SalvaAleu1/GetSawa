ALTER TABLE "finance_events" DROP CONSTRAINT IF EXISTS "finance_events_type_check";
ALTER TABLE "finance_events"
  ADD CONSTRAINT "finance_events_type_check" CHECK (
    "event_type" IN ('PAYMENT_CAPTURED','PAYMENT_REFUNDED','PAYMENT_DISPUTED','PAYMENT_FEE_ADJUSTMENT','PAYMENT_FAILED')
  );
