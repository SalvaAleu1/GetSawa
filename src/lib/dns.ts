import { z } from "zod";

export const DNS_RECORD_TYPES = ["A", "AAAA", "CNAME", "MX", "TXT", "SRV", "CAA"] as const;

export const dnsRecordSchema = z.object({
  type: z.enum(DNS_RECORD_TYPES),
  host: z.string().trim().min(1).max(255),
  value: z.string().trim().min(1).max(1000),
  ttl: z.number().int().min(300).max(86400).default(3600),
  priority: z.number().int().min(0).max(65535).optional(),
}).superRefine((record, ctx) => {
  if (record.type === "A" && !isIpv4(record.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "A records require a valid IPv4 address." });
  }
  if (record.type === "AAAA" && !isIpv6(record.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "AAAA records require a valid IPv6 address." });
  }
  if ((record.type === "CNAME" || record.type === "MX") && !isHostname(record.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: `${record.type} records require a hostname target.` });
  }
  if (record.type === "MX" && record.priority == null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["priority"], message: "MX records require a priority." });
  }
  if (record.type === "SRV" && !/^\d+:\d+:[^\s]+$/.test(record.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "SRV values must use weight:port:target format for NameSilo." });
  }
  if (record.type === "CAA" && !/^\d+:[^:]+:.+$/.test(record.value)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "CAA values must use flag:tag:value format for NameSilo." });
  }
});

export type ValidatedDnsRecord = z.infer<typeof dnsRecordSchema>;

export function normalizeDnsHost(host: string) {
  const clean = host.trim().toLowerCase().replace(/\.$/, "");
  return clean || "@";
}

export function isHostname(value: string) {
  const clean = value.trim().replace(/\.$/, "");
  if (clean.length < 1 || clean.length > 253) return false;
  return clean.split(".").every((label) => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/i.test(label));
}

function isIpv4(value: string) {
  const parts = value.trim().split(".");
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part) && Number(part) >= 0 && Number(part) <= 255);
}

function isIpv6(value: string) {
  const clean = value.trim();
  if (!/^[0-9a-f:]+$/i.test(clean) || !clean.includes(":")) return false;
  const doubleColonCount = (clean.match(/::/g) || []).length;
  if (doubleColonCount > 1) return false;
  const parts = clean.split(":").filter(Boolean);
  if (clean.includes("::")) return parts.length <= 7 && parts.every((part) => part.length <= 4);
  return parts.length === 8 && parts.every((part) => part.length >= 1 && part.length <= 4);
}
