import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
type Ctx={params:Promise<{id:string}>};const schema=z.object({enabled:z.boolean()});
export async function PATCH(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Invalid renewal setting.",422);const rows=await prisma.$queryRaw<Array<{id:string}>>`SELECT bs."id" FROM "billing_subscriptions" bs JOIN "product_service_instances" psi ON psi."id"=bs."service_instance_id" WHERE psi."id"=${id} AND psi."user_id"=${user.id} AND psi."provider_name"='cloudflare' LIMIT 1`;if(!rows[0])return jsonError("Recurring security subscription not found.",404);await prisma.$executeRaw`UPDATE "billing_subscriptions" SET "auto_renew"=${parsed.data.enabled},"cancel_at_period_end"=${!parsed.data.enabled},"status"=CASE WHEN ${parsed.data.enabled}=TRUE AND "status" IN ('CANCELLED','EXPIRED') AND "current_period_end">CURRENT_TIMESTAMP THEN 'ACTIVE' ELSE "status" END,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${rows[0].id}`;await logAudit({actorId:user.id,action:parsed.data.enabled?"security.autorenew_enabled":"security.autorenew_disabled",resource:"security_service",resourceId:id});return jsonOk({enabled:parsed.data.enabled});}catch(error){return handleError(error);}}
