"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

export default function VerifyEmailPage() {
  const params = useSearchParams();
  const token = params.get("token");
  const [status, setStatus] = useState<"checking" | "ok" | "error">("checking");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then((r) => setStatus(r.ok ? "ok" : "error"))
      .catch(() => setStatus("error"));
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-6 text-center">
      <div className="card max-w-sm p-8">
        {status === "checking" && <p>Verifying your email…</p>}
        {status === "ok" && (
          <>
            <h1 className="text-xl font-semibold text-success">Email verified</h1>
            <Link href="/dashboard" className="btn-primary mt-6 inline-flex">Go to dashboard</Link>
          </>
        )}
        {status === "error" && (
          <>
            <h1 className="text-xl font-semibold text-danger">This link is invalid or expired</h1>
            <Link href="/dashboard" className="btn-secondary mt-6 inline-flex">Back to dashboard</Link>
          </>
        )}
      </div>
    </main>
  );
}
