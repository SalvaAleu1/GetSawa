-- Phase 22: durable customer messaging, support SLA state and operational alerts.
CREATE TABLE IF NOT EXISTS "message_deliveries" (
  "id" TEXT PRIMARY KEY,
  "event_key" TEXT NOT NULL UNIQUE,
  "user_id" TEXT,
  "channel" TEXT NOT NULL,
  "template_key" TEXT NOT NULL,
  "recipient" TEXT,
  "subject" TEXT,
  "body_html" TEXT,
  "body_text" TEXT,
  "status" TEXT NOT NULL DEFAULT 'QUEUED',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "next_attempt_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "error_message" TEXT,
  "source_type" TEXT,
  "source_id" TEXT,
  "sent_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "message_delivery_channel_check" CHECK ("channel" IN ('EMAIL','IN_APP')),
  CONSTRAINT "message_delivery_status_check" CHECK ("status" IN ('QUEUED','SENT','FAILED','SKIPPED')),
  CONSTRAINT "message_delivery_user_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "message_deliveries_retry_idx" ON "message_deliveries" ("status","next_attempt_at");
CREATE INDEX IF NOT EXISTS "message_deliveries_user_idx" ON "message_deliveries" ("user_id","created_at" DESC);

CREATE TABLE IF NOT EXISTS "support_ticket_ops" (
  "ticket_id" TEXT PRIMARY KEY,
  "sla_due_at" TIMESTAMP(3),
  "escalated_at" TIMESTAMP(3),
  "escalation_reason" TEXT,
  "last_staff_reply_at" TIMESTAMP(3),
  "last_customer_reply_at" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "support_ticket_ops_ticket_fkey" FOREIGN KEY ("ticket_id") REFERENCES "SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "support_ticket_ops_sla_idx" ON "support_ticket_ops" ("sla_due_at","escalated_at");

CREATE TABLE IF NOT EXISTS "operational_alerts" (
  "id" TEXT PRIMARY KEY,
  "dedupe_key" TEXT NOT NULL UNIQUE,
  "severity" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "resource_type" TEXT,
  "resource_id" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "resolved_at" TIMESTAMP(3),
  CONSTRAINT "operational_alert_severity_check" CHECK ("severity" IN ('INFO','WARNING','CRITICAL')),
  CONSTRAINT "operational_alert_status_check" CHECK ("status" IN ('OPEN','ACKNOWLEDGED','RESOLVED'))
);
CREATE INDEX IF NOT EXISTS "operational_alert_status_idx" ON "operational_alerts" ("status","severity","created_at" DESC);
