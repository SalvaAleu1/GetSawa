import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PREFIXES = ["/dashboard", "/admin"];

function platformHosts() {
  const hosts = new Set(["localhost", "127.0.0.1"]);
  try { if (process.env.APP_URL) hosts.add(new URL(process.env.APP_URL).hostname.toLowerCase()); } catch {}
  if (process.env.WEBSITE_PLATFORM_HOST) hosts.add(process.env.WEBSITE_PLATFORM_HOST.toLowerCase());
  return hosts;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hostname = req.headers.get("host")?.split(":")[0]?.toLowerCase() || req.nextUrl.hostname.toLowerCase();

  // Worker Custom Domains invoke the same application. Unknown hostnames are
  // rewritten to a server component that resolves an ACTIVE custom-domain row
  // and immutable production snapshot. Static Next.js assets are left alone.
  if (!platformHosts().has(hostname) && !hostname.endsWith(".workers.dev") && !pathname.startsWith("/_next/") && pathname !== "/favicon.ico") {
    const url = req.nextUrl.clone();
    url.pathname = `/site-host/${encodeURIComponent(hostname)}${pathname === "/" ? "" : pathname}`;
    return NextResponse.rewrite(url);
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  if (!isProtected) return NextResponse.next();
  const jwt = req.cookies.get("getsawa_session")?.value;
  const secret = process.env.SESSION_SECRET;
  if (!jwt || !secret) return redirectToLogin(req);
  try {
    await jwtVerify(jwt, new TextEncoder().encode(secret));
    return NextResponse.next();
  } catch { return redirectToLogin(req); }
}

function redirectToLogin(req: NextRequest) {
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image).*)"] };
