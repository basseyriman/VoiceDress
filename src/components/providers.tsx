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
import { authFetch } from "@/lib/auth-fetch";

export function Providers({ children }: { children: React.ReactNode }) {
  const hydrateAvatar = useAetherStore((s) => s.hydrateAvatar);
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const updateUser = useAetherStore((s) => s.updateUser);
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
        if (useAetherStore.getState().user) {
          void useAetherStore.getState().signOutLocal();
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

  // Founder/comp allowlist → sync Firestore so Billing UI matches free access
  useEffect(() => {
    if (!user?.uid || !cloudReady) return;
    let cancelled = false;
    void authFetch("/api/billing/comped-sync", { method: "POST" })
      .then(async (res) => {
        if (!res.ok || cancelled) return;
        const data = await res.json().catch(() => null);
        if (!data?.comped || !data.subscriptionStatus) return;
        updateUser({
          subscriptionStatus: data.subscriptionStatus,
          trialEndsAt: data.trialEndsAt || undefined,
          comped: true,
        });
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user?.uid, cloudReady, updateUser]);

  return <PostHogProvider>{children}</PostHogProvider>;
}
