"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { useAetherStore } from "@/store/aether-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const hydrated = useAetherStore((s) => s.hydrated);

  useEffect(() => {
    if (hydrated && !user) router.replace("/login");
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing your wardrobe…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
