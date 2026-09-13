"use client";

import { useEffect, useState } from "react";

export function PwaRegister() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    const updateNetworkState = () => setOffline(!navigator.onLine);
    updateNetworkState();

    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);

    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // PWA support is progressive enhancement; application use must not fail
        // merely because the browser blocks service-worker registration.
      });
    }

    return () => {
      window.removeEventListener("online", updateNetworkState);
      window.removeEventListener("offline", updateNetworkState);
    };
  }, []);

  if (!offline) return null;

  return (
    <div className="network-status" role="status" aria-live="polite">
      You&apos;re offline. Previously visited public pages may still be available; account changes will resume when your connection returns.
    </div>
  );
}
