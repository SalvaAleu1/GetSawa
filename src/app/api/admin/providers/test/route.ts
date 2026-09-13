import { NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";
import { currentHostingCredentialFingerprint } from "@/lib/hosting-readiness";
import { currentEmailCredentialFingerprint } from "@/lib/email-readiness";
import { currentCloudflareCredentialFingerprint } from "@/lib/security-readiness";
import { logAudit } from "@/lib/audit";

const schema = z.object({ provider: z.enum(["namesilo", "paypal", "hosting", "email_hosting", "cloudflare_security", "ai"]) });

export async function POST(req: NextRequest) {
  try {
    const admin = await requireAdmin(["SUPER_ADMIN", "ADMIN"]);
    const { provider } = schema.parse(await req.json());
    let ok = false; let message = ""; let metadata: Prisma.InputJsonObject | undefined;

    if (provider === "namesilo") {
      const domainProvider = getDomainProvider();
      if (!domainProvider.isConfigured()) message = "NAMESILO_API_KEY is not set.";
      else { try { await domainProvider.getPricing(["com"]); ok = true; message = "Connected successfully."; } catch (error:any) { message = error.message || "Connection failed."; } }
    }
    if (provider === "paypal") {
      if (!PayPalProvider.isConfigured()) message = "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set.";
      else { try { await PayPalProvider.createOrder({ amountCents:100,currency:"USD",referenceId:`test-${Date.now()}`,description:"GetSawa connection test (not captured)",idempotencyKey:`test-${admin.id}-${Date.now()}`,returnUrl:`${process.env.APP_URL}/admin/providers`,cancelUrl:`${process.env.APP_URL}/admin/providers` }); ok=true; message="Connected successfully. A test order was created but not captured, so no charge occurred."; } catch(error:any){message=error.message||"Connection failed.";} }
    }
    if (provider === "hosting") {
      const hosting=getHostingProvider();const health=await hosting.healthCheck();ok=health.ok;message=health.message;metadata={implementation:hosting.name,credentialFingerprint:currentHostingCredentialFingerprint()??null,creatablePlanCodes:health.plans.map((plan)=>plan.code),planCount:health.plans.length};
    }
    if (provider === "email_hosting") {
      const email=getEmailProvider();const health=await email.healthCheck();ok=health.ok;message=health.message;metadata={implementation:email.name,credentialFingerprint:currentEmailCredentialFingerprint()??null,cluster:health.cluster??null,webmailUrl:health.webmailUrl??null,imapSmtpHost:health.imapSmtpHost??null};
    }
    if (provider === "cloudflare_security") {
      const cloudflare=getCloudflareSecurityProvider();const health=await cloudflare.healthCheck();ok=health.ok;message=health.message;metadata={implementation:cloudflare.name,credentialFingerprint:currentCloudflareCredentialFingerprint()??null,accountId:process.env.CLOUDFLARE_ACCOUNT_ID?.trim()||null,serviceProfile:"BASELINE"};
    }
    if (provider === "ai") {
      const ai=getAIProvider();if(!ai.isConfigured())message="AI_API_KEY is not set.";else{try{await ai.generateWebsiteContent({businessName:"Test Business",businessDescription:"A short connectivity test — this result is not saved anywhere.",pages:["home"]});ok=true;message="Connected successfully.";}catch(error:any){message=error.message||"Connection failed.";}}
    }

    await prisma.providerCredential.upsert({where:{provider},create:{provider,isConfigured:ok,isEnabled:ok,lastTestedAt:new Date(),lastTestOk:ok,lastTestMessage:message,metadata},update:{isConfigured:ok,isEnabled:ok,lastTestedAt:new Date(),lastTestOk:ok,lastTestMessage:message,metadata}});
    await logAudit({actorId:admin.id,action:"provider.tested",resource:"provider",resourceId:provider,metadata:{ok,message}});
    if(!ok)return jsonError(message,502,{provider,ok});return jsonOk({provider,ok,message,metadata});
  } catch(err){return handleError(err);}
}
