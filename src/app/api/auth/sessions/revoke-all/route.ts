import { requireUser, revokeAllSessions } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";
import { logAudit } from "@/lib/audit";

export const runtime = "nodejs";

export async function POST() {
  try {
    const user = await requireUser();
    await revokeAllSessions(user.id);
    await logAudit({ actorId: user.id, action: "security.sessions_revoked", resource: "user", resourceId: user.id });
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
