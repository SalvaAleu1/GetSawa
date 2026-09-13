import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { restoreWebsiteVersion } from "@/lib/website-editor";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
const schema=z.object({versionId:z.string().min(1)});type Ctx={params:Promise<{id:string}>};
export async function POST(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Version ID is required.",422);const result=await restoreWebsiteVersion({projectId:id,userId:user.id,versionId:parsed.data.versionId});await logAudit({actorId:user.id,action:"website.version_restored",resource:"website_project",resourceId:id,metadata:{sourceVersionId:parsed.data.versionId,newVersionId:result.version.id}});return jsonOk(result);}catch(error){return handleError(error);}}
