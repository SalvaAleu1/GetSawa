import { NextRequest } from "next/server";
import { z } from "zod";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { jsonOk,handleError } from "@/lib/api";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit,recordSecurityEvent } from "@/lib/security-controls";
import { sendEmail,emailTemplates } from "@/lib/email";
const schema=z.object({email:z.string().email()});
export async function POST(req:NextRequest){try{const ip=getClientIp(req.headers);const rl=await checkDistributedRateLimit("forgot-password",ip,{max:5,windowMs:15*60_000});if(!rl.allowed){await recordSecurityEvent({eventType:"auth.password_reset_rate_limited",severity:"WARNING",subject:ip,metadata:{count:rl.count}});return jsonOk({success:true});}const{email}=schema.parse(await req.json());const normalized=email.toLowerCase();const user=await prisma.user.findUnique({where:{email:normalized}});if(user){const rawToken=crypto.randomBytes(32).toString("hex");const tokenHash=crypto.createHash("sha256").update(rawToken).digest("hex");await prisma.passwordResetToken.create({data:{userId:user.id,tokenHash,expiresAt:new Date(Date.now()+60*60*1000)}});const resetUrl=`${process.env.APP_URL}/reset-password?token=${rawToken}`;await sendEmail({to:user.email,...emailTemplates.passwordReset(resetUrl)});await recordSecurityEvent({userId:user.id,eventType:"auth.password_reset_requested",subject:normalized,resourceType:"user",resourceId:user.id});}return jsonOk({success:true});}catch(error){return handleError(error);}}
