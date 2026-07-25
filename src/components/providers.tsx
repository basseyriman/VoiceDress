"use client";

import { useEffect } from "react";
import { useAetherStore } from "@/store/aether-store";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  onAuthStateChanged,
} from "@/lib/firebase";

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrateAvatar = useAetherStore((s) => s.hydrateAvatar);
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const hydrated = useAetherStore((s) => s.hydrated);
  const cloudReady = useAetherStore((s) => s.cloudReady);
  const user = useAetherStore((s) => s.user);

  useEffect(() => {
    if (hydrated) void hydrateAvatar();
  }, [hydrated, hydrateAvatar]);

  useEffect(() => {
    if (!isFirebaseConfigured) return;
    const auth = getFirebaseAuth();
    if (!auth) return;

    const unsub = onAuthStateChanged(auth, (fbUser) => {
      if (!fbUser) return;
      // Avoid double-fetch right after signup bootstrap
      if (cloudReady && user?.uid === fbUser.uid) return;
      void hydrateFromCloud(fbUser.uid);
    });
    return () => unsub();
  }, [hydrateFromCloud, cloudReady, user?.uid]);

  return <>{children}</>;
}
