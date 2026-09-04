import { Navbar } from "@/components/Navbar";

export default function PrivacyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Privacy Policy</h1>
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
          This is a placeholder. Replace this page with a Privacy Policy reviewed by a qualified lawyer in your
          jurisdiction, describing what data GetSawa actually collects and how it's used, before accepting real
          customers.
        </div>
        <p className="mt-6 text-sm text-ink/60">
          Content for this page is not yet published. An administrator can edit and publish this page from the CMS.
        </p>
      </main>
    </>
  );
}
