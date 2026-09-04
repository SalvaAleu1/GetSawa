# AI Website Builder

## How it works

1. A customer creates a `WebsiteProject` (`/dashboard/websites`) with a
   business name and description.
2. `/api/dashboard/websites/[id]/generate` calls the configured AI provider
   (`lib/providers/ai/AIProviderFactory.ts`) to generate structured content —
   not raw HTML — matching `lib/ai/website-schema.ts`. The response is
   validated with Zod before it's stored; a malformed AI response fails the
   request instead of corrupting the project.
3. The customer edits the generated copy in `/dashboard/websites/[id]`. Every
   save (AI-generated or manual) is also recorded as a `WebsiteVersion` row.
4. Publishing sets `status = PUBLISHED`; the site then renders live at
   `/sites/{slug}` on your own platform domain — this is real, working
   hosting, served directly by this Next.js app from the stored content, not
   a placeholder.

## Why content is structured data, not HTML

The AI is asked for a fixed JSON shape (headline, sections, FAQs, etc.),
and `/sites/[slug]/page.tsx` renders that data through a fixed, trusted
template. The AI's output is never `dangerouslySetInnerHTML`'d or otherwise
executed as markup. This is a deliberate security boundary — letting an LLM
generate raw HTML/JS that gets served to visitors would be a stored-XSS risk
regardless of how good the model is.

## Configuring the AI provider

```
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...      # from https://console.anthropic.com
AI_MODEL=claude-sonnet-4-5  # check https://docs.claude.com/en/docs/about-claude/models for current names
```

`AnthropicAIProvider` (`lib/providers/ai/AnthropicAIProvider.ts`) calls the
real Anthropic Messages API. To use a different vendor, implement the
`AIProvider` interface (`lib/providers/ai/AIProvider.ts`) against that
vendor's API and point `AIProviderFactory.ts` at it — same pattern as the
domain/payment providers.

Test connectivity from `/admin/providers` — this runs one real, small
generation call and discards the result.

## Domain connection and SSL — what's real and what isn't

Connecting a registered domain (`/api/dashboard/websites/[id]/connect-domain`)
creates a real CNAME DNS record through NameSilo pointing
`www.{domain}` at `WEBSITE_HOSTING_TARGET` (an env var you set to wherever
this app is actually deployed).

**What this does NOT do**: automatically provision a TLS certificate for the
customer's custom domain. That requires certificate automation (e.g. ACME/
Let's Encrypt with per-domain certificate issuance and a matching reverse-
proxy configuration) that is genuinely infrastructure-dependent on how and
where you deploy this app, so it isn't something a single codebase can
honestly claim to "just work" without knowing your hosting target. The
published site remains fully served over HTTPS at its `/sites/{slug}` URL
regardless of whether a custom domain is connected — that part needs no
extra work from you.

If you want automated custom-domain SSL, the natural next step is either (a)
deploying behind a platform that does this for you when you add a custom
domain (e.g. some managed Next.js hosts support exactly this), or (b)
adding a certificate-automation service in front of this app.

## Rate limiting

Generation is rate-limited per user (10/hour by default,
`lib/rate-limit.ts`, bucket `"ai-generate"`) since each call costs real
money against your AI provider account.
