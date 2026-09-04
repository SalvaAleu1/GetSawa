import bcrypt from "bcryptjs";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";
import crypto from "crypto";

const SESSION_COOKIE = "getsawa_session";
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14;
const SESSION_SECRET_MIN_LENGTH = 32;

function getSecretKey() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < SESSION_SECRET_MIN_LENGTH) throw new Error(`SESSION_SECRET must be configured with at least ${SESSION_SECRET_MIN_LENGTH} characters.`);
  return new TextEncoder().encode(secret);
}
export async function hashPassword(password: string): Promise<string> { return bcrypt.hash(password, 12); }
export async function verifyPassword(password: string, hash: string): Promise<boolean> { return bcrypt.compare(password, hash); }
function hashToken(token: string): string { return crypto.createHash("sha256").update(token).digest("hex"); }

export async function createSession(userId: string, ip?: string, userAgent?: string) {
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await prisma.session.create({ data: { userId, tokenHash, ipAddress: ip, userAgent, expiresAt } });
  const jwt = await new SignJWT({ sid: session.id }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setIssuedAt().setExpirationTime(expiresAt).sign(getSecretKey());
  return { jwt, rawToken, tokenHash, expiresAt };
}
export async function setSessionCookie(jwt: string) { const cookieStore = await cookies(); cookieStore.set(SESSION_COOKIE, jwt, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: SESSION_TTL_SECONDS }); }
export async function clearSessionCookie() { const cookieStore = await cookies(); cookieStore.delete(SESSION_COOKIE); }

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const jwt = cookieStore.get(SESSION_COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, getSecretKey(), { algorithms: ["HS256"] });
    const sessionId = typeof payload.sid === "string" ? payload.sid : null;
    if (!sessionId) return null;
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { user: true } });
    if (!session || session.expiresAt < new Date() || session.user.isSuspended) return null;
    return session.user;
  } catch { return null; }
}
export async function requireUser() { const user = await getCurrentUser(); if (!user) throw new AuthError("Sign in required.", 401); return user; }
export async function requireAdmin(allowedRoles?: string[]) {
  const user = await requireUser();
  if (!user.adminRole) throw new AuthError("Admin access required.", 403);
  if (process.env.REQUIRE_ADMIN_MFA === "true" && !user.mfaEnabled) throw new AuthError("MFA enrollment is required for administrator access.", 403);
  if (allowedRoles && !allowedRoles.includes(user.adminRole)) throw new AuthError("You do not have permission to perform this action.", 403);
  return user;
}
export async function revokeCurrentSession() {
  const cookieStore = await cookies();
  const jwt = cookieStore.get(SESSION_COOKIE)?.value;
  if (!jwt) return false;
  try { const { payload } = await jwtVerify(jwt, getSecretKey(), { algorithms: ["HS256"] }); const sessionId = typeof payload.sid === "string" ? payload.sid : null; if (!sessionId) return false; await prisma.session.deleteMany({ where: { id: sessionId } }); await clearSessionCookie(); return true; }
  catch { await clearSessionCookie(); return false; }
}
export async function revokeAllSessions(userId: string) { await prisma.session.deleteMany({ where: { userId } }); }
export class AuthError extends Error { status: number; constructor(message: string, status = 401) { super(message); this.status = status; } }
