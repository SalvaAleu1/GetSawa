import { AIProvider, WebsiteGenerationInput, AIProviderNotConfiguredError } from "./AIProvider";
import { websiteContentSchema, WebsiteContent } from "@/lib/ai/website-schema";

/**
 * Calls the Anthropic Messages API (https://docs.claude.com/en/api/messages)
 * to generate structured website copy. Requires AI_API_KEY (an Anthropic
 * API key from console.anthropic.com) and, optionally, AI_MODEL to pick a
 * specific model — check https://docs.claude.com/en/docs/about-claude/models
 * for current model names, since these change over time and this code
 * intentionally does not hard-code one beyond a documented default.
 *
 * The model is asked to return ONLY JSON matching websiteContentSchema; the
 * response is parsed and validated before anything is stored or shown to a
 * customer, so a malformed AI response fails loudly instead of silently
 * corrupting a website project.
 */
export class AnthropicAIProvider implements AIProvider {
  readonly name = "anthropic";

  isConfigured(): boolean {
    return Boolean(process.env.AI_API_KEY) && (process.env.AI_PROVIDER ?? "anthropic") === "anthropic";
  }

  async generateWebsiteContent(input: WebsiteGenerationInput): Promise<WebsiteContent> {
    if (!this.isConfigured()) throw new AIProviderNotConfiguredError();

    const model = process.env.AI_MODEL || "claude-sonnet-4-5";

    const prompt = buildPrompt(input);

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.AI_API_KEY as string,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: prompt }],
      }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`AI provider request failed (HTTP ${res.status}): ${body.slice(0, 300)}`);
    }

    const data = await res.json();
    const text: string = (data.content ?? [])
      .filter((b: any) => b.type === "text")
      .map((b: any) => b.text)
      .join("\n");

    const jsonText = extractJson(text);
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      throw new Error("The AI provider did not return valid content. Please try generating again.");
    }

    const result = websiteContentSchema.safeParse(parsed);
    if (!result.success) {
      throw new Error("The AI provider returned content in an unexpected shape. Please try generating again.");
    }
    return result.data;
  }
}

function buildPrompt(input: WebsiteGenerationInput): string {
  return `You are generating website copy for a small business. Return ONLY a single JSON object — no markdown fences, no commentary before or after — matching exactly this shape:

{
  "businessName": string,
  "tagline": string,
  "colors": { "primary": string, "accent": string },
  "pages": [
    {
      "slug": string,          // one of: ${input.pages.join(", ")}
      "title": string,
      "seoTitle": string,      // <= 70 characters
      "metaDescription": string, // <= 160 characters
      "headline": string,
      "subheadline": string,
      "sections": [ { "heading": string, "body": string } ],  // 2-5 sections
      "faqs": [ { "question": string, "answer": string } ],   // 0-4 faqs, only on pages where relevant
      "ctaLabel": string
    }
  ]
}

Business name: ${input.businessName}
Business description: ${input.businessDescription}
Category: ${input.category || "general business"}
Tone: ${input.tone || "professional and approachable"}
Pages to generate (one object per slug, in this exact order): ${input.pages.join(", ")}

Write real, specific, useful copy — no lorem ipsum, no placeholder brackets. Keep it grounded in the business description given; do not invent unrelated services, addresses, prices, or claims of certifications/awards that weren't mentioned.`;
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1) return trimmed;
  return trimmed.slice(start, end + 1);
}
