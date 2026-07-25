"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AVATAR_IDB_REF } from "@/lib/avatar-storage";
import { hasLocalBodyPhoto, needsPhotoOnboarding } from "@/lib/onboarding";
import { useAetherStore } from "@/store/aether-store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const hydrated = useAetherStore((s) => s.hydrated);
  const updateUser = useAetherStore((s) => s.updateUser);
  const [gate, setGate] = useState<"checking" | "ok" | "need-photo">("checking");

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;

    (async () => {
      if (!needsPhotoOnboarding(user)) {
        if (!cancelled) setGate("ok");
        return;
      }

      // Cloud hydrate can wipe a just-saved photo — recover from IndexedDB
      const local = await hasLocalBodyPhoto();
      if (cancelled) return;

      if (local) {
        updateUser({ avatarStatus: "ready", avatarUrl: AVATAR_IDB_REF });
        setGate("ok");
        return;
      }

      setGate("need-photo");
      router.replace("/onboarding/photo");
    })();

    return () => {
      cancelled = true;
    };
  }, [hydrated, user, router, updateUser]);

  if (!hydrated || !user || gate === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing your wardrobe…
      </div>
    );
  }

  if (gate === "need-photo") {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Opening photo setup…
      </div>
    );
  }

  return <AppShell>{children}</AppShell>;
}
