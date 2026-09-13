import { ProductCategory } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import { getHostingProvider } from "@/lib/providers/hosting/HostingProvider";
import { getEmailProvider } from "@/lib/providers/email/EmailProvider";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { getCloudflareSecurityProvider } from "@/lib/providers/security/CloudflareSecurityProvider";

export interface StorefrontTld { extension:string;registerCents:number;renewCents:number;currency:string;supportsPrivacy:boolean;supportsPremium:boolean; }
export interface StorefrontProduct { id:string;sku:string;name:string;description:string|null;category:ProductCategory;retailPriceCents:number;renewalPriceCents:number|null;setupFeeCents:number;currency:string;billingCycle:string;isFeatured:boolean; }
export interface StorefrontServiceState { key:"domains"|"hosting"|"email"|"security"|"website";label:string;href:string;description:string;configured:boolean;activeProductCount:number;status:"available"|"limited"|"preparing"; }
export interface StorefrontBanner { id:string;title:string;subtitle:string|null;ctaLabel:string|null;ctaUrl:string|null; }
export interface StorefrontSnapshot { featuredTlds:StorefrontTld[];featuredProducts:StorefrontProduct[];services:StorefrontServiceState[];banner:StorefrontBanner|null;announcement:{id:string;title:string;body:string}|null; }
const PRODUCT_CATEGORIES:ProductCategory[]=["HOSTING","EMAIL","WEBSITE","SECURITY","AI","MARKETING","ADD_ON"];

export async function getStorefrontSnapshot():Promise<StorefrontSnapshot>{
  const now=new Date();
  const[tlds,products,productCategoryRows,banner,announcement]=await Promise.all([
    prisma.tld.findMany({where:{isActive:true},orderBy:[{isFeatured:"desc"},{extension:"asc"}],take:10}),
    prisma.product.findMany({where:{status:"ACTIVE",category:{in:PRODUCT_CATEGORIES}},orderBy:[{isFeatured:"desc"},{sortOrder:"asc"},{createdAt:"desc"}],take:8,select:{id:true,sku:true,name:true,description:true,category:true,retailPriceCents:true,renewalPriceCents:true,setupFeeCents:true,currency:true,billingCycle:true,isFeatured:true}}),
    prisma.product.findMany({where:{status:"ACTIVE",category:{in:PRODUCT_CATEGORIES}},select:{category:true}}),
    prisma.advertisement.findFirst({where:{placement:"homepage_banner",isActive:true,AND:[{OR:[{startsAt:null},{startsAt:{lte:now}}]},{OR:[{endsAt:null},{endsAt:{gt:now}}]}]},orderBy:[{priority:"desc"},{createdAt:"desc"}],select:{id:true,title:true,subtitle:true,ctaLabel:true,ctaUrl:true}}),
    prisma.announcement.findFirst({where:{isActive:true,audience:{in:["ALL","PUBLIC"]}},orderBy:{createdAt:"desc"},select:{id:true,title:true,body:true}}),
  ]);
  const counts=new Map<ProductCategory,number>();for(const product of productCategoryRows)counts.set(product.category,(counts.get(product.category)??0)+1);
  const domainConfigured=getDomainProvider().isConfigured(),hostingConfigured=getHostingProvider().isConfigured(),emailConfigured=getEmailProvider().isConfigured(),securityConfigured=getCloudflareSecurityProvider().isConfigured(),aiConfigured=getAIProvider().isConfigured();
  const activeHosting=counts.get("HOSTING")??0,activeEmail=counts.get("EMAIL")??0,activeSecurity=counts.get("SECURITY")??0,activeWebsite=(counts.get("WEBSITE")??0)+(counts.get("AI")??0);
  const services:StorefrontServiceState[]=[
    {key:"domains",label:"Domains",href:"/domains/search",description:"Search, register, transfer, renew, and manage domain settings from one account.",configured:domainConfigured,activeProductCount:tlds.length,status:domainConfigured&&tlds.length>0?"available":"limited"},
    {key:"hosting",label:"Web Hosting",href:"/products/HOSTING",description:"Provider-backed cPanel hosting with account provisioning, resource visibility and protected renewals.",configured:hostingConfigured,activeProductCount:activeHosting,status:hostingConfigured&&activeHosting>0?"available":"preparing"},
    {key:"email",label:"Business Email",href:"/products/EMAIL",description:"Managed-domain business mailboxes with OpenSRS provisioning, webmail and protected renewals.",configured:emailConfigured,activeProductCount:activeEmail,status:emailConfigured&&activeEmail>0?"available":"preparing"},
    {key:"security",label:"CDN & DNS Security",href:"/products/SECURITY",description:"Cloudflare-backed DNS, CDN proxying, Universal SSL and DNSSEC with explicit migration controls.",configured:securityConfigured,activeProductCount:activeSecurity,status:securityConfigured&&activeSecurity>0?"available":"preparing"},
    {key:"website",label:"AI Website Builder",href:"/dashboard/websites",description:"Create structured AI-assisted websites, edit versioned content, publish immutable snapshots and connect Cloudflare-hosted custom domains.",configured:aiConfigured,activeProductCount:activeWebsite,status:aiConfigured?"available":"preparing"},
  ];
  return{featuredTlds:tlds.map(tld=>{const price=computeTldPrice(tld);return{extension:tld.extension,registerCents:price.registerCents,renewCents:price.renewCents,currency:price.currency,supportsPrivacy:tld.supportsPrivacy,supportsPremium:tld.supportsPremium};}),featuredProducts:products,services,banner,announcement};
}
