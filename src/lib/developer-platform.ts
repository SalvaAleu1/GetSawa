import crypto from "crypto";
import type { ApiClient } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireApiKey, ApiAuthError } from "@/lib/api-keys";
import { encryptSecret, decryptSecret } from "@/lib/crypto";
import { jsonError, handleError } from "@/lib/api";
import { upsertOperationalAlert, resolveOperationalAlert } from "@/lib/messaging";

export const DEVELOPER_API_SCOPES = ["domains:read", "products:read", "orders:read", "webhooks:manage"] as const;
export type DeveloperApiScope = (typeof DEVELOPER_API_SCOPES)[number];

export const DEVELOPER_WEBHOOK_EVENTS = [
  "order.payment_confirmed",
  "order.provisioning",
  "order.active",
  "order.fulfilment_failed",
  "renewal.invoice",
] as const;
export type DeveloperWebhookEvent = (typeof DEVELOPER_WEBHOOK_EVENTS)[number];

export async function withDeveloperApi(
  req: NextRequest,
  scope: DeveloperApiScope,
  route: string,
  handler: (ctx: { client: ApiClient; requestId: string }) => Promise<NextResponse>,
) {
  const started = Date.now();
  const incomingRequestId = req.headers.get("x-request-id")?.trim();
  const requestId = incomingRequestId && /^[A-Za-z0-9._:-]{8,128}$/.test(incomingRequestId) ? incomingRequestId : crypto.randomUUID();
  let client: ApiClient | null = null;
  try {
    client = await requireApiKey(req, scope);
    const response = await handler({ client, requestId });
    response.headers.set("X-Request-Id", requestId);
    await recordApiRequest({ client, requestId, method: req.method, route, scope, statusCode: response.status, durationMs: Date.now() - started }).catch(() => undefined);
    return response;
  } catch (error) {
    const response = error instanceof ApiAuthError ? jsonError(error.message, error.status) : handleError(error);
    response.headers.set("X-Request-Id", requestId);
    if (client) await recordApiRequest({ client, requestId, method: req.method, route, scope, statusCode: response.status, durationMs: Date.now() - started }).catch(() => undefined);
    return response;
  }
}

async function recordApiRequest(input: { client: ApiClient; requestId: string; method: string; route: string; scope: string; statusCode: number; durationMs: number }) {
  await prisma.$executeRaw`
    INSERT INTO "developer_api_requests" ("id","api_client_id","user_id","request_id","method","route","scope","status_code","duration_ms")
    VALUES (${crypto.randomUUID()},${input.client.id},${input.client.userId},${input.requestId},${input.method},${input.route},${input.scope},${input.statusCode},${Math.max(0, Math.round(input.durationMs))})
    ON CONFLICT ("request_id") DO NOTHING
  `;
}

export function assertPublicWebhookUrl(raw: string) {
  let url: URL;
  try { url = new URL(raw); } catch { throw new ApiAuthError("Webhook URL must be a valid HTTPS URL.", 422); }
  if (url.protocol !== "https:") throw new ApiAuthError("Webhook URL must use HTTPS.", 422);
  if (url.username || url.password) throw new ApiAuthError("Webhook URL cannot contain embedded credentials.", 422);
  if (url.port && url.port !== "443") throw new ApiAuthError("Webhook URL must use the standard HTTPS port.", 422);
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) throw new ApiAuthError("Webhook URL must use a public internet hostname.", 422);
  if (host.includes(":")) throw new ApiAuthError("Literal IPv6 webhook targets are not allowed.", 422);
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const parts = ipv4.slice(1).map(Number);
    if (parts.some((part) => part < 0 || part > 255) || isPrivateIpv4(parts)) throw new ApiAuthError("Webhook URL cannot target a private or reserved IP address.", 422);
  }
  url.hash = "";
  return url.toString();
}

function isPrivateIpv4(parts: number[]) {
  const [a, b] = parts;
  return a === 0 || a === 10 || a === 127 || a >= 224 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19));
}

export async function createDeveloperWebhook(input: { userId: string; name: string; url: string; events: string[] }) {
  const events = Array.from(new Set(input.events));
  if (events.length === 0 || events.some((event) => !(DEVELOPER_WEBHOOK_EVENTS as readonly string[]).includes(event))) throw new ApiAuthError("Webhook events contain an unsupported event type.", 422);
  const url = assertPublicWebhookUrl(input.url);
  const secret = `whsec_${crypto.randomBytes(32).toString("hex")}`;
  const id = crypto.randomUUID();
  await prisma.$executeRaw`
    INSERT INTO "developer_webhook_subscriptions" ("id","user_id","name","url","secret_encrypted","events")
    VALUES (${id},${input.userId},${input.name.slice(0,120)},${url},${encryptSecret(secret)},${events})
  `;
  return { id, name: input.name.slice(0,120), url, events, secret };
}

export async function listDeveloperWebhooks(userId: string) {
  const subscriptions = await prisma.$queryRaw<Array<{ id:string;name:string;url:string;events:string[];is_active:boolean;created_at:Date;updated_at:Date }>>`
    SELECT "id","name","url","events","is_active","created_at","updated_at" FROM "developer_webhook_subscriptions" WHERE "user_id"=${userId} ORDER BY "created_at" DESC
  `;
  const deliveries = await prisma.$queryRaw<Array<{ id:string;subscription_id:string;event_type:string;status:string;attempts:number;last_status_code:number|null;last_error:string|null;created_at:Date;delivered_at:Date|null }>>`
    SELECT d."id",d."subscription_id",e."event_type",d."status",d."attempts",d."last_status_code",d."last_error",d."created_at",d."delivered_at"
    FROM "developer_webhook_deliveries" d JOIN "developer_events" e ON e."id"=d."event_id" JOIN "developer_webhook_subscriptions" s ON s."id"=d."subscription_id"
    WHERE s."user_id"=${userId} ORDER BY d."created_at" DESC LIMIT 100
  `;
  return { subscriptions, deliveries };
}

export async function deactivateDeveloperWebhook(userId: string, id: string) {
  const changed = await prisma.$executeRaw`UPDATE "developer_webhook_subscriptions" SET "is_active"=FALSE,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${id} AND "user_id"=${userId}`;
  if (changed !== 1) throw new ApiAuthError("Webhook subscription not found.", 404);
}

export async function emitDeveloperEvent(input: { userId: string; eventType: DeveloperWebhookEvent; resourceType: string; resourceId?: string | null; payload: Record<string, unknown> }) {
  const eventId = crypto.randomUUID();
  const payload = JSON.stringify(input.payload);
  await prisma.$executeRaw`
    INSERT INTO "developer_events" ("id","user_id","event_type","resource_type","resource_id","payload") VALUES (${eventId},${input.userId},${input.eventType},${input.resourceType},${input.resourceId ?? null},${payload}::jsonb)
  `;
  const subscriptions = await prisma.$queryRaw<Array<{ id:string }>>`
    SELECT "id" FROM "developer_webhook_subscriptions" WHERE "user_id"=${input.userId} AND "is_active"=TRUE AND ${input.eventType}=ANY("events")
  `;
  for (const subscription of subscriptions) {
    await prisma.$executeRaw`
      INSERT INTO "developer_webhook_deliveries" ("id","event_id","subscription_id") VALUES (${crypto.randomUUID()},${eventId},${subscription.id}) ON CONFLICT ("event_id","subscription_id") DO NOTHING
    `;
  }
  return { eventId, queued: subscriptions.length };
}

export async function testDeveloperWebhook(userId: string, subscriptionId: string) {
  const subscriptions = await prisma.$queryRaw<Array<{ id:string }>>`SELECT "id" FROM "developer_webhook_subscriptions" WHERE "id"=${subscriptionId} AND "user_id"=${userId} AND "is_active"=TRUE LIMIT 1`;
  if (!subscriptions[0]) throw new ApiAuthError("Webhook subscription not found or inactive.", 404);
  const eventId = crypto.randomUUID();
  await prisma.$executeRaw`INSERT INTO "developer_events" ("id","user_id","event_type","resource_type","resource_id","payload") VALUES (${eventId},${userId},'webhook.test','webhook_subscription',${subscriptionId},${JSON.stringify({ message: "GetSawa webhook test" })}::jsonb)`;
  const deliveryId = crypto.randomUUID();
  await prisma.$executeRaw`INSERT INTO "developer_webhook_deliveries" ("id","event_id","subscription_id") VALUES (${deliveryId},${eventId},${subscriptionId})`;
  const result = await attemptDeveloperWebhookDelivery(deliveryId);
  return { eventId, deliveryId, ...result };
}

type DeliveryRow = { id:string;event_id:string;event_type:string;payload:unknown;created_at:Date;subscription_id:string;url:string;secret_encrypted:string;attempts:number;status:string };
export async function attemptDeveloperWebhookDelivery(deliveryId: string) {
  const rows = await prisma.$queryRaw<DeliveryRow[]>`
    SELECT d."id",d."event_id",e."event_type",e."payload",e."created_at",d."subscription_id",s."url",s."secret_encrypted",d."attempts",d."status"
    FROM "developer_webhook_deliveries" d JOIN "developer_events" e ON e."id"=d."event_id" JOIN "developer_webhook_subscriptions" s ON s."id"=d."subscription_id"
    WHERE d."id"=${deliveryId} AND s."is_active"=TRUE LIMIT 1
  `;
  const row = rows[0];
  if (!row || row.status === "DELIVERED" || row.status === "DEAD") return { delivered: row?.status === "DELIVERED", status: row?.status ?? "MISSING" };
  const url = assertPublicWebhookUrl(row.url);
  const envelope = { id: row.event_id, type: row.event_type, createdAt: row.created_at.toISOString(), data: row.payload };
  const body = JSON.stringify(envelope);
  const timestamp = Math.floor(Date.now()/1000).toString();
  const signature = crypto.createHmac("sha256", decryptSecret(row.secret_encrypted)).update(`${timestamp}.${body}`).digest("hex");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  const attempts = row.attempts + 1;
  try {
    const response = await fetch(url, { method:"POST", headers:{"content-type":"application/json","user-agent":"GetSawa-Webhooks/1.0","x-getsawa-event-id":row.event_id,"x-getsawa-event-type":row.event_type,"x-getsawa-timestamp":timestamp,"x-getsawa-signature":`v1=${signature}`}, body, redirect:"manual", signal:controller.signal });
    if (response.status >= 200 && response.status < 300) {
      await prisma.$executeRaw`UPDATE "developer_webhook_deliveries" SET "status"='DELIVERED',"attempts"=${attempts},"last_status_code"=${response.status},"last_error"=NULL,"delivered_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${deliveryId}`;
      await resolveOperationalAlert(`developer-webhook:${deliveryId}`);
      return { delivered:true, status:"DELIVERED", statusCode:response.status };
    }
    throw Object.assign(new Error(`Webhook endpoint returned HTTP ${response.status}.`), { statusCode: response.status });
  } catch (error) {
    const statusCode = typeof (error as { statusCode?: unknown })?.statusCode === "number" ? Number((error as { statusCode:number }).statusCode) : null;
    const message = error instanceof Error ? error.message.slice(0,500) : "Webhook delivery failed.";
    const dead = attempts >= 8;
    const delayMinutes = Math.min(360, Math.max(1, Math.pow(2, Math.min(attempts-1,8))));
    const nextAt = new Date(Date.now()+delayMinutes*60_000);
    await prisma.$executeRaw`UPDATE "developer_webhook_deliveries" SET "status"=${dead ? "DEAD" : "FAILED"},"attempts"=${attempts},"last_status_code"=${statusCode},"last_error"=${message},"next_attempt_at"=${nextAt},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${deliveryId}`;
    if (attempts >= 3) await upsertOperationalAlert({ dedupeKey:`developer-webhook:${deliveryId}`, severity:dead?"CRITICAL":"WARNING", source:"developer_webhook", title:"Developer webhook delivery is failing", body:message, resourceType:"developer_webhook_delivery", resourceId:deliveryId });
    return { delivered:false, status:dead?"DEAD":"FAILED", statusCode, error:message };
  } finally { clearTimeout(timeout); }
}

export async function retryDeveloperWebhookDeliveries(limit=100) {
  const rows = await prisma.$queryRaw<Array<{ id:string }>>`SELECT "id" FROM "developer_webhook_deliveries" WHERE "status" IN ('QUEUED','FAILED') AND "attempts"<8 AND "next_attempt_at"<=CURRENT_TIMESTAMP ORDER BY "next_attempt_at" ASC LIMIT ${limit}`;
  let delivered=0,failed=0;
  for (const row of rows) { const result=await attemptDeveloperWebhookDelivery(row.id); if(result.delivered) delivered++; else failed++; }
  return { inspected:rows.length,delivered,failed };
}

function payloadHash(payload: unknown) { return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex"); }
export async function getIdempotentResult(clientId:string,operation:string,key:string,payload:unknown) {
  if (!/^[A-Za-z0-9._:-]{8,200}$/.test(key)) throw new ApiAuthError("Idempotency-Key must be 8-200 safe characters.",422);
  const hash=payloadHash(payload);
  const rows=await prisma.$queryRaw<Array<{ request_hash:string;status_code:number;response_json:unknown;expires_at:Date }>>`SELECT "request_hash","status_code","response_json","expires_at" FROM "developer_idempotency" WHERE "api_client_id"=${clientId} AND "operation"=${operation} AND "idempotency_key"=${key} LIMIT 1`;
  const row=rows[0];
  if(!row || row.expires_at<=new Date()) return { hash, prior:null as null | { statusCode:number; data:unknown } };
  if(row.request_hash!==hash) throw new ApiAuthError("This Idempotency-Key was already used with a different request.",409);
  return { hash, prior:{ statusCode:row.status_code,data:row.response_json } };
}
export async function storeIdempotentResult(clientId:string,operation:string,key:string,hash:string,statusCode:number,data:unknown) {
  const expiresAt=new Date(Date.now()+24*60*60*1000); const json=JSON.stringify(data);
  await prisma.$executeRaw`INSERT INTO "developer_idempotency" ("id","api_client_id","operation","idempotency_key","request_hash","status_code","response_json","expires_at") VALUES (${crypto.randomUUID()},${clientId},${operation},${key},${hash},${statusCode},${json}::jsonb,${expiresAt}) ON CONFLICT ("api_client_id","operation","idempotency_key") DO NOTHING`;
}

export async function getDeveloperUsage(userId:string) {
  const requests=await prisma.$queryRaw<Array<{ api_client_id:string;name:string;requests:bigint;errors:bigint;avg_ms:number|null;last_request:Date|null }>>`
    SELECT c."id" AS api_client_id,c."name",COUNT(r.*) AS requests,COUNT(r.*) FILTER (WHERE r."status_code">=400) AS errors,AVG(r."duration_ms")::float AS avg_ms,MAX(r."created_at") AS last_request
    FROM "ApiClient" c LEFT JOIN "developer_api_requests" r ON r."api_client_id"=c."id" AND r."created_at">CURRENT_TIMESTAMP-INTERVAL '30 days'
    WHERE c."userId"=${userId} GROUP BY c."id",c."name" ORDER BY c."createdAt" DESC
  `;
  const recent=await prisma.$queryRaw<Array<{ request_id:string;method:string;route:string;scope:string;status_code:number;duration_ms:number;created_at:Date;key_name:string }>>`
    SELECT r."request_id",r."method",r."route",r."scope",r."status_code",r."duration_ms",r."created_at",c."name" AS key_name FROM "developer_api_requests" r JOIN "ApiClient" c ON c."id"=r."api_client_id" WHERE r."user_id"=${userId} ORDER BY r."created_at" DESC LIMIT 100
  `;
  return { requests:requests.map(r=>({...r,requests:Number(r.requests),errors:Number(r.errors)})),recent };
}
