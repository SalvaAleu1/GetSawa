import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export type DeliveryInput = {
  eventKey: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  email?: { to: string; subject: string; html: string; text?: string };
  sourceType?: string;
  sourceId?: string;
};

type DeliveryRow = { id:string;event_key:string;recipient:string|null;subject:string|null;body_html:string|null;body_text:string|null;attempts:number;status:string };

export async function deliverCustomerMessage(input: DeliveryInput) {
  const inApp = await prisma.$queryRaw<Array<{ id:string }>>`
    INSERT INTO "message_deliveries" ("id","event_key","user_id","channel","template_key","status","source_type","source_id","sent_at")
    VALUES (${crypto.randomUUID()},${`${input.eventKey}:inapp`},${input.userId},'IN_APP',${input.type},'SENT',${input.sourceType ?? null},${input.sourceId ?? null},CURRENT_TIMESTAMP)
    ON CONFLICT ("event_key") DO NOTHING RETURNING "id"
  `;
  if (inApp[0]) {
    await prisma.notification.create({ data: { userId: input.userId, type: input.type, title: input.title, body: input.body } });
  }

  let emailDeliveryId: string | null = null;
  if (input.email) {
    const inserted = await prisma.$queryRaw<Array<{ id:string }>>`
      INSERT INTO "message_deliveries" ("id","event_key","user_id","channel","template_key","recipient","subject","body_html","body_text","status","source_type","source_id")
      VALUES (${crypto.randomUUID()},${`${input.eventKey}:email`},${input.userId},'EMAIL',${input.type},${input.email.to},${input.email.subject},${input.email.html},${input.email.text ?? null},'QUEUED',${input.sourceType ?? null},${input.sourceId ?? null})
      ON CONFLICT ("event_key") DO NOTHING RETURNING "id"
    `;
    emailDeliveryId = inserted[0]?.id ?? null;
    if (emailDeliveryId) await attemptEmailDelivery(emailDeliveryId);
  }
  return { inAppCreated: Boolean(inApp[0]), emailDeliveryId };
}

export async function attemptEmailDelivery(id: string) {
  const rows = await prisma.$queryRaw<DeliveryRow[]>`
    SELECT "id","event_key","recipient","subject","body_html","body_text","attempts","status" FROM "message_deliveries" WHERE "id"=${id} AND "channel"='EMAIL' LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status === "SENT" || row.status === "SKIPPED") return { sent: row?.status === "SENT" };
  if (!row.recipient || !row.subject || !row.body_html) {
    await prisma.$executeRaw`UPDATE "message_deliveries" SET "status"='SKIPPED',"error_message"='Missing recipient, subject or body',"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
    return { sent: false };
  }
  const nextAttempts = row.attempts + 1;
  try {
    const result = await sendEmail({ to: row.recipient, subject: row.subject, html: row.body_html, text: row.body_text ?? undefined });
    if (!result.sent) throw new Error(result.reason || "Email transport did not send the message.");
    await prisma.$executeRaw`UPDATE "message_deliveries" SET "status"='SENT',"attempts"=${nextAttempts},"error_message"=NULL,"sent_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
    await resolveOperationalAlert(`message:${row.event_key}`);
    return { sent: true };
  } catch (error) {
    const delayMinutes = Math.min(360, 5 * Math.pow(2, Math.min(nextAttempts - 1, 6)));
    const nextAt = new Date(Date.now() + delayMinutes * 60000);
    const message = error instanceof Error ? error.message.slice(0, 500) : "Email delivery failed.";
    await prisma.$executeRaw`UPDATE "message_deliveries" SET "status"='FAILED',"attempts"=${nextAttempts},"error_message"=${message},"next_attempt_at"=${nextAt},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id}`;
    if (nextAttempts >= 3) await upsertOperationalAlert({ dedupeKey: `message:${row.event_key}`, severity: nextAttempts >= 6 ? "CRITICAL" : "WARNING", source: "messaging", title: "Transactional email delivery is failing", body: `${row.recipient}: ${message}`, resourceType: "message_delivery", resourceId: id });
    return { sent: false };
  }
}

export async function retryMessageDeliveries(limit = 100) {
  const rows = await prisma.$queryRaw<Array<{ id:string }>>`
    SELECT "id" FROM "message_deliveries" WHERE "channel"='EMAIL' AND "status" IN ('QUEUED','FAILED') AND "attempts"<6 AND "next_attempt_at"<=CURRENT_TIMESTAMP ORDER BY "next_attempt_at" ASC LIMIT ${limit}
  `;
  let sent = 0, failed = 0;
  for (const row of rows) { const result = await attemptEmailDelivery(row.id); if (result.sent) sent++; else failed++; }
  await scanOperationalAlerts();
  return { inspected: rows.length, sent, failed };
}

export async function ensureSupportSla(ticketId: string, priority: string) {
  const hours = priority === "URGENT" ? 2 : priority === "HIGH" ? 8 : priority === "LOW" ? 48 : 24;
  const due = new Date(Date.now() + hours * 3600000);
  await prisma.$executeRaw`
    INSERT INTO "support_ticket_ops" ("ticket_id","sla_due_at") VALUES (${ticketId},${due})
    ON CONFLICT ("ticket_id") DO UPDATE SET "sla_due_at"=CASE WHEN "support_ticket_ops"."escalated_at" IS NULL THEN EXCLUDED."sla_due_at" ELSE "support_ticket_ops"."sla_due_at" END,"updated_at"=CURRENT_TIMESTAMP
  `;
  return due;
}

export async function recordSupportReply(ticketId: string, kind: "CUSTOMER" | "STAFF") {
  if (kind === "CUSTOMER") {
    await prisma.$executeRaw`INSERT INTO "support_ticket_ops" ("ticket_id","last_customer_reply_at") VALUES (${ticketId},CURRENT_TIMESTAMP) ON CONFLICT ("ticket_id") DO UPDATE SET "last_customer_reply_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP`;
  } else {
    await prisma.$executeRaw`INSERT INTO "support_ticket_ops" ("ticket_id","last_staff_reply_at","escalated_at","escalation_reason") VALUES (${ticketId},CURRENT_TIMESTAMP,NULL,NULL) ON CONFLICT ("ticket_id") DO UPDATE SET "last_staff_reply_at"=CURRENT_TIMESTAMP,"escalated_at"=NULL,"escalation_reason"=NULL,"updated_at"=CURRENT_TIMESTAMP`;
    await resolveOperationalAlert(`support-sla:${ticketId}`);
  }
}

export async function upsertOperationalAlert(input: { dedupeKey:string;severity:"INFO"|"WARNING"|"CRITICAL";source:string;title:string;body:string;resourceType?:string;resourceId?:string }) {
  await prisma.$executeRaw`
    INSERT INTO "operational_alerts" ("id","dedupe_key","severity","source","title","body","resource_type","resource_id","status")
    VALUES (${crypto.randomUUID()},${input.dedupeKey},${input.severity},${input.source},${input.title},${input.body},${input.resourceType ?? null},${input.resourceId ?? null},'OPEN')
    ON CONFLICT ("dedupe_key") DO UPDATE SET "severity"=EXCLUDED."severity","title"=EXCLUDED."title","body"=EXCLUDED."body","resource_type"=EXCLUDED."resource_type","resource_id"=EXCLUDED."resource_id","status"='OPEN',"resolved_at"=NULL,"updated_at"=CURRENT_TIMESTAMP
  `;
}

export async function resolveOperationalAlert(dedupeKey: string) {
  await prisma.$executeRaw`UPDATE "operational_alerts" SET "status"='RESOLVED',"resolved_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP WHERE "dedupe_key"=${dedupeKey} AND "status"<>'RESOLVED'`;
}

export async function scanOperationalAlerts() {
  const overdue = await prisma.$queryRaw<Array<{ ticket_id:string; subject:string; priority:string }>>`
    SELECT sto."ticket_id",st."subject",st."priority" FROM "support_ticket_ops" sto JOIN "SupportTicket" st ON st."id"=sto."ticket_id"
    WHERE sto."sla_due_at"<=CURRENT_TIMESTAMP AND sto."last_staff_reply_at" IS NULL AND st."status" IN ('OPEN','PENDING') LIMIT 100
  `;
  for (const ticket of overdue) {
    await prisma.$executeRaw`UPDATE "support_ticket_ops" SET "escalated_at"=COALESCE("escalated_at",CURRENT_TIMESTAMP),"escalation_reason"=COALESCE("escalation_reason",'First-response SLA exceeded'),"updated_at"=CURRENT_TIMESTAMP WHERE "ticket_id"=${ticket.ticket_id}`;
    await upsertOperationalAlert({ dedupeKey:`support-sla:${ticket.ticket_id}`, severity:ticket.priority === "URGENT" ? "CRITICAL" : "WARNING", source:"support", title:"Support first-response SLA exceeded", body:ticket.subject, resourceType:"support_ticket", resourceId:ticket.ticket_id });
  }
  const webhookFailures = await prisma.webhookEvent.findMany({ where: { processingStatus: "FAILED" }, orderBy: { receivedAt: "desc" }, take: 50, select: { id:true,eventId:true,eventType:true,errorMessage:true } });
  for (const event of webhookFailures) await upsertOperationalAlert({ dedupeKey:`webhook:${event.eventId}`, severity:"CRITICAL", source:"webhook", title:`Webhook processing failed: ${event.eventType}`, body:event.errorMessage || "Provider webhook failed without an error message.", resourceType:"webhook_event", resourceId:event.id });
  return { overdueSupport: overdue.length, failedWebhooks: webhookFailures.length };
}
