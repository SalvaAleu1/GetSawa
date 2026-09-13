"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Project { id: string; name: string; slug: string; status: string; updatedAt: string; }

export default function WebsitesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", businessDescription: "", category: "", tone: "professional" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load(){try{const r=await fetch("/api/dashboard/websites",{cache:"no-store"});const b=await r.json();if(!r.ok)throw new Error(b.error||"Unable to load websites.");setProjects((b.data??b).projects||[]);}catch(e){setError(e instanceof Error?e.message:"Unable to load websites.");}finally{setLoading(false);}}
  useEffect(()=>{void load();},[]);

  async function handleCreate(e:React.FormEvent){e.preventDefault();setSubmitting(true);setError(null);try{const res=await fetch("/api/dashboard/websites",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const data=await res.json();if(!res.ok)throw new Error(data.error||"Could not create project.");const project=(data.data??data).project;router.push(`/dashboard/websites/${project.id}`);}catch(e){setError(e instanceof Error?e.message:"Could not create project.");}finally{setSubmitting(false);}}

  return <main className="space-y-6"><div className="flex items-center justify-between"><div><h1 className="text-2xl font-semibold">My Websites</h1><p className="mt-1 text-sm text-ink/55">Build safely, publish immutable versions, and manage production domains separately.</p></div><button onClick={()=>setShowForm(!showForm)} className="btn-primary">New website</button></div>
  {error&&<div className="rounded-xl border border-danger/20 bg-danger/5 p-4 text-sm text-danger">{error}</div>}
  {showForm&&<form onSubmit={handleCreate} className="card space-y-4 p-6"><label className="label">Business or project name<input className="input mt-1" required value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></label><label className="label">Describe your business<textarea className="input mt-1" rows={3} required value={form.businessDescription} onChange={e=>setForm({...form,businessDescription:e.target.value})}/></label><div className="grid grid-cols-2 gap-4"><label className="label">Category<input className="input mt-1" value={form.category} onChange={e=>setForm({...form,category:e.target.value})}/></label><label className="label">Tone<select className="input mt-1" value={form.tone} onChange={e=>setForm({...form,tone:e.target.value})}><option value="professional">Professional</option><option value="friendly">Friendly</option><option value="bold">Bold</option><option value="minimal">Minimal</option></select></label></div><button type="submit" disabled={submitting} className="btn-primary">{submitting?"Creating…":"Create project"}</button></form>}
  {loading?<p className="text-sm text-ink/60">Loading…</p>:projects.length===0?<div className="card p-10 text-center"><p className="font-medium">Build your first website with GetSawa AI.</p><button onClick={()=>setShowForm(true)} className="btn-primary mt-4">Create website</button></div>:<div className="card divide-y divide-border">{projects.map(p=><div key={p.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{p.name}</p><p className="text-xs text-ink/50">/sites/{p.slug}</p></div><div className="flex items-center gap-2"><span className={p.status==="PUBLISHED"?"badge-success":"badge-neutral"}>{p.status}</span><Link className="btn-secondary" href={`/dashboard/websites/${p.id}`}>Edit</Link><Link className="btn-secondary" href={`/dashboard/websites/${p.id}/publishing`}>Publishing</Link></div></div>)}</div>}</main>;
}
