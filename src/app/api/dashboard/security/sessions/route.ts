import { NextRequest } from "next/server";
import { jwtVerify } from "jose";
import { cookies } from "next/headers";
import { requireUser, revokeAllSessions, clearSessionCookie } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

async function currentSessionId(){const token=(await cookies()).get("getsawa_session")?.value;if(!token||!process.env.SESSION_SECRET||process.env.SESSION_SECRET.length<32)return null;try{const {payload}=await jwtVerify(token,new TextEncoder().encode(process.env.SESSION_SECRET),{algorithms:["HS256"]});return typeof payload.sid==="string"?payload.sid:null;}catch{return null;}}
export async function GET(){try{const user=await requireUser();const current=await currentSessionId();const sessions=await prisma.session.findMany({where:{userId:user.id,expiresAt:{gt:new Date()}},select:{id:true,ipAddress:true,userAgent:true,createdAt:true,expiresAt:true},orderBy:{createdAt:"desc"}});return jsonOk({sessions:sessions.map(s=>({...s,isCurrent:s.id===current}))});}catch(e){return handleError(e);}}
export async function DELETE(req:NextRequest){try{const user=await requireUser();const body=await req.json().catch(()=>null) as {sessionId?:unknown}|null;if(typeof body?.sessionId!=="string")return jsonError("sessionId is required.",422);const session=await prisma.session.findUnique({where:{id:body.sessionId},select:{userId:true}});if(!session||session.userId!==user.id)return jsonError("Session not found.",404);const current=await currentSessionId();await prisma.session.delete({where:{id:body.sessionId}});if(current===body.sessionId)await clearSessionCookie();await logAudit({actorId:user.id,action:"security.session_revoked",resource:"session",resourceId:body.sessionId});return jsonOk({success:true,signedOut:current===body.sessionId});}catch(e){return handleError(e);}}
export async function PATCH(_req:NextRequest){try{const user=await requireUser();await revokeAllSessions(user.id);await clearSessionCookie();await logAudit({actorId:user.id,action:"security.sessions_revoked_all",resource:"user",resourceId:user.id});return jsonOk({success:true,signedOut:true});}catch(e){return handleError(e);}}
