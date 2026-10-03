"use client";

import { Compass, MapPin, Plus, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "Go", icon: Compass, match: (p: string) => p === "/" },
  { href: "/places", label: "Places", icon: MapPin, match: (p: string) => p.startsWith("/places") && p !== "/places/new" },
  { href: "/places/new", label: "Add", icon: Plus, match: (p: string) => p === "/places/new" },
  { href: "/settings", label: "Settings", icon: Settings, match: (p: string) => p.startsWith("/settings") },
] as const;

export function Nav() {
  const pathname = usePathname();
  return (
    <>
      {/* Desktop top bar */}
      <header className="hidden md:flex items-center gap-6 px-6 h-14 border-b border-line bg-surface/80 backdrop-blur sticky top-0 z-30">
        <Link href="/" className="font-bold tracking-tight text-lg flex items-center gap-2">
          <span className="inline-grid place-items-center w-7 h-7 rounded-lg bg-accent text-white text-sm">🌳</span>
          Park Picker
        </Link>
        <nav className="flex items-center gap-1 ml-4">
          {items.map((it) => {
            const active = it.match(pathname);
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${active ? "bg-accent-soft text-accent" : "text-ink-2 hover:bg-surface-2"}`}
              >
                {it.label}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Mobile bottom tabs */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface/95 backdrop-blur border-t border-line pb-safe">
        <div className="grid grid-cols-4">
          {items.map((it) => {
            const active = it.match(pathname);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex flex-col items-center justify-center gap-0.5 h-16 text-[11px] font-semibold ${active ? "text-accent" : "text-ink-3"}`}
              >
                <Icon size={22} strokeWidth={active ? 2.5 : 2} />
                {it.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
