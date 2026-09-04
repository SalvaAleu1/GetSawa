import { Navbar } from "@/components/Navbar";

export default function TermsPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Terms of Service</h1>
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
          This is a placeholder. Replace this page with Terms of Service reviewed by a qualified lawyer in your
          jurisdiction before accepting real customers — GetSawa does not generate or verify legal compliance content
          (spec section 101).
        </div>
        <p className="mt-6 text-sm text-ink/60">
          Content for this page is not yet published. An administrator can edit and publish this page from the CMS.
        </p>
      </main>
    </>
  );
}
