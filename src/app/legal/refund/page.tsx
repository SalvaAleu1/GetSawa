import { Navbar } from "@/components/Navbar";

export default function RefundPolicyPage() {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold">Refund Policy</h1>
        <div className="mt-4 rounded-xl border border-amber-400/40 bg-amber-400/5 p-4 text-sm text-ink/70">
          This is a placeholder. Domain registrations are generally non-refundable once registered with the registry —
          confirm your actual policy (including any registrar-specific rules from NameSilo) and publish it here before
          accepting real customers.
        </div>
      </main>
    </>
  );
}
