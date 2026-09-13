import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk,handleError } from "@/lib/api";
export const dynamic="force-dynamic";
export async function GET(){try{const user=await requireUser();const[items,unread]=await Promise.all([prisma.notification.findMany({where:{userId:user.id},orderBy:{createdAt:"desc"},take:100}),prisma.notification.count({where:{userId:user.id,readAt:null}})]);return jsonOk({items,unread});}catch(error){return handleError(error);}}
const schema=z.object({all:z.boolean().optional(),ids:z.array(z.string()).max(100).optional()}).refine(v=>v.all||Boolean(v.ids?.length),"Select notifications to mark read.");
export async function PATCH(req:NextRequest){try{const user=await requireUser();const input=schema.parse(await req.json());const where=input.all?{userId:user.id,readAt:null}:{userId:user.id,id:{in:input.ids||[]},readAt:null};const result=await prisma.notification.updateMany({where,data:{readAt:new Date()}});return jsonOk({updated:result.count});}catch(error){return handleError(error);}}
