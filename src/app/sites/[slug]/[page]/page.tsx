import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/prisma";
import { getPublishedSnapshot } from "@/lib/website-editor";
import { WebsiteRenderer } from "@/components/websites/WebsiteRenderer";

async function load(slug:string,pageSlug:string){const project=await prisma.websiteProject.findUnique({where:{slug}});if(!project||project.status!=="PUBLISHED")return null;const snapshot=await getPublishedSnapshot(project.id);if(!snapshot)return null;const page=snapshot.content.pages.find(p=>p.slug===pageSlug);if(!page)return null;return{project,content:snapshot.content,page};}
type Params={params:Promise<{slug:string;page:string}>};
export async function generateMetadata({params}:Params):Promise<Metadata>{const{slug,page}=await params;const data=await load(slug,page);if(!data)return{};return{title:data.page.seoTitle||`${data.page.title} | ${data.content.businessName}`,description:data.page.metaDescription||data.content.tagline,robots:data.page.noIndex?{index:false,follow:true}:undefined};}
export default async function PublishedSubpage({params}:Params){const{slug,page}=await params;const data=await load(slug,page);if(!data)notFound();return <WebsiteRenderer content={data.content} pageSlug={page} basePath={`/sites/${slug}`}/>;}
