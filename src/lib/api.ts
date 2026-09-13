import { NextResponse } from "next/server";
import { AuthError } from "@/lib/auth";
import { ApiAuthError } from "@/lib/api-keys";
import { SecurityBlockError } from "@/lib/security-controls";
import { ProviderNotConfiguredError } from "@/lib/providers/domains/DomainProvider";
import { ZodError } from "zod";

export function jsonError(message:string,status=400,extra?:Record<string,unknown>){return NextResponse.json({error:message,...extra},{status});}
export function jsonOk(data:unknown,status=200){return NextResponse.json(data,{status});}
export function withApiErrors(handler:()=>Promise<NextResponse>){return async()=>{try{return await handler();}catch(error){return handleError(error);}};}
export function handleError(error:unknown){
 if(error instanceof AuthError)return jsonError(error.message,error.status);
 if(error instanceof ApiAuthError)return jsonError(error.message,error.status);
 if(error instanceof SecurityBlockError)return jsonError(error.message,error.status);
 if(error instanceof ProviderNotConfiguredError)return jsonError(error.message,503,{code:"PROVIDER_NOT_CONFIGURED"});
 if(error instanceof ZodError)return jsonError("Invalid request.",422,{issues:error.issues});
 console.error(error);return jsonError("Something went wrong. Please try again.",500);
}
