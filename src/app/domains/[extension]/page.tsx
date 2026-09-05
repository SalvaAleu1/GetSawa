import { notFound } from "next/navigation";
import { Navbar } from "@/components/Navbar";
import { DomainSearchBox } from "@/components/DomainSearchBox";
import { prisma } from "@/lib/prisma";
import { computeTldPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import type { Metadata } from "next";
async function getTld(extension: string) { const tld = await prisma.tld.findUnique({ where: { extension } }); if (!tld || !tld.isActive) return null; return tld; }
type PageParams = { params: Promise<{ extension: string }> };
export async function generateMetadata({ params }: PageParams): Promise<Metadata> { const { extension } = await params; const tld = await getTld(extension); if (!tld) return {}; return { title: `.${tld.extension} Domains — GetSawa`, description: `Register a .${tld.extension} domain with GetSawa.` }; }
export default async function TldLandingPage({ params }: PageParams) { const { extension } = await params; const tld = await getTld(extension); if (!tld) notFound(); const price = computeTldPrice(tld); return (<><Navbar /><main className="mx-auto max-w-3xl px-6 py-16 text-center"><h1 className="text-3xl font-semibold">.{tld.extension} Domains</h1><p className="mt-3 text-ink/60">Register from <strong>{formatCents(price.registerCents, price.currency)}</strong>/year · renews at {formatCents(price.renewCents, price.currency)}/year{price.transferCents != null && <> · transfer for {formatCents(price.transferCents, price.currency)}</>}</p><div className="mt-8"><DomainSearchBox /></div>{tld.supportsPrivacy && <p className="mt-6 text-sm text-ink/50">WHOIS privacy available for this extension.</p>}</main></>); }
