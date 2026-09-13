import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { getEditorState, saveWebsiteDocument } from "@/lib/website-editor";
import { getAIProvider } from "@/lib/providers/ai/AIProviderFactory";
import { normalizeWebsiteContent } from "@/lib/ai/website-schema";
import { checkRateLimit } from "@/lib/rate-limit";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

const schema = z.object({ scope: z.enum(["PAGE", "SECTION"]), pageSlug: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), sectionIndex: z.number().int().min(0).max(19).optional(), baseVersionId: z.string().nullable().optional() });
type RouteContext = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: RouteContext) {
  try {
    const user = await requireUser(); const { id } = await params; const input = schema.parse(await req.json());
    const rl = checkRateLimit("ai-regenerate", user.id, { max: 20, windowMs: 60 * 60_000 });
    if (!rl.allowed) return jsonError("You've reached the AI regeneration limit for now.", 429);
    const editor = await getEditorState(id, user.id);
    if (!editor.content) return jsonError("Generate or write website content before regenerating a page.", 409);
    const provider = getAIProvider();
    if (!provider.isConfigured()) return jsonError("AI regeneration is unavailable until the AI provider is configured.", 503, { code: "PROVIDER_NOT_CONFIGURED" });
    const current = normalizeWebsiteContent(editor.content);
    const pageIndex = current.pages.findIndex((page) => page.slug === input.pageSlug);
    if (pageIndex < 0) return jsonError("The selected page does not exist.", 404);
    const currentPage = current.pages[pageIndex];
    if (!currentPage) return jsonError("The selected page does not exist.", 404);
    const generated = normalizeWebsiteContent(await provider.generateWebsiteContent({ businessName: current.businessName, businessDescription: editor.project.businessDescription || "", category: editor.project.category || undefined, tone: editor.project.tone || undefined, pages: [input.pageSlug] }));
    const generatedPage = generated.pages[0];
    if (!generatedPage) return jsonError("The AI provider did not return the requested page.", 502);
    const pages = [...current.pages];
    if (input.scope === "PAGE") {
      pages[pageIndex] = { ...generatedPage, slug: currentPage.slug, title: currentPage.title };
    } else {
      if (input.sectionIndex == null || !currentPage.sections[input.sectionIndex]) return jsonError("The selected section does not exist.", 404);
      const replacement = generatedPage.sections[input.sectionIndex] ?? generatedPage.sections[0];
      if (!replacement) return jsonError("The AI provider did not return replacement section content.", 502);
      const sections = [...currentPage.sections];
      sections[input.sectionIndex] = replacement;
      pages[pageIndex] = { ...currentPage, sections };
    }
    const result = await saveWebsiteDocument({ projectId: id, userId: user.id, content: { ...current, pages }, note: `AI regenerated ${input.scope.toLowerCase()} ${input.pageSlug}`, baseVersionId: input.baseVersionId });
    await logAudit({ actorId: user.id, action: "website.ai_regenerated", resource: "website_project", resourceId: id, metadata: { scope: input.scope, pageSlug: input.pageSlug, sectionIndex: input.sectionIndex ?? null, versionId: result.version.id } });
    return jsonOk(result);
  } catch (error: any) {
    if (error?.code === "EDITOR_CONFLICT") return jsonError(error.message, 409, { code: "EDITOR_CONFLICT" });
    return handleError(error);
  }
}
