import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshot } from "@/lib/website-editor";
import { WebsiteRenderer } from "@/components/websites/WebsiteRenderer";

async function getPublishedProject(slug:string){const project=await prisma.websiteProject.findUnique({where:{slug}});if(!project||project.status!=="PUBLISHED")return null;const snapshot=await getPublishedSnapshot(project.id);if(!snapshot)return null;return{project,content:snapshot.content};}
type Params={params:Promise<{slug:string}>};
export async function generateMetadata({params}:Params):Promise<Metadata>{const{slug}=await params;const data=await getPublishedProject(slug);if(!data)return{};const home=data.content.pages.find(p=>p.slug==="home")??data.content.pages[0];return{title:home?.seoTitle||data.content.businessName,description:home?.metaDescription||data.content.tagline,robots:home?.noIndex?{index:false,follow:true}:undefined};}
export default async function PublicSitePage({params}:Params){const{slug}=await params;const data=await getPublishedProject(slug);if(!data)notFound();return <WebsiteRenderer content={data.content} pageSlug="home"/>;}
