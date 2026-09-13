import Link from "next/link";

export const metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

export default function OfflinePage() {
  return (
    <main className="shell-container flex min-h-screen items-center justify-center py-16">
      <section className="card w-full max-w-xl p-8 text-center sm:p-10" aria-labelledby="offline-title">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-50 text-2xl" aria-hidden="true">
          ↻
        </div>
        <p className="eyebrow">Connection unavailable</p>
        <h1 id="offline-title" className="mt-2 text-3xl font-bold text-ink">
          You&apos;re offline
        </h1>
        <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-ink/60">
          GetSawa could not reach the network. Previously visited public pages may still open from this device, but payments and account changes require a connection.
        </p>
        <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
          <Link className="btn-primary" href="/">
            Try the homepage
          </Link>
          <a className="btn-secondary" href="/offline">
            Reconnect and reload
          </a>
        </div>
      </section>
    </main>
  );
}
