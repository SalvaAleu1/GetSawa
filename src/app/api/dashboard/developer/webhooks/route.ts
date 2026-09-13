import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { createDeveloperWebhook, DEVELOPER_WEBHOOK_EVENTS, listDeveloperWebhooks } from "@/lib/developer-platform";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema=z.object({name:z.string().trim().min(2).max(120),url:z.string().url().max(2048),events:z.array(z.enum(DEVELOPER_WEBHOOK_EVENTS)).min(1)});
export async function GET(){try{const user=await requireUser();return jsonOk({...(await listDeveloperWebhooks(user.id)),availableEvents:DEVELOPER_WEBHOOK_EVENTS});}catch(error){return handleError(error);}}
export async function POST(req:NextRequest){try{const user=await requireUser();const current=await listDeveloperWebhooks(user.id);if(current.subscriptions.filter(item=>item.is_active).length>=10)return jsonError("A maximum of 10 active webhook subscriptions is allowed.",409);const input=schema.parse(await req.json());const webhook=await createDeveloperWebhook({userId:user.id,...input});await logAudit({actorId:user.id,action:"developer.webhook_created",resource:"developer_webhook",resourceId:webhook.id,metadata:{events:webhook.events,url:webhook.url}});return jsonOk({webhook,warning:"Copy the signing secret now. It will not be shown again."},201);}catch(error){return handleError(error);}}
