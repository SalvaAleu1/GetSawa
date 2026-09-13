import { NextRequest,NextResponse } from "next/server";
import { jwtVerify } from "jose";

const PROTECTED_PREFIXES=["/dashboard","/admin"];
const COOKIE_MUTATION_PREFIXES=["/api/dashboard","/api/admin","/api/checkout","/api/auth"];
function platformHosts(){const hosts=new Set(["localhost","127.0.0.1","getsawa.internal"]);try{if(process.env.APP_URL)hosts.add(new URL(process.env.APP_URL).hostname.toLowerCase());}catch{}if(process.env.WEBSITE_PLATFORM_HOST)hosts.add(process.env.WEBSITE_PLATFORM_HOST.toLowerCase());return hosts;}
function mutating(method:string){return!["GET","HEAD","OPTIONS"].includes(method.toUpperCase());}
function crossSiteMutation(req:NextRequest,hostname:string){if(!mutating(req.method)||!COOKIE_MUTATION_PREFIXES.some(prefix=>req.nextUrl.pathname.startsWith(prefix)))return false;const fetchSite=req.headers.get("sec-fetch-site");if(fetchSite==="cross-site")return true;const origin=req.headers.get("origin");if(!origin)return false;try{const originHost=new URL(origin).hostname.toLowerCase();const allowed=platformHosts();allowed.add(hostname);return!allowed.has(originHost);}catch{return true;}}
function harden(response:NextResponse,pathname:string){if(pathname.startsWith("/dashboard")||pathname.startsWith("/admin")||pathname==="/login"||pathname==="/register"){response.headers.set("X-Content-Type-Options","nosniff");response.headers.set("X-Frame-Options","DENY");response.headers.set("Referrer-Policy","no-referrer");response.headers.set("Permissions-Policy","camera=(), microphone=(), geolocation=()");response.headers.set("Cache-Control","no-store");}return response;}
export async function middleware(req:NextRequest){const{pathname}=req.nextUrl;const hostname=req.headers.get("host")?.split(":")[0]?.toLowerCase()||req.nextUrl.hostname.toLowerCase();const hosts=platformHosts();
 if(!hosts.has(hostname)&&!hostname.endsWith(".workers.dev")&&!pathname.startsWith("/_next/")&&pathname!=="/favicon.ico"){const url=req.nextUrl.clone();url.pathname=`/site-host/${encodeURIComponent(hostname)}${pathname==="/"?"":pathname}`;return NextResponse.rewrite(url);}
 if(crossSiteMutation(req,hostname))return NextResponse.json({error:"Cross-site state-changing request rejected."},{status:403,headers:{"Cache-Control":"no-store"}});
 const isProtected=PROTECTED_PREFIXES.some(prefix=>pathname.startsWith(prefix));if(!isProtected)return harden(NextResponse.next(),pathname);
 const jwt=req.cookies.get("getsawa_session")?.value;const secret=process.env.SESSION_SECRET;if(!jwt||!secret)return harden(redirectToLogin(req),pathname);
 try{await jwtVerify(jwt,new TextEncoder().encode(secret),{algorithms:["HS256"]});return harden(NextResponse.next(),pathname);}catch{return harden(redirectToLogin(req),pathname);}}
function redirectToLogin(req:NextRequest){const url=req.nextUrl.clone();url.pathname="/login";url.searchParams.set("next",req.nextUrl.pathname);return NextResponse.redirect(url);}
export const config={matcher:["/((?!_next/static|_next/image).*)"]};
