import { NextRequest } from "next/server";
import { z } from "zod";
import { requireUser } from "@/lib/auth";
import { jsonError, jsonOk, handleError } from "@/lib/api";
import { listSecurityDns, createSecurityDns, updateSecurityDns, deleteSecurityDns } from "@/lib/security-service";

type Ctx = { params: Promise<{ id: string }> };
const editableRecord = z.object({
  type: z.enum(["A", "AAAA", "CNAME", "MX", "TXT", "CAA"]),
  name: z.string().trim().min(1).max(253),
  content: z.string().trim().min(1).max(4096),
  ttl: z.number().int().positive().optional(),
  priority: z.number().int().min(0).max(65535).optional(),
  proxied: z.boolean().optional(),
});
const updateRecord = editableRecord.extend({ id: z.string().min(1) });

export async function GET(_req: NextRequest, { params }: Ctx) {
  try { const user = await requireUser(); const { id } = await params; return jsonOk({ records: await listSecurityDns(user.id, id) }); }
  catch (error) { return handleError(error); }
}
export async function POST(req: NextRequest, { params }: Ctx) {
  try { const user = await requireUser(); const { id } = await params; const parsed = editableRecord.safeParse(await req.json()); if (!parsed.success) return jsonError("Invalid DNS record.", 422); return jsonOk({ record: await createSecurityDns(user.id, id, parsed.data) }); }
  catch (error) { return handleError(error); }
}
export async function PUT(req: NextRequest, { params }: Ctx) {
  try { const user = await requireUser(); const { id } = await params; const parsed = updateRecord.safeParse(await req.json()); if (!parsed.success) return jsonError("Invalid DNS record update.", 422); const { id: recordId, ...data } = parsed.data; return jsonOk({ record: await updateSecurityDns(user.id, id, recordId, data) }); }
  catch (error) { return handleError(error); }
}
export async function DELETE(req: NextRequest, { params }: Ctx) {
  try { const user = await requireUser(); const { id } = await params; const body = await req.json().catch(() => ({})); const recordId = typeof body?.id === "string" ? body.id : ""; if (!recordId) return jsonError("DNS record ID is required.", 422); await deleteSecurityDns(user.id, id, recordId); return jsonOk({ deleted: true }); }
  catch (error) { return handleError(error); }
}
