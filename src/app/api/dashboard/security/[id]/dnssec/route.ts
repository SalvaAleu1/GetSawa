import { NextRequest } from "next/server";
import { requireUser } from "@/lib/auth";
import { jsonOk,handleError } from "@/lib/api";
import { enableSecurityDnssec } from "@/lib/security-service";
type Ctx={params:Promise<{id:string}>};
export async function POST(_req:NextRequest,{params}:Ctx){try{const user=await requireUser();const{id}=await params;return jsonOk({dnssec:await enableSecurityDnssec(user.id,id)});}catch(error){return handleError(error);}}
