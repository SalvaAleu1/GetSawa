import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { jsonOk, handleError } from "@/lib/api";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { PayPalProvider } from "@/lib/providers/payments/PayPalProvider";
import { isEmailConfigured } from "@/lib/email";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";
import { getHostingOperationalState } from "@/lib/hosting-readiness";
import { getEmailOperationalState } from "@/lib/email-readiness";
import { getSecurityOperationalState } from "@/lib/security-readiness";

export async function GET(){try{await requireAdmin();const domain=getDomainProvider(),hosting=getHostingProvider(),email=getEmailProvider(),cloudflare=getCloudflareSecurityProvider();const dbHealthy=await prisma.$queryRaw`SELECT 1`.then(()=>true).catch(()=>false);const[rows,hostingState,emailState,securityState]=await Promise.all([prisma.providerCredential.findMany(),getHostingOperationalState(),getEmailOperationalState(),getSecurityOperationalState()]);const by=new Map(rows.map(row=>[row.provider,row]));const providers=[
{provider:"namesilo",label:"NameSilo (Domains)",isConfigured:domain.isConfigured(),...pickStatus(by.get("namesilo"))},
{provider:"paypal",label:"PayPal (Payments)",isConfigured:PayPalProvider.isConfigured(),...pickStatus(by.get("paypal"))},
{provider:"smtp",label:"Transactional Email (SMTP)",isConfigured:isEmailConfigured(),...pickStatus(by.get("smtp"))},
{provider:"hosting",label:"cPanel / WHM Hosting",isConfigured:hosting.isConfigured(),operational:hostingState.verified,operationalReason:hostingState.reason,...pickStatus(by.get("hosting"))},
{provider:"email_hosting",label:"OpenSRS Hosted Email",isConfigured:email.isConfigured(),operational:emailState.verified,operationalReason:emailState.reason,metadata:emailState.verified?{cluster:emailState.cluster,webmailUrl:emailState.webmailUrl,imapSmtpHost:emailState.imapSmtpHost}:null,...pickStatus(by.get("email_hosting"))},
{provider:"cloudflare_security",label:"Cloudflare DNS / CDN / SSL",isConfigured:cloudflare.isConfigured(),operational:securityState.verified,operationalReason:securityState.reason,...pickStatus(by.get("cloudflare_security"))},
{provider:"ai",label:"AI (Website Builder)",isConfigured:getAIProvider().isConfigured(),...pickStatus(by.get("ai"))},
{provider:"storage",label:"Object Storage",isConfigured:Boolean(process.env.STORAGE_PROVIDER),...pickStatus(by.get("storage"))},
];return jsonOk({database:dbHealthy?"operational":"unavailable",providers});}catch(err){return handleError(err);}}
function pickStatus(row?:{lastTestedAt:Date|null;lastTestOk:boolean|null;lastTestMessage:string|null}){if(!row)return{lastTestedAt:null,lastTestOk:null,lastTestMessage:null};return{lastTestedAt:row.lastTestedAt,lastTestOk:row.lastTestOk,lastTestMessage:row.lastTestMessage};}
