import { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { resolveAbuseFlag,runSecurityChecks,recordSecurityEvent } from "@/lib/security-controls";
import { logAudit } from "@/lib/audit";

const actionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("RUN_CHECK")}),
 z.object({action:z.literal("RESOLVE_ABUSE"),id:z.string().min(1)}),
 z.object({action:z.literal("PRIVACY_REVIEW"),id:z.string().min(1),status:z.enum(["IN_REVIEW","DECLINED"]),note:z.string().max(1000).optional()}),
]);
export const dynamic="force-dynamic";
export async function GET(){try{await requireAdmin(["SUPER_ADMIN","ADMIN"]);const[checks,events,flags,privacy,admins,alerts]=await Promise.all([
 runSecurityChecks(),
 prisma.$queryRaw<Array<{id:string;user_id:string|null;event_type:string;severity:string;resource_type:string|null;resource_id:string|null;metadata:unknown;created_at:Date}>>`SELECT "id","user_id","event_type","severity","resource_type","resource_id","metadata","created_at" FROM "security_events" ORDER BY "created_at" DESC LIMIT 100`,
 prisma.$queryRaw<Array<{id:string;user_id:string|null;order_id:string|null;signal:string;severity:string;status:string;metadata:unknown;created_at:Date;updated_at:Date}>>`SELECT "id","user_id","order_id","signal","severity","status","metadata","created_at","updated_at" FROM "abuse_flags" WHERE "status"<>'RESOLVED' ORDER BY CASE "severity" WHEN 'CRITICAL' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,"created_at" DESC LIMIT 100`,
 prisma.$queryRaw<Array<{id:string;user_id:string;email:string;request_type:string;status:string;review_note:string|null;requested_at:Date;completed_at:Date|null}>>`SELECT p."id",p."user_id",u."email",p."request_type",p."status",p."review_note",p."requested_at",p."completed_at" FROM "privacy_requests" p JOIN "User" u ON u."id"=p."user_id" WHERE p."status" IN ('PENDING','IN_REVIEW') ORDER BY p."requested_at" ASC LIMIT 100`,
 prisma.user.findMany({where:{adminRole:{not:null},isSuspended:false},orderBy:{email:"asc"},select:{id:true,email:true,firstName:true,lastName:true,adminRole:true,mfaEnabled:true,emailVerifiedAt:true}}),
 prisma.$queryRaw<Array<{id:string;dedupe_key:string;severity:string;source:string;title:string;body:string;status:string;resource_type:string|null;resource_id:string|null;created_at:Date}>>`SELECT "id","dedupe_key","severity","source","title","body","status","resource_type","resource_id","created_at" FROM "operational_alerts" WHERE "status"<>'RESOLVED' AND "source" IN ('security','abuse') ORDER BY "created_at" DESC LIMIT 100`,
]);return jsonOk({checks,events,flags,privacy,admins,alerts});}catch(error){return handleError(error);}}
export async function POST(req:NextRequest){try{const admin=await requireAdmin(["SUPER_ADMIN","ADMIN"]);const input=actionSchema.parse(await req.json());if(input.action==="RUN_CHECK"){const checks=await runSecurityChecks();await recordSecurityEvent({userId:admin.id,eventType:"security.configuration_check",severity:checks.sessionSecretOk?"INFO":"CRITICAL",resourceType:"system",metadata:checks});await logAudit({actorId:admin.id,action:"security.check_run",resource:"system",metadata:checks});return jsonOk({checks});}if(input.action==="RESOLVE_ABUSE"){await resolveAbuseFlag(input.id,admin.id);await logAudit({actorId:admin.id,action:"abuse.flag_resolved",resource:"abuse_flag",resourceId:input.id});return jsonOk({success:true});}const changed=await prisma.$executeRaw`UPDATE "privacy_requests" SET "status"=${input.status},"review_note"=${input.note??null},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${input.id} AND "request_type"='DELETION' AND "status" IN ('PENDING','IN_REVIEW')`;if(changed!==1)return jsonError("Deletion request not found or no longer reviewable.",404);await logAudit({actorId:admin.id,action:"privacy.request_reviewed",resource:"privacy_request",resourceId:input.id,metadata:{status:input.status}});return jsonOk({success:true});}catch(error){return handleError(error);}}
