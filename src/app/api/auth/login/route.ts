import { NextRequest } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { verifyPassword,createSession,setSessionCookie } from "@/lib/auth";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { getClientIp } from "@/lib/rate-limit";
import { checkDistributedRateLimit,recordSecurityEvent } from "@/lib/security-controls";
import { logAudit } from "@/lib/audit";
import { decryptTotpSecret,verifyTotp } from "@/lib/mfa";
const schema=z.object({email:z.string().email(),password:z.string().min(1),mfaCode:z.string().regex(/^\d{6}$/).optional()});
export async function POST(req:NextRequest){try{const ip=getClientIp(req.headers);const rl=await checkDistributedRateLimit("login",ip,{max:15,windowMs:5*60_000});if(!rl.allowed){await recordSecurityEvent({eventType:"auth.login_rate_limited",severity:"WARNING",subject:ip,metadata:{count:rl.count}});return jsonError("Too many login attempts. Please try again later.",429);}
 const{email,password,mfaCode}=schema.parse(await req.json());const normalized=email.toLowerCase();const user=await prisma.user.findUnique({where:{email:normalized}});const userAgent=req.headers.get("user-agent")||undefined;
 if(!user||!(await verifyPassword(password,user.passwordHash))){if(user)await prisma.loginEvent.create({data:{userId:user.id,success:false,ipAddress:ip,userAgent,reason:"bad_password"}});await recordSecurityEvent({userId:user?.id,eventType:"auth.login_failed",severity:"INFO",subject:normalized,metadata:{reason:"bad_password"}});return jsonError("Invalid email or password.",401);}
 if(user.isSuspended){await prisma.loginEvent.create({data:{userId:user.id,success:false,ipAddress:ip,userAgent,reason:"suspended"}});await recordSecurityEvent({userId:user.id,eventType:"auth.suspended_login_attempt",severity:"WARNING",subject:ip,resourceType:"user",resourceId:user.id});return jsonError("This account has been suspended. Contact support for help.",403);}
 if(user.mfaEnabled){if(!mfaCode)return jsonError("MFA code required.",401,{code:"MFA_REQUIRED"});if(!user.mfaSecret||!verifyTotp(decryptTotpSecret(user.mfaSecret),mfaCode)){await prisma.loginEvent.create({data:{userId:user.id,success:false,ipAddress:ip,userAgent,reason:"bad_mfa"}});await recordSecurityEvent({userId:user.id,eventType:"auth.mfa_failed",severity:"WARNING",subject:ip,resourceType:"user",resourceId:user.id});return jsonError("Invalid MFA code.",401);}}
 const{jwt}=await createSession(user.id,ip,userAgent);await setSessionCookie(jwt);await prisma.loginEvent.create({data:{userId:user.id,success:true,ipAddress:ip,userAgent,reason:user.mfaEnabled?"password_and_mfa":undefined}});await logAudit({actorId:user.id,action:"user.login",resource:"user",resourceId:user.id,ipAddress:ip});await recordSecurityEvent({userId:user.id,eventType:"auth.login_success",resourceType:"user",resourceId:user.id,metadata:{mfa:user.mfaEnabled}});return jsonOk({user:{id:user.id,email:user.email,firstName:user.firstName,lastName:user.lastName,isAdmin:Boolean(user.adminRole),mfaEnabled:user.mfaEnabled}});}catch(error){return handleError(error);}}
