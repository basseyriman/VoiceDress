"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  CalendarDays,
  CloudSun,
  LogOut,
  Shirt,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Logo } from "@/components/ui/button";
import { useAetherStore } from "@/store/aether-store";
import { cn } from "@/lib/utils";
import { PageTransition } from "@/components/layout/page-transition";
import { FlowDock } from "@/components/voice/flow-dock";
import { motion } from "framer-motion";

const nav = [
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/try-on", label: "Photo", icon: UserRound },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/settings", label: "More", icon: CalendarDays },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const weather = useAetherStore((s) => s.weather);
  const signOutLocal = useAetherStore((s) => s.signOutLocal);

  return (
    <div className="min-h-screen pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-16">
      <header className="sticky top-0 z-50 border-b border-line/50 bg-ink/70 backdrop-blur-2xl pt-[env(safe-area-inset-top)]">
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
                      "relative inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-xs tracking-wide transition-colors",
                      active ? "text-champagne" : "text-mist hover:text-ivory"
                    )}
                  >
                    {active && (
                      <motion.span
                        layoutId="nav-pill"
                        className="absolute inset-0 rounded-full bg-white/[0.07]"
                        transition={{ type: "spring", stiffness: 380, damping: 32 }}
                      />
                    )}
                    <Icon className="relative z-10 h-3.5 w-3.5" />
                    <span className="relative z-10">{item.label}</span>
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
            <button
              onClick={() => {
                void signOutLocal().then(() => router.push("/login"));
              }}
              className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-mist transition hover:text-ivory"
            >
              <span className="hidden sm:inline">{user?.displayName?.split(" ")[0]}</span>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
        <PageTransition>{children}</PageTransition>
      </main>

      <FlowDock />

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line/50 bg-ink/90 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex justify-around px-2 py-2.5">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex min-w-[4.25rem] flex-col items-center gap-1 rounded-lg px-3 py-1.5 text-[10px] transition",
                  active ? "text-champagne" : "text-mist"
                )}
              >
                <Icon className="h-5 w-5" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
