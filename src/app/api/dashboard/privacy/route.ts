import crypto from "crypto";
import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
import { recordSecurityEvent } from "@/lib/security-controls";

const actionSchema=z.object({action:z.enum(["EXPORT","REQUEST_DELETION"])});
export async function GET(){try{const user=await requireUser();const requests=await prisma.$queryRaw<Array<{id:string;request_type:string;status:string;review_note:string|null;requested_at:Date;completed_at:Date|null}>>`SELECT "id","request_type","status","review_note","requested_at","completed_at" FROM "privacy_requests" WHERE "user_id"=${user.id} ORDER BY "requested_at" DESC`;return jsonOk({requests});}catch(error){return handleError(error);}}
export async function POST(req:NextRequest){try{const user=await requireUser();const{action}=actionSchema.parse(await req.json());if(action==="REQUEST_DELETION"){const existing=await prisma.$queryRaw<Array<{id:string}>>`SELECT "id" FROM "privacy_requests" WHERE "user_id"=${user.id} AND "request_type"='DELETION' AND "status" IN ('PENDING','IN_REVIEW') LIMIT 1`;if(existing[0])return jsonError("A deletion request is already pending review.",409);const id=crypto.randomUUID();await prisma.$executeRaw`INSERT INTO "privacy_requests" ("id","user_id","request_type") VALUES (${id},${user.id},'DELETION')`;await logAudit({actorId:user.id,action:"privacy.deletion_requested",resource:"privacy_request",resourceId:id});await recordSecurityEvent({userId:user.id,eventType:"privacy.deletion_requested",resourceType:"privacy_request",resourceId:id});return jsonOk({requestId:id,status:"PENDING",message:"Your deletion request has been recorded for review. Active services, financial retention obligations and domain ownership must be resolved before account data can be removed."},201);}
 const id=crypto.randomUUID();const[profile,domains,orders,invoices,tickets,messages,notifications,logins]=await Promise.all([
  prisma.user.findUnique({where:{id:user.id},select:{id:true,email:true,firstName:true,lastName:true,phone:true,company:true,country:true,emailVerifiedAt:true,mfaEnabled:true,createdAt:true,updatedAt:true}}),
  prisma.domain.findMany({where:{userId:user.id},select:{id:true,name:true,status:true,isPremium:true,registeredAt:true,expiresAt:true,autoRenew:true,isLocked:true,privacyEnabled:true,nameservers:true,createdAt:true,updatedAt:true}}),
  prisma.order.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},select:{id:true,orderNumber:true,status:true,subtotalCents:true,discountCents:true,taxCents:true,totalCents:true,currency:true,createdAt:true,updatedAt:true,items:{select:{description:true,quantity:true,totalCents:true,provisioningStatus:true}}}}),
  prisma.invoice.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},select:{invoiceNumber:true,totalCents:true,currency:true,status:true,paidAt:true,createdAt:true}}),
  prisma.supportTicket.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},select:{id:true,subject:true,category:true,priority:true,status:true,createdAt:true,updatedAt:true}}),
  prisma.supportMessage.findMany({where:{ticket:{userId:user.id},isInternalNote:false},orderBy:{createdAt:"asc"},select:{id:true,ticketId:true,authorId:true,body:true,createdAt:true}}),
  prisma.notification.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},select:{type:true,title:true,body:true,readAt:true,createdAt:true}}),
  prisma.loginEvent.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},select:{success:true,ipAddress:true,userAgent:true,reason:true,createdAt:true}}),
 ]);await prisma.$executeRaw`INSERT INTO "privacy_requests" ("id","user_id","request_type","status","completed_at") VALUES (${id},${user.id},'EXPORT','COMPLETED',CURRENT_TIMESTAMP)`;await logAudit({actorId:user.id,action:"privacy.export_generated",resource:"privacy_request",resourceId:id});return jsonOk({exportedAt:new Date().toISOString(),requestId:id,data:{profile,domains,orders,invoices,support:{tickets,messages},notifications,loginHistory:logins}});}catch(error){return handleError(error);}}
