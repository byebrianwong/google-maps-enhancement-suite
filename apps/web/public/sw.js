// Minimal service worker: enough for "Add to Home Screen" and standalone
// mode. Map tiles and routing need the network anyway, so nothing is cached.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
