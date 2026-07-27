"use client";

import { useEffect } from "react";

/** Registers the service worker so Android/Chrome can install VoiceDress as an app. */
export function PwaRegister() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    const secure =
      window.location.protocol === "https:" ||
      window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1";
    if (!secure) return;

    void navigator.serviceWorker
      .register("/sw.js")
      .then(async (reg) => {
        // Drop old shell caches that pinned stale JS and blocked nav updates
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter(
              (k) =>
                k.startsWith("voicedress-shell-") && k !== "voicedress-shell-v8"
            )
            .map((k) => caches.delete(k))
        );
        await reg.update();
        reg.addEventListener("updatefound", () => {
          const worker = reg.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {
            if (
              worker.state === "installed" &&
              navigator.serviceWorker.controller
            ) {
              window.location.reload();
            }
          });
        });
      })
      .catch(() => undefined);
  }, []);

  return null;
}
