import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";

export async function POST() {
  try {
    const cookieStore = await cookies();
    const jwt = cookieStore.get("getsawa_session")?.value;
    if (jwt && process.env.SESSION_SECRET && process.env.SESSION_SECRET.length >= 32) {
      try {
        const { payload } = await jwtVerify(
          jwt,
          new TextEncoder().encode(process.env.SESSION_SECRET),
          { algorithms: ["HS256"] },
        );
        const sid = typeof payload.sid === "string" ? payload.sid : null;
        if (sid) {
          await prisma.session.delete({ where: { id: sid } }).catch(() => null);
        }
      } catch {
        // token already invalid — nothing to revoke
      }
    }
    await clearSessionCookie();
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
