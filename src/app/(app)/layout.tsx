"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import {
  needsPhotoOnboarding,
  needsWardrobeSetup,
} from "@/lib/onboarding";
import { useAetherStore } from "@/store/aether-store";

/** Routes allowed while wardrobe is still empty (setup + account). */
const WARDROBE_SETUP_ALLOW = [
  "/connect",
  "/settings",
  "/billing",
  "/wardrobe",
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const user = useAetherStore((s) => s.user);
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const hydrated = useAetherStore((s) => s.hydrated);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (needsPhotoOnboarding(user)) {
      router.replace("/onboarding/style");
      return;
    }
    if (needsWardrobeSetup(wardrobe)) {
      const allowed = WARDROBE_SETUP_ALLOW.some((p) => pathname.startsWith(p));
      if (!allowed) {
        router.replace("/onboarding/wardrobe");
      }
    }
  }, [hydrated, user, wardrobe, pathname, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing your wardrobe…
      </div>
    );
  }

  if (needsPhotoOnboarding(user)) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Continuing setup…
      </div>
    );
  }

  if (
    needsWardrobeSetup(wardrobe) &&
    !WARDROBE_SETUP_ALLOW.some((p) => pathname.startsWith(p))
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Setting up your wardrobe…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
