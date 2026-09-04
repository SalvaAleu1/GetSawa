import { WebsiteContent } from "@/lib/ai/website-schema";

export interface WebsiteGenerationInput {
  businessName: string;
  businessDescription: string;
  category?: string;
  tone?: string;
  pages: string[]; // requested page slugs, e.g. ["home", "about", "services", "contact"]
}

export interface AIProvider {
  readonly name: string;
  isConfigured(): boolean;
  generateWebsiteContent(input: WebsiteGenerationInput): Promise<WebsiteContent>;
}

export class AIProviderNotConfiguredError extends Error {
  constructor() {
    super("The AI website builder is not currently available. The AI provider has not been configured yet.");
    this.name = "AIProviderNotConfiguredError";
  }
}
