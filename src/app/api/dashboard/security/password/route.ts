import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, verifyPassword, hashPassword, revokeAllSessions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema=z.object({currentPassword:z.string().min(1),newPassword:z.string().min(10).max(200)});
export async function POST(req:NextRequest){try{const user=await requireUser();const {currentPassword,newPassword}=schema.parse(await req.json());if(currentPassword===newPassword)return jsonError("New password must be different from the current password.",422);if(!(await verifyPassword(currentPassword,user.passwordHash)))return jsonError("Current password is incorrect.",400);await prisma.user.update({where:{id:user.id},data:{passwordHash:await hashPassword(newPassword)}});await revokeAllSessions(user.id);await logAudit({actorId:user.id,action:"security.password_changed",resource:"user",resourceId:user.id});return jsonOk({success:true,signedOutEverywhere:true});}catch(e){return handleError(e);}}
