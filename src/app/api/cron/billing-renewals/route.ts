import { NextRequest } from "next/server";
import { processDueRenewals } from "@/lib/billing";
import { enforceHostingPastDue } from "@/lib/hosting-billing";
import { enforceEmailPastDue } from "@/lib/email-billing";
import { enforceSecurityPastDue } from "@/lib/security-billing";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(req:NextRequest){const secret=process.env.CRON_SECRET;const authorization=req.headers.get("authorization");if(!secret||authorization!==`Bearer ${secret}`)return Response.json({error:"Unauthorized"},{status:401});const renewals=await processDueRenewals(100);const[hostingSuspensions,emailSuspensions,securitySuspensions]=await Promise.all([enforceHostingPastDue(100),enforceEmailPastDue(100),enforceSecurityPastDue(100)]);return Response.json({ok:true,renewals,hostingSuspensions,emailSuspensions,securitySuspensions,timestamp:new Date().toISOString()});}
