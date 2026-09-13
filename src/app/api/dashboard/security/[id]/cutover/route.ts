import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { cutoverSecurityZone } from "@/lib/security-service";
type Ctx={params:Promise<{id:string}>};
const schema=z.object({confirmed:z.literal(true),recordsReviewed:z.literal(true)});
export async function POST(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Confirm DNS review and nameserver cutover.",422);return jsonOk(await cutoverSecurityZone({userId:user.id,serviceInstanceId:id,...parsed.data}));}catch(error){return handleError(error);}}
