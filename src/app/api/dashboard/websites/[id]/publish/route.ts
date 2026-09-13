import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { createPublishedSnapshot } from "@/lib/website-editor";
import { prisma } from "@/lib/prisma";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";
const schema=z.object({publish:z.boolean()});type Ctx={params:Promise<{id:string}>};
export async function POST(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const project=await getOwnedProjectOrThrow(id,user.id);const{publish}=schema.parse(await req.json());if(publish){if(!project.content)return jsonError("Create and save website content before publishing.",400);const result=await createPublishedSnapshot({projectId:id,userId:user.id});await logAudit({actorId:user.id,action:"website.snapshot_published",resource:"website_project",resourceId:id,metadata:{versionId:result.version.id}});return jsonOk({project:result.project,publishedVersionId:result.version.id,publicUrl:`${process.env.APP_URL}/sites/${result.project.slug}`});}const updated=await prisma.websiteProject.update({where:{id:project.id},data:{status:"UNPUBLISHED"}});await logAudit({actorId:user.id,action:"website.unpublished",resource:"website_project",resourceId:id});return jsonOk({project:updated,publicUrl:null});}catch(error){return handleError(error);}}
