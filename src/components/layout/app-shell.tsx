"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CloudSun,
  CreditCard,
  Link2,
  LogOut,
  Mic,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Logo } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";
import { cn } from "@/lib/utils";

const nav = [
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/try-on", label: "Try-On", icon: UserRound },
  { href: "/connect", label: "Connect", icon: Link2 },
  { href: "/billing", label: "Plan", icon: CreditCard },
  { href: "/settings", label: "Settings", icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const weather = useAetherStore((s) => s.weather);
  const signOutLocal = useAetherStore((s) => s.signOutLocal);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 border-b border-line/60 bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
          <div className="flex items-center gap-8">
            <Logo />
            <nav className="hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs tracking-wide transition",
                      active
                        ? "bg-white/[0.07] text-champagne"
                        : "text-mist hover:text-ivory"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            {weather && (
              <div className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ivory-muted sm:flex">
                <CloudSun className="h-3.5 w-3.5 text-champagne" />
                {Math.round(weather.tempC)}° · {weather.condition}
              </div>
            )}
            <Link
              href="/today#voice"
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-champagne/40 text-champagne hover:bg-champagne/10"
              aria-label="Voice"
            >
              <Mic className="h-4 w-4" />
            </Link>
            <button
              onClick={() => {
                signOutLocal();
                router.push("/");
              }}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-mist hover:text-ivory"
            >
              <span className="hidden sm:inline">{user?.displayName?.split(" ")[0]}</span>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">{children}</main>

      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line/60 bg-ink/90 backdrop-blur-xl md:hidden">
        <div className="flex justify-around px-2 py-2">
          {nav.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px]",
                  active ? "text-champagne" : "text-mist"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
