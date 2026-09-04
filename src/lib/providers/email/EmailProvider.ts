/**
 * Same situation as HostingProvider: no business email vendor (e.g. an
 * IMAP/SMTP hosting API, Google Workspace reseller API, Microsoft 365
 * partner API) was named in the spec, so this is an interface with no
 * concrete implementation yet. EMAIL_PROVIDER_API_KEY stays unset until
 * one is wired in, and the product-activation workflow will not allow a
 * business email product to go ACTIVE until it is.
 */
export interface MailboxRequest {
  domain: string;
  localPart: string; // "hello" for hello@domain.com
  customerEmail: string;
  storageMb: number;
  idempotencyKey: string;
}

export interface MailboxResult {
  success: boolean;
  providerMailboxId?: string;
  errorMessage?: string;
}

export interface EmailProvider {
  readonly name: string;
  isConfigured(): boolean;
  createMailbox(req: MailboxRequest): Promise<MailboxResult>;
  deleteMailbox(providerMailboxId: string): Promise<void>;
}

export class UnconfiguredEmailProvider implements EmailProvider {
  readonly name = "none";
  isConfigured(): boolean {
    return false;
  }
  async createMailbox(): Promise<MailboxResult> {
    return { success: false, errorMessage: "No business email provider is configured yet." };
  }
  async deleteMailbox(): Promise<void> {
    throw new Error("No business email provider is configured.");
  }
}

export function getEmailProvider(): EmailProvider {
  return new UnconfiguredEmailProvider();
}
