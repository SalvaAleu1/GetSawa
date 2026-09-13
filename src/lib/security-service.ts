import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getCloudflareSecurityProvider, type CloudflareDnsRecord } from "@/lib/providers/security/CloudflareSecurityProvider";
import { getDomainProvider } from "@/lib/providers/domains/DomainProviderFactory";
import type { DnsRecordResult } from "@/lib/providers/domains/DomainProvider";
import { getSecurityOperationalState } from "@/lib/security-readiness";
import { logAudit } from "@/lib/audit";

// SRV intentionally remains fail-closed in Phase 17 because Cloudflare's SRV
// API shape is structured and must not be reconstructed from a flattened
// registrar value. An existing SRV record therefore blocks automatic cutover.
const IMPORTABLE_TYPES = new Set(["A", "AAAA", "CNAME", "MX", "TXT", "CAA"]);

interface ZoneServiceRow {
  id: string;
  user_id: string;
  domain_id: string;
  service_instance_id: string;
  zone_id: string;
  zone_name: string;
  zone_status: string;
  assigned_nameservers: unknown;
  dns_migration_status: string;
  dns_imported_count: number;
  dns_unsupported: unknown;
  cutover_status: string;
  proxy_enabled: boolean;
  proxy_desired: boolean;
  https_enforced: boolean;
  dnssec_status: string;
}

function nameservers(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}
function isDnsOwl(values: string[]) {
  const normalized = values.map((value) => value.toLowerCase().replace(/\.$/, ""));
  return normalized.length >= 2 && normalized.every((value) => value.endsWith(".dnsowl.com") || value === "dnsowl.com");
}
function fqdn(host: string, domain: string) {
  const raw = host.trim().replace(/\.$/, "");
  if (!raw || raw === "@" || raw.toLowerCase() === domain.toLowerCase()) return domain.toLowerCase();
  return raw.toLowerCase().endsWith(`.${domain.toLowerCase()}`) ? raw.toLowerCase() : `${raw.toLowerCase()}.${domain.toLowerCase()}`;
}
function sameRecord(left: CloudflareDnsRecord, right: DnsRecordResult, domain: string) {
  return left.type === right.type
    && left.name.toLowerCase() === fqdn(right.host, domain)
    && left.content.toLowerCase().replace(/\.$/, "") === String(right.value).toLowerCase().replace(/\.$/, "")
    && (right.type !== "MX" || Number(left.priority ?? 0) === Number(right.priority ?? 0));
}
async function rowForService(userId: string, serviceInstanceId: string) {
  const rows = await prisma.$queryRaw<ZoneServiceRow[]>`
    SELECT czs.* FROM "cloudflare_zone_services" czs
    JOIN "product_service_instances" psi ON psi."id"=czs."service_instance_id"
    WHERE czs."service_instance_id"=${serviceInstanceId} AND czs."user_id"=${userId} AND psi."user_id"=${userId} LIMIT 1
  `;
  if (!rows[0]) throw new Error("Cloudflare security service was not found.");
  return rows[0];
}

export async function prepareCloudflareZone(domainName: string) {
  const operational = await getSecurityOperationalState();
  if (!operational.verified) throw new Error(operational.reason || "Cloudflare security provider is not verified.");
  const zone = await getCloudflareSecurityProvider().createZone(domainName);
  return { zoneId: zone.id, zoneName: zone.name, zoneStatus: zone.status, assignedNameservers: zone.name_servers ?? [] };
}
export async function attachCloudflareZoneService(params: { userId:string;domainId:string;serviceInstanceId:string;zoneId:string;zoneName:string;zoneStatus:string;assignedNameservers:string[] }) {
  await prisma.$executeRaw`
    INSERT INTO "cloudflare_zone_services" ("id","user_id","domain_id","service_instance_id","zone_id","zone_name","zone_status","assigned_nameservers","dns_migration_status")
    VALUES (${crypto.randomUUID()},${params.userId},${params.domainId},${params.serviceInstanceId},${params.zoneId},${params.zoneName},${params.zoneStatus},${JSON.stringify(params.assignedNameservers)}::jsonb,'PENDING')
    ON CONFLICT ("service_instance_id") DO NOTHING
  `;
  return importExistingDns(params.userId, params.serviceInstanceId);
}
export async function importExistingDns(userId: string, serviceInstanceId: string) {
  const service = await rowForService(userId, serviceInstanceId);
  const domain = await prisma.domain.findFirst({ where: { id: service.domain_id, userId }, select: { name: true, providerName: true } });
  if (!domain) throw new Error("Managed domain was not found.");
  const registrar = getDomainProvider();
  const provider = getCloudflareSecurityProvider();
  const registrarInfo = await registrar.getDomainInfo(domain.name);
  if (domain.providerName !== registrar.name || !isDnsOwl(registrarInfo.nameservers)) {
    const reason = [{ type: "EXTERNAL_DNS", message: "Current authoritative DNS is external. Recreate and review the zone records in GetSawa before nameserver cutover." }];
    await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "dns_migration_status"='BLOCKED',"dns_unsupported"=${JSON.stringify(reason)}::jsonb,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    return { imported: 0, unsupported: reason, externalDns: true };
  }
  const source = await registrar.listDnsRecords(domain.name);
  const unsupported = source.filter((record) => !IMPORTABLE_TYPES.has(record.type)).map((record) => ({ type: record.type, host: record.host, value: record.value }));
  if (unsupported.length > 0) {
    await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "dns_migration_status"='BLOCKED',"dns_unsupported"=${JSON.stringify(unsupported)}::jsonb,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
    return { imported: 0, unsupported, externalDns: false };
  }
  let target = await provider.listDnsRecords(service.zone_id);
  let imported = 0;
  for (const record of source) {
    if (target.some((candidate) => sameRecord(candidate, record, domain.name))) continue;
    await provider.createDnsRecord(service.zone_id, { type: record.type, name: fqdn(record.host, domain.name), content: String(record.value), ttl: record.ttl && record.ttl > 0 ? record.ttl : 1, proxied: false, priority: record.priority });
    imported++;
    target = await provider.listDnsRecords(service.zone_id);
  }
  await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "dns_migration_status"='IMPORTED',"dns_imported_count"=${source.length},"dns_unsupported"='[]'::jsonb,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;
  return { imported, total: source.length, unsupported: [], externalDns: false };
}
export async function listSecurityDns(userId:string,serviceInstanceId:string){const service=await rowForService(userId,serviceInstanceId);return getCloudflareSecurityProvider().listDnsRecords(service.zone_id);}
export async function createSecurityDns(userId:string,serviceInstanceId:string,record:{type:string;name:string;content:string;ttl?:number;proxied?:boolean;priority?:number}){const service=await rowForService(userId,serviceInstanceId);if(!IMPORTABLE_TYPES.has(record.type))throw new Error("This DNS record type is not supported by the safe GetSawa Cloudflare editor yet.");const created=await getCloudflareSecurityProvider().createDnsRecord(service.zone_id,{...record,name:fqdn(record.name,service.zone_name),proxied:record.proxied??false});await logAudit({actorId:userId,action:"security.dns_created",resource:"security_service",resourceId:serviceInstanceId,metadata:{recordId:created.id,type:created.type,name:created.name}});return created;}
export async function updateSecurityDns(userId:string,serviceInstanceId:string,recordId:string,record:{type:string;name:string;content:string;ttl?:number;proxied?:boolean;priority?:number}){const service=await rowForService(userId,serviceInstanceId);if(!IMPORTABLE_TYPES.has(record.type))throw new Error("This DNS record type is not supported by the safe GetSawa Cloudflare editor yet.");return getCloudflareSecurityProvider().updateDnsRecord(service.zone_id,recordId,{...record,name:fqdn(record.name,service.zone_name)});}
export async function deleteSecurityDns(userId:string,serviceInstanceId:string,recordId:string){const service=await rowForService(userId,serviceInstanceId);await getCloudflareSecurityProvider().deleteDnsRecord(service.zone_id,recordId);}
export async function cutoverSecurityZone(params:{userId:string;serviceInstanceId:string;confirmed:boolean;recordsReviewed:boolean}){if(!params.confirmed||!params.recordsReviewed)throw new Error("Confirm that the Cloudflare DNS zone is complete before changing authoritative nameservers.");const service=await rowForService(params.userId,params.serviceInstanceId);if(service.dns_migration_status!=="IMPORTED")throw new Error("DNS migration is not in a safe imported state. Resolve unsupported or external DNS records before cutover.");const domain=await prisma.domain.findFirst({where:{id:service.domain_id,userId:params.userId},select:{name:true}});if(!domain)throw new Error("Managed domain was not found.");const provider=getCloudflareSecurityProvider();const zone=await provider.getZone(service.zone_id);if(!zone.name_servers||zone.name_servers.length<2)throw new Error("Cloudflare did not assign authoritative nameservers.");const records=await provider.listDnsRecords(service.zone_id);if(records.length===0)throw new Error("Cloudflare zone has no DNS records. Add and review records before cutover.");const registrar=getDomainProvider();if(!registrar.isConfigured())throw new Error("Registrar integration is unavailable for nameserver cutover.");if(registrar.getDnssecStatus&&registrar.disableDnssec){const current=await registrar.getDnssecStatus(domain.name);if(current.enabled)await registrar.disableDnssec(domain.name);}await registrar.updateNameservers(domain.name,zone.name_servers);await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "cutover_status"='NAMESERVERS_UPDATED',"assigned_nameservers"=${JSON.stringify(zone.name_servers)}::jsonb,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;await logAudit({actorId:params.userId,action:"security.nameserver_cutover",resource:"security_service",resourceId:service.id,metadata:{domain:domain.name,nameservers:zone.name_servers}});return reconcileSecurityZone(params.userId,params.serviceInstanceId);}
export async function reconcileSecurityZone(userId:string,serviceInstanceId:string){const service=await rowForService(userId,serviceInstanceId);const provider=getCloudflareSecurityProvider();const zone=await provider.getZone(service.zone_id);const active=zone.status==="active";let httpsReady=false;if(active){await provider.enableUniversalSsl(zone.id).catch(()=>undefined);await provider.updateZoneSetting(zone.id,"always_use_https","on").then(()=>{httpsReady=true;}).catch(()=>undefined);}const dnssec=active?await provider.getDnssec(zone.id).catch(()=>({status:"unknown"})):{status:"disabled"};await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "zone_status"=${zone.status},"assigned_nameservers"=${JSON.stringify(zone.name_servers??[])}::jsonb,"cutover_status"=${active?"ACTIVE":service.cutover_status},"https_enforced"=${httpsReady},"dnssec_status"=${String(dnssec.status||"unknown")},"last_reconciled_at"=CURRENT_TIMESTAMP,"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;return{zoneStatus:zone.status,active,nameservers:zone.name_servers??[],dnssecStatus:String(dnssec.status||"unknown"),httpsEnforced:httpsReady};}
export async function setSecurityProxy(userId:string,serviceInstanceId:string,enabled:boolean){const service=await rowForService(userId,serviceInstanceId);const zone=await getCloudflareSecurityProvider().getZone(service.zone_id);if(enabled&&zone.status!=="active")throw new Error("Cloudflare zone must be active before CDN proxying can be enabled.");const changed=await getCloudflareSecurityProvider().setWebProxy(service.zone_id,enabled,service.zone_name);await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "proxy_enabled"=${enabled},"proxy_desired"=${enabled},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;await logAudit({actorId:userId,action:enabled?"security.proxy_enabled":"security.proxy_disabled",resource:"security_service",resourceId:service.id,metadata:{changedRecords:changed}});return{enabled,changedRecords:changed};}
export async function enableSecurityDnssec(userId:string,serviceInstanceId:string){const service=await rowForService(userId,serviceInstanceId);const zone=await getCloudflareSecurityProvider().getZone(service.zone_id);if(zone.status!=="active")throw new Error("Cloudflare zone must be active before DNSSEC can be enabled.");const cf=await getCloudflareSecurityProvider().enableDnssec(service.zone_id);const keyTag=Number(cf.key_tag),algorithm=Number(cf.algorithm),digestType=Number(cf.digest_type),digest=String(cf.digest||"");if(![keyTag,algorithm,digestType].every(Number.isFinite)||!digest)throw new Error("Cloudflare did not return complete DS material for registrar publication.");const registrar=getDomainProvider();if(!registrar.enableDnssec)throw new Error("The registrar integration cannot publish DNSSEC DS records.");await registrar.enableDnssec(service.zone_name,[{keyTag,algorithm,digestType,digest}]);const confirmed=await getCloudflareSecurityProvider().getDnssec(service.zone_id);await prisma.$executeRaw`UPDATE "cloudflare_zone_services" SET "dnssec_status"=${confirmed.status},"updated_at"=CURRENT_TIMESTAMP WHERE "id"=${service.id}`;await logAudit({actorId:userId,action:"security.dnssec_enabled",resource:"security_service",resourceId:service.id,metadata:{status:confirmed.status}});return confirmed;}
export async function getCustomerSecurityServices(userId:string){const rows=await prisma.$queryRaw<Array<Record<string,unknown>>>`SELECT czs.*,psi."status" AS "service_status",p."name" AS "product_name",p."billingCycle" AS "billing_cycle",d."name" AS "domain_name",bs."id" AS "subscription_id",bs."status" AS "billing_status",bs."current_period_end",bs."auto_renew",bs."cancel_at_period_end" FROM "cloudflare_zone_services" czs JOIN "product_service_instances" psi ON psi."id"=czs."service_instance_id" JOIN "Product" p ON p."id"=psi."product_id" JOIN "Domain" d ON d."id"=czs."domain_id" LEFT JOIN "billing_subscriptions" bs ON bs."service_instance_id"=psi."id" WHERE czs."user_id"=${userId} ORDER BY czs."created_at" DESC`;return rows.map((row)=>({...row,assigned_nameservers:nameservers(row.assigned_nameservers)}));}
