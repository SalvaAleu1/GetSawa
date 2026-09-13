import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { deactivateDeveloperWebhook, testDeveloperWebhook } from "@/lib/developer-platform";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

type Context={params:Promise<{id:string}>};
export async function DELETE(_req:NextRequest,{params}:Context){try{const user=await requireUser();const{id}=await params;await deactivateDeveloperWebhook(user.id,id);await logAudit({actorId:user.id,action:"developer.webhook_revoked",resource:"developer_webhook",resourceId:id});return jsonOk({success:true});}catch(error){return handleError(error);}}
export async function POST(_req:NextRequest,{params}:Context){try{const user=await requireUser();const{id}=await params;const result=await testDeveloperWebhook(user.id,id);await logAudit({actorId:user.id,action:"developer.webhook_tested",resource:"developer_webhook",resourceId:id,metadata:{delivered:result.delivered,status:result.status}});return jsonOk({result});}catch(error){return handleError(error);}}
