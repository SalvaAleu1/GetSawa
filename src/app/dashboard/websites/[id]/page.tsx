"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams } from "next/navigation";
import { WebsiteContent } from "@/lib/ai/website-schema";

interface Project {
  id: string;
  name: string;
  slug: string;
  status: string;
  content: WebsiteContent | null;
  domainId: string | null;
  domainConnectionStatus: string | null;
}

const PAGE_OPTIONS = ["home", "about", "services", "pricing", "contact", "faq"];

export default function WebsiteEditorPage() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<Project | null>(null);
  const [content, setContent] = useState<WebsiteContent | null>(null);
  const [selectedPages, setSelectedPages] = useState<string[]>(["home", "about", "services", "contact"]);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [domains, setDomains] = useState<{ id: string; name: string }[]>([]);
  const [selectedDomain, setSelectedDomain] = useState("");
  const [connectMessage, setConnectMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/dashboard/websites/${id}`);
    const data = await res.json();
    if (res.ok) {
      setProject(data.project);
      setContent(data.project.content);
    }
  }, [id]);

  useEffect(() => {
    load();
    fetch("/api/dashboard/domains").then((r) => r.json()).then((d) => setDomains((d.domains || []).map((x: any) => ({ id: x.id, name: x.name }))));
  }, [load]);

  async function handleGenerate() {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/websites/${id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pages: selectedPages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");
      setProject(data.project);
      setContent(data.project.content);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setGenerating(false);
    }
  }

  async function handleSave() {
    if (!content) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/websites/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, note: "Manual edit" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save.");
      setProject(data.project);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  async function handlePublish(publish: boolean) {
    const res = await fetch(`/api/dashboard/websites/${id}/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ publish }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setProject(data.project);
  }

  async function handleConnectDomain() {
    if (!selectedDomain) return;
    const res = await fetch(`/api/dashboard/websites/${id}/connect-domain`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ domainId: selectedDomain }),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error);
      return;
    }
    setConnectMessage(data.instructions);
    setProject(data.project);
  }

  function updatePage(index: number, patch: Partial<WebsiteContent["pages"][number]>) {
    if (!content) return;
    const pages = content.pages.map((p, i) => (i === index ? { ...p, ...patch } : p));
    setContent({ ...content, pages });
  }

  if (!project) return <p className="text-ink/60">Loading…</p>;

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          <p className="text-sm text-ink/50">/sites/{project.slug}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={project.status === "PUBLISHED" ? "badge-success" : "badge-neutral"}>{project.status}</span>
          {project.status === "PUBLISHED" ? (
            <button onClick={() => handlePublish(false)} className="btn-secondary">Unpublish</button>
          ) : (
            <button onClick={() => handlePublish(true)} className="btn-primary">Publish</button>
          )}
        </div>
      </div>

      {error && <p className="mt-4 text-sm text-danger">{error}</p>}

      {!content && (
        <div className="card mt-6 p-6">
          <p className="font-medium">Generate your website content</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {PAGE_OPTIONS.map((p) => (
              <label key={p} className="flex items-center gap-1.5 text-sm">
                <input
                  type="checkbox"
                  checked={selectedPages.includes(p)}
                  onChange={(e) =>
                    setSelectedPages(e.target.checked ? [...selectedPages, p] : selectedPages.filter((x) => x !== p))
                  }
                />
                {p}
              </label>
            ))}
          </div>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary mt-4">
            {generating ? "Generating…" : "Generate with AI"}
          </button>
        </div>
      )}

      {content && (
        <div className="mt-6 space-y-6">
          <div className="card p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Business name</label>
                <input className="input" value={content.businessName} onChange={(e) => setContent({ ...content, businessName: e.target.value })} />
              </div>
              <div>
                <label className="label">Tagline</label>
                <input className="input" value={content.tagline || ""} onChange={(e) => setContent({ ...content, tagline: e.target.value })} />
              </div>
            </div>
          </div>

          {content.pages.map((page, i) => (
            <div key={page.slug} className="card p-6">
              <h3 className="font-semibold capitalize">{page.slug}</h3>
              <div className="mt-3 grid gap-3">
                <input className="input" placeholder="Headline" value={page.headline || ""} onChange={(e) => updatePage(i, { headline: e.target.value })} />
                <input className="input" placeholder="Subheadline" value={page.subheadline || ""} onChange={(e) => updatePage(i, { subheadline: e.target.value })} />
                {page.sections.map((s, si) => (
                  <div key={si} className="rounded-lg border border-border p-3">
                    <input
                      className="input mb-2"
                      value={s.heading}
                      onChange={(e) => {
                        const sections = page.sections.map((x, idx) => (idx === si ? { ...x, heading: e.target.value } : x));
                        updatePage(i, { sections });
                      }}
                    />
                    <textarea
                      className="input"
                      rows={2}
                      value={s.body}
                      onChange={(e) => {
                        const sections = page.sections.map((x, idx) => (idx === si ? { ...x, body: e.target.value } : x));
                        updatePage(i, { sections });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
          ))}

          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? "Saving…" : "Save changes"}</button>
        </div>
      )}

      <div className="card mt-6 p-6">
        <h3 className="font-semibold">Connect a domain</h3>
        <p className="mt-1 text-sm text-ink/60">
          Point one of your registered domains at this site. Your site stays reachable at /sites/{project.slug} either way.
        </p>
        <div className="mt-3 flex gap-2">
          <select className="input max-w-xs" value={selectedDomain} onChange={(e) => setSelectedDomain(e.target.value)}>
            <option value="">Select a domain…</option>
            {domains.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          <button onClick={handleConnectDomain} disabled={!selectedDomain} className="btn-secondary">Connect</button>
        </div>
        {connectMessage && <p className="mt-3 text-sm text-ink/60">{connectMessage}</p>}
      </div>
    </div>
  );
}
