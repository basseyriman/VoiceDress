"use client";

import { useEffect } from "react";
import posthog from "posthog-js";
import { useAetherStore } from "@/store/aether-store";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  onAuthStateChanged,
} from "@/lib/firebase";
import { PostHogProvider } from "@/components/posthog-provider";

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
      if (!fbUser) {
        if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthog.__loaded) {
          posthog.reset();
        }
        return;
      }

      if (process.env.NEXT_PUBLIC_POSTHOG_KEY && posthog.__loaded) {
        posthog.identify(fbUser.uid, {
          email: fbUser.email || undefined,
          name: fbUser.displayName || undefined,
        });
      }

      // Avoid double-fetch right after signup bootstrap
      if (cloudReady && user?.uid === fbUser.uid) return;
      void hydrateFromCloud(fbUser.uid);
    });
    return () => unsub();
  }, [hydrateFromCloud, cloudReady, user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY || !posthog.__loaded) return;
    posthog.identify(user.uid, {
      email: user.email,
      name: user.displayName,
      subscription_status: user.subscriptionStatus,
    });
  }, [
    user?.uid,
    user?.email,
    user?.displayName,
    user?.subscriptionStatus,
  ]);

  return <PostHogProvider>{children}</PostHogProvider>;
}
