import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError,jsonOk,handleError } from "@/lib/api";
import { setSecurityProxy } from "@/lib/security-service";
type Ctx={params:Promise<{id:string}>};const schema=z.object({enabled:z.boolean()});
export async function PATCH(req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;const parsed=schema.safeParse(await req.json());if(!parsed.success)return jsonError("Invalid proxy setting.",422);return jsonOk(await setSecurityProxy(user.id,id,parsed.data.enabled));}catch(error){return handleError(error);}}
