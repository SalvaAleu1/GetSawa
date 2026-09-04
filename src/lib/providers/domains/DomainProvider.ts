/**
 * Generic interface every domain wholesale/registrar provider must implement.
 * The rest of the application (search, checkout, DNS management, admin) talks
 * to this interface only — never to a specific provider's SDK or response
 * shape directly. This is what lets a second registrar be added later
 * without rewriting the platform (see spec section 4).
 */

export class ProviderNotConfiguredError extends Error {
  constructor(provider: string) {
    super(`${provider} is not configured. Set the required environment variables to enable this feature.`);
    this.name = "ProviderNotConfiguredError";
  }
}

export interface DomainAvailability {
  domain: string;
  tld: string;
  available: boolean;
  isPremium: boolean;
  premiumPriceCents?: number;
  reason?: string; // e.g. "invalid", "reserved", "registered"
}

export interface DomainPricing {
  tld: string;
  registerCents: number; // wholesale cost per year, minor units
  renewCents: number;
  transferCents: number | null;
  currency: string;
}

export interface DomainRegistrationRequest {
  domain: string;
  years: number;
  registrant: RegistrantContact;
  nameservers?: string[];
  privacy?: boolean;
  autoRenew?: boolean;
  idempotencyKey: string;
}

export interface DomainRegistrationResult {
  success: boolean;
  providerOrderId?: string;
  domain: string;
  expiresAt?: string; // ISO date
  errorCode?: string;
  errorMessage?: string;
}

export interface DomainRenewalRequest {
  domain: string;
  years: number;
  idempotencyKey: string;
}

export interface DomainRenewalResult {
  success: boolean;
  domain: string;
  newExpiresAt?: string;
  errorCode?: string;
  errorMessage?: string;
}

export interface DomainTransferRequest {
  domain: string;
  authCode: string;
  registrant?: RegistrantContact;
  idempotencyKey: string;
}

export interface DomainTransferResult {
  success: boolean;
  providerTransferId?: string;
  status: "SUBMITTED" | "FAILED";
  errorCode?: string;
  errorMessage?: string;
}

export interface RegistrantContact {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  address1: string;
  address2?: string;
  city: string;
  state?: string;
  zip: string;
  country: string;
  company?: string;
}

export interface DnsRecordInput {
  type: "A" | "AAAA" | "CNAME" | "MX" | "TXT" | "NS" | "SRV" | "CAA";
  host: string;
  value: string;
  ttl?: number;
  priority?: number;
}

export interface DnsRecordResult extends DnsRecordInput {
  providerRecordId: string;
}

export interface DomainInfo {
  domain: string;
  status: string;
  registeredAt?: string;
  expiresAt?: string;
  autoRenew: boolean;
  isLocked: boolean;
  privacyEnabled: boolean;
  nameservers: string[];
}

export interface DomainProvider {
  readonly name: string;
  isConfigured(): boolean;

  checkAvailability(domains: string[]): Promise<DomainAvailability[]>;
  getPricing(tlds: string[]): Promise<DomainPricing[]>;

  registerDomain(req: DomainRegistrationRequest): Promise<DomainRegistrationResult>;
  renewDomain(req: DomainRenewalRequest): Promise<DomainRenewalResult>;
  transferDomain(req: DomainTransferRequest): Promise<DomainTransferResult>;
  getTransferStatus(providerTransferId: string): Promise<{ status: string; errorMessage?: string }>;

  getDomainInfo(domain: string): Promise<DomainInfo>;
  listDomains(): Promise<DomainInfo[]>;

  updateNameservers(domain: string, nameservers: string[]): Promise<void>;

  listDnsRecords(domain: string): Promise<DnsRecordResult[]>;
  createDnsRecord(domain: string, record: DnsRecordInput): Promise<DnsRecordResult>;
  updateDnsRecord(domain: string, providerRecordId: string, record: DnsRecordInput): Promise<DnsRecordResult>;
  deleteDnsRecord(domain: string, providerRecordId: string): Promise<void>;

  lockDomain(domain: string): Promise<void>;
  unlockDomain(domain: string): Promise<void>;

  enableAutoRenew(domain: string): Promise<void>;
  disableAutoRenew(domain: string): Promise<void>;

  setPrivacy(domain: string, enabled: boolean): Promise<{ supported: boolean; enabled: boolean }>;
}
