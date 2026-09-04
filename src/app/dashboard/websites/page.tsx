"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface Project {
  id: string;
  name: string;
  slug: string;
  status: string;
  updatedAt: string;
}

export default function WebsitesPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ name: "", businessDescription: "", category: "", tone: "professional" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetch("/api/dashboard/websites").then((r) => r.json()).then((d) => setProjects(d.projects || [])).finally(() => setLoading(false));
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard/websites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create project.");
      router.push(`/dashboard/websites/${data.project.id}`);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">My Websites</h1>
        <button onClick={() => setShowForm(!showForm)} className="btn-primary">New website</button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
          <div>
            <label className="label">Business or project name</label>
            <input className="input" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <label className="label">Describe your business</label>
            <textarea className="input" rows={3} required value={form.businessDescription} onChange={(e) => setForm({ ...form, businessDescription: e.target.value })} placeholder="What do you do, who is it for, what makes it different?" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Category (optional)</label>
              <input className="input" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="e.g. restaurant, consulting, NGO" />
            </div>
            <div>
              <label className="label">Tone</label>
              <select className="input" value={form.tone} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                <option value="professional">Professional</option>
                <option value="friendly">Friendly</option>
                <option value="bold">Bold</option>
                <option value="minimal">Minimal</option>
              </select>
            </div>
          </div>
          {error && <p className="text-sm text-danger">{error}</p>}
          <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Creating…" : "Create project"}</button>
        </form>
      )}

      {loading ? (
        <p className="mt-6 text-ink/60">Loading…</p>
      ) : projects.length === 0 ? (
        <div className="card mt-6 p-10 text-center">
          <p className="font-medium">Build your first website with GetSawa AI.</p>
          <button onClick={() => setShowForm(true)} className="btn-primary mt-4 inline-flex">Create website</button>
        </div>
      ) : (
        <div className="card mt-6 divide-y divide-border">
          {projects.map((p) => (
            <Link key={p.id} href={`/dashboard/websites/${p.id}`} className="flex items-center justify-between px-5 py-4 hover:bg-paper">
              <div>
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-ink/50">/sites/{p.slug}</p>
              </div>
              <span className={p.status === "PUBLISHED" ? "badge-success" : "badge-neutral"}>{p.status}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
