import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";

export const dynamic="force-dynamic";
export async function GET(){try{const user=await requireUser();const [notifications,unreadCount]=await Promise.all([prisma.notification.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:100}),prisma.notification.count({where:{userId:user.id,readAt:null}})]);return jsonOk({notifications,unreadCount});}catch(e){return handleError(e);}}
export async function PATCH(req:NextRequest){try{const user=await requireUser();const body=await req.json().catch(()=>null) as {id?:unknown;all?:unknown}|null;if(body?.all===true){await prisma.notification.updateMany({where:{userId:user.id,readAt:null},data:{readAt:new Date()}});return jsonOk({success:true,marked:"all"});}if(typeof body?.id!=="string")return jsonError("Notification id is required.",422);const result=await prisma.notification.updateMany({where:{id:body.id,userId:user.id},data:{readAt:new Date()}});if(!result.count)return jsonError("Notification not found.",404);return jsonOk({success:true,id:body.id});}catch(e){return handleError(e);}}
