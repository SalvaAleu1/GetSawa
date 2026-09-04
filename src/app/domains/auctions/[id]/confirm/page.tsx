"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/Navbar";

export default function AuctionConfirmPage() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const orderId = params.get("orderId");
  const [status, setStatus] = useState<"capturing" | "done" | "failed">("capturing");
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (!orderId) return;
    fetch(`/api/auctions/${id}/pay/capture`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ orderId }),
    })
      .then(async (r) => {
        const data = await r.json();
        if (!r.ok) throw new Error(data.error);
        return data;
      })
      .then((data) => {
        setNote(data.note || null);
        setStatus("done");
      })
      .catch(() => setStatus("failed"));
  }, [id, orderId]);

  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-lg px-6 py-16 text-center">
        {status === "capturing" && <p className="text-ink/60">Confirming your payment…</p>}
        {status === "done" && (
          <>
            <h1 className="text-2xl font-semibold text-success">Payment received</h1>
            <p className="mt-2 text-ink/60">{note || "Your domain has been registered and is now in your dashboard."}</p>
            <Link href="/dashboard/domains" className="btn-primary mt-6 inline-flex">Go to my domains</Link>
          </>
        )}
        {status === "failed" && (
          <>
            <h1 className="text-2xl font-semibold text-danger">Payment could not be confirmed</h1>
            <Link href={`/domains/auctions/${id}`} className="btn-secondary mt-6 inline-flex">Back to auction</Link>
          </>
        )}
      </main>
    </>
  );
}
