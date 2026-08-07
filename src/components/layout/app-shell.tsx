"use client";

import { usePathname, useRouter } from "next/navigation";
import {
  CloudSun,
  Ellipsis,
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
import { ThemeToggle } from "@/components/theme-toggle";

const nav = [
  { href: "/today", label: "Today", icon: Sparkles },
  { href: "/try-on", label: "Photo", icon: UserRound },
  { href: "/wardrobe", label: "Wardrobe", icon: Shirt },
  { href: "/settings", label: "More", icon: Ellipsis },
];

function go(href: string) {
  // Hard navigation — client soft-routing can freeze while try-on/voice work runs.
  window.location.assign(href);
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const weather = useAetherStore((s) => s.weather);
  const signOutLocal = useAetherStore((s) => s.signOutLocal);

  return (
    <div className="relative min-h-screen overflow-x-clip pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-16">
      <header className="sticky top-0 z-[100] isolate border-b border-line/50 bg-ink/80 backdrop-blur-2xl pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex h-[4.25rem] max-w-7xl items-center justify-between gap-3 px-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:h-[4.5rem] sm:gap-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-4 sm:gap-10">
            <Logo variant="header" className="min-w-0 shrink" />
            <nav className="relative z-[101] hidden items-center gap-1 md:flex">
              {nav.map((item) => {
                const Icon = item.icon;
                const active = pathname.startsWith(item.href);
                return (
                  <a
                    key={item.href}
                    href={item.href}
                    onClick={(e) => {
                      e.preventDefault();
                      if (active) return;
                      go(item.href);
                    }}
                    className={cn(
                      "relative z-[101] inline-flex cursor-pointer items-center gap-2 rounded-full px-3.5 py-2 text-xs tracking-wide transition-colors",
                      active
                        ? "bg-black/[0.04] text-champagne dark:bg-white/[0.07]"
                        : "text-mist hover:bg-black/5 hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-ivory"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    <span>{item.label}</span>
                  </a>
                );
              })}
            </nav>
          </div>
          <div className="relative z-[101] flex shrink-0 items-center gap-2 sm:gap-3">
            {weather && (
              <div className="hidden items-center gap-2 rounded-full border border-line px-3 py-1.5 text-xs text-ivory-muted sm:flex">
                <CloudSun className="h-3.5 w-3.5 text-champagne" />
                {Math.round(weather.tempC)}° · {weather.condition}
              </div>
            )}
            <ThemeToggle />
            <button
              type="button"
              onClick={() => {
                void signOutLocal().then(() => router.push("/"));
              }}
              className="inline-flex items-center gap-2 rounded-full px-2 py-2 text-xs text-mist transition hover:text-ivory sm:px-3"
            >
              <span className="hidden sm:inline">{user?.displayName?.split(" ")[0]}</span>
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-0 mx-auto min-w-0 max-w-7xl overflow-x-clip px-4 py-8 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] sm:px-6">
        <PageTransition>{children}</PageTransition>
      </main>

      <FlowDock />

      <nav className="fixed inset-x-0 bottom-0 z-[100] isolate border-t border-line/50 bg-ink/95 backdrop-blur-2xl pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex w-full max-w-full items-stretch justify-between gap-0 px-1 py-2 pl-[max(0.25rem,env(safe-area-inset-left))] pr-[max(0.25rem,env(safe-area-inset-right))]">
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname.startsWith(item.href);
            return (
              <a
                key={item.href}
                href={item.href}
                onClick={(e) => {
                  e.preventDefault();
                  if (active) return;
                  go(item.href);
                }}
                className={cn(
                  "relative z-[101] flex min-h-[3.25rem] min-w-0 flex-1 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 text-[10px] tracking-wide transition",
                  active
                    ? "bg-champagne/10 text-champagne"
                    : "text-mist hover:bg-black/5 hover:text-ink dark:hover:bg-white/[0.04] dark:hover:text-ivory"
                )}
              >
                <Icon className="h-5 w-5" strokeWidth={active ? 2.25 : 1.75} />
                <span className="max-w-full truncate">{item.label}</span>
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
