"use client";

import { useEffect, useState } from "react";

interface Post {
  id: string;
  title: string;
  slug: string;
  status: string;
  createdAt: string;
}

export default function AdminBlogPage() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [form, setForm] = useState({ title: "", slug: "", excerpt: "", body: "" });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    const res = await fetch("/api/admin/blog");
    const data = await res.json();
    setPosts(data.posts || []);
  }

  useEffect(() => {
    load();
  }, []);

  function handleTitleChange(title: string) {
    setForm({ ...form, title, slug: form.slug || title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") });
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/blog", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, status: "DRAFT" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not create post.");
      setForm({ title: "", slug: "", excerpt: "", body: "" });
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function togglePublish(post: Post) {
    await fetch(`/api/admin/blog/${post.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: post.status === "PUBLISHED" ? "DRAFT" : "PUBLISHED" }),
    });
    load();
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold">Blog</h1>

      <div className="card mt-6 divide-y divide-border">
        {posts.map((p) => (
          <div key={p.id} className="flex items-center justify-between px-5 py-3.5">
            <div>
              <p className="font-medium">{p.title}</p>
              <p className="text-xs text-ink/50">/blog/{p.slug}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className={p.status === "PUBLISHED" ? "badge-success" : "badge-neutral"}>{p.status}</span>
              <button onClick={() => togglePublish(p)} className="btn-secondary">
                {p.status === "PUBLISHED" ? "Unpublish" : "Publish"}
              </button>
            </div>
          </div>
        ))}
        {posts.length === 0 && <p className="p-5 text-sm text-ink/60">No posts yet.</p>}
      </div>

      <form onSubmit={handleCreate} className="card mt-6 space-y-4 p-6">
        <h2 className="font-semibold">New post</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="label">Title</label>
            <input className="input" required value={form.title} onChange={(e) => handleTitleChange(e.target.value)} />
          </div>
          <div>
            <label className="label">Slug</label>
            <input className="input" required value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} />
          </div>
        </div>
        <div>
          <label className="label">Excerpt</label>
          <input className="input" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        </div>
        <div>
          <label className="label">Body (markdown)</label>
          <textarea className="input" rows={10} required value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </div>
        {error && <p className="text-sm text-danger">{error}</p>}
        <button type="submit" disabled={submitting} className="btn-primary">{submitting ? "Saving…" : "Save as draft"}</button>
      </form>
    </div>
  );
}
