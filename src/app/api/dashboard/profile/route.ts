import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ firstName: z.string().trim().min(1).max(100), lastName: z.string().trim().min(1).max(100), phone: z.string().trim().max(40).optional(), company: z.string().trim().max(150).optional(), country: z.string().trim().max(100).optional() });
export async function GET() { try { const user = await requireUser(); return jsonOk({ user: { id:user.id,email:user.email,firstName:user.firstName,lastName:user.lastName,phone:user.phone,company:user.company,country:user.country,emailVerifiedAt:user.emailVerifiedAt,mfaEnabled:user.mfaEnabled,createdAt:user.createdAt } }); } catch(e){ return handleError(e); } }
export async function PATCH(req: NextRequest) { try { const user=await requireUser(); const data=schema.parse(await req.json()); const updated=await prisma.user.update({where:{id:user.id},data}); await logAudit({actorId:user.id,action:"profile.updated",resource:"user",resourceId:user.id}); return jsonOk({user:{id:updated.id,email:updated.email,firstName:updated.firstName,lastName:updated.lastName,phone:updated.phone,company:updated.company,country:updated.country}}); } catch(e){return handleError(e);} }
