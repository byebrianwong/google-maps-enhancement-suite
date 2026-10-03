"use client";

import dynamic from "next/dynamic";

// MapLibre touches window at import time, so load it on the client only.
export const MapViewLazy = dynamic(() => import("./MapView").then((m) => m.MapView), {
  ssr: false,
  loading: () => <div className="w-full h-full bg-surface-2 animate-pulse-soft" />,
});
