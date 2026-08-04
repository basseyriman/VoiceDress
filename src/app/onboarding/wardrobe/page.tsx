"use client";

import { Suspense, useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Logo } from "@/components/ui/button";
import { WardrobeFillPanel } from "@/components/wardrobe/wardrobe-fill-panel";
import { hasRealWardrobe } from "@/lib/onboarding";
import { useAetherStore } from "@/store/aether-store";

export default function WardrobeOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center text-sm text-mist">
          Preparing…
        </div>
      }
    >
      <WardrobeOnboardingInner />
    </Suspense>
  );
}

function WardrobeOnboardingInner() {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const hydrated = useAetherStore((s) => s.hydrated);
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const ready = hasRealWardrobe(wardrobe);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
    }
  }, [hydrated, user, router]);

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing…
      </div>
    );
  }

  return (
    <div className="grain relative flex min-h-screen flex-col overflow-x-clip px-4 py-8 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-champagne/[0.07] blur-[100px]" />
      </div>

      <div className="mx-auto flex w-full min-w-0 max-w-lg flex-1 flex-col pb-10">
        <div className="mb-8 flex items-center justify-between gap-4">
          <Logo />
          <div className="flex items-center gap-1.5" aria-label="Step 3 of 3">
            <span className="h-0.5 w-8 rounded-full bg-champagne" />
            <span className="h-0.5 w-8 rounded-full bg-champagne" />
            <span className="h-0.5 w-8 rounded-full bg-champagne" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col"
        >
          <p className="text-[11px] font-medium uppercase tracking-[0.28em] text-champagne">
            Your wardrobe
          </p>
          <h1 className="mt-3 font-display text-[1.85rem] leading-[1.2] tracking-tight text-ivory sm:text-[2.15rem]">
            Add what you already own
          </h1>
          <p className="mt-3 max-w-md text-sm leading-relaxed text-mist">
            Upload photos of your clothes to build your digital wardrobe so we can style looks using your real pieces — not placeholders.
          </p>

          <div className="mt-8">
            <WardrobeFillPanel
              compact
              returnTo="/onboarding/wardrobe"
            />
          </div>

          <div className="mt-10 space-y-3 border-t border-line/50 pt-6">
            <p className="text-center text-xs text-mist">
              {ready
                ? `${wardrobe.length} piece${wardrobe.length === 1 ? "" : "s"} ready`
                : "Add at least one piece to continue"}
            </p>
            <Button
              className="w-full"
              disabled={!ready}
              onClick={() => {
                window.location.href = "/today";
              }}
            >
              Start using VoiceDress
            </Button>
            <button
              type="button"
              onClick={() => router.push("/onboarding/photo?edit=true")}
              className="w-full py-4 text-center text-xs text-mist transition hover:text-ivory-muted active:text-ivory"
            >
              Back to photo
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
