import { NextRequest } from "next/server";
import { retryDeveloperWebhookDeliveries } from "@/lib/developer-platform";
import { prisma } from "@/lib/prisma";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;if(!secret||req.headers.get("authorization")!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401});const result=await retryDeveloperWebhookDeliveries(100);const expiredIdempotency=await prisma.$executeRaw`DELETE FROM "developer_idempotency" WHERE "expires_at"<CURRENT_TIMESTAMP`;return Response.json({ok:true,...result,expiredIdempotency:Number(expiredIdempotency),timestamp:new Date().toISOString()});}
