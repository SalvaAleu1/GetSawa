"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function DomainSearchBox() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const clean = (query.trim().replace(/^https?:\/\//, "").split("/")[0] ?? "").split(".")[0] ?? "";
    if (!clean) return;
    router.push(`/domains/search?q=${encodeURIComponent(clean)}`);
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto flex w-full max-w-2xl flex-col gap-3 sm:flex-row">
      <input
        className="input flex-1 !py-3.5 text-base"
        placeholder="yourbusiness"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
      />
      <button type="submit" className="btn-primary !py-3.5 !px-8 text-base">
        Search domains
      </button>
    </form>
  );
}
