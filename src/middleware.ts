import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  if (!isProtected) return NextResponse.next();

  const jwt = req.cookies.get("getsawa_session")?.value;
  const secret = process.env.SESSION_SECRET;

  if (!jwt || !secret) {
    return redirectToLogin(req);
  }

  try {
    await jwtVerify(jwt, new TextEncoder().encode(secret));
    // Full authorization (role checks, suspension checks) happens again in
    // each API route / server component via requireUser/requireAdmin —
    // this middleware only gates unauthenticated access before render.
    return NextResponse.next();
  } catch {
    return redirectToLogin(req);
  }
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/dashboard/:path*", "/admin/:path*"],
};
