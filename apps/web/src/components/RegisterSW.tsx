"use client";

import { useEffect } from "react";

// Registers a minimal service worker so the app installs cleanly as a PWA.
export function RegisterSW() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
