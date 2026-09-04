import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import { prisma } from "@/lib/prisma";
import { clearSessionCookie } from "@/lib/auth";
import { jsonOk, handleError } from "@/lib/api";

export async function POST() {
  try {
    const jwt = cookies().get("getsawa_session")?.value;
    if (jwt && process.env.SESSION_SECRET) {
      try {
        const { payload } = await jwtVerify(jwt, new TextEncoder().encode(process.env.SESSION_SECRET));
        const sid = payload.sid as string;
        await prisma.session.delete({ where: { id: sid } }).catch(() => null);
      } catch {
        // token already invalid — nothing to revoke
      }
    }
    clearSessionCookie();
    return jsonOk({ success: true });
  } catch (err) {
    return handleError(err);
  }
}
