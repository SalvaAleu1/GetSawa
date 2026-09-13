export default function GlobalLoading() {
  return (
    <div className="shell-container py-10" role="status" aria-live="polite" aria-label="Loading page">
      <span className="sr-only">Loading…</span>
      <div className="space-y-5" aria-hidden="true">
        <div className="skeleton h-8 w-56" />
        <div className="skeleton h-4 w-full max-w-xl" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
          <div className="skeleton h-40" />
        </div>
      </div>
    </div>
  );
}
