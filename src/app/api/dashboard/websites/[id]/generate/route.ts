import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getOwnedProjectOrThrow } from "@/lib/websites";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { AIProviderNotConfiguredError } from "@/lib/providers/ai/AIProvider";
import { normalizeWebsiteContent } from "@/lib/ai/website-schema";
import { saveWebsiteDocument } from "@/lib/website-editor";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { checkRateLimit } from "@/lib/rate-limit";
import { prisma } from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
const schema=z.object({pages:z.array(z.enum(["home","about","services","pricing","contact","faq","blog","gallery"])).min(1).max(8).default(["home","about","services","contact"])});type Ctx={params:Promise<{id:string}>};
export async function POST(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const project=await getOwnedProjectOrThrow(id,user.id);const rl=checkRateLimit("ai-generate",user.id,{max:10,windowMs:60*60_000});if(!rl.allowed)return jsonError("You've reached the generation limit for now. Please try again later.",429);const{pages}=schema.parse(await req.json().catch(()=>({})));const provider=getAIProvider();if(!provider.isConfigured())return jsonError("The AI website builder is not currently available. The AI provider has not been configured yet.",503,{code:"PROVIDER_NOT_CONFIGURED"});await prisma.websiteProject.update({where:{id:project.id},data:{status:"GENERATING"}});try{const generated=await provider.generateWebsiteContent({businessName:project.name,businessDescription:project.businessDescription||"",category:project.category||undefined,tone:project.tone||undefined,pages});const content=normalizeWebsiteContent(generated);const result=await saveWebsiteDocument({projectId:id,userId:user.id,content,note:"AI generated initial website"});await prisma.websiteProject.update({where:{id},data:{aiModel:process.env.AI_MODEL||"claude-sonnet-4-5"}});await logAudit({actorId:user.id,action:"website.ai_generated",resource:"website_project",resourceId:id,metadata:{versionId:result.version.id}});return jsonOk(result);}catch(error){await prisma.websiteProject.update({where:{id},data:{status:"DRAFT"}});throw error;}}catch(error){if(error instanceof AIProviderNotConfiguredError)return jsonError(error.message,503,{code:"PROVIDER_NOT_CONFIGURED"});return handleError(error);}}
