"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Button, Logo } from "@/components/ui/button";
import { STYLE_LOOKS } from "@/lib/style-options";
import { postAuthPath } from "@/lib/onboarding";
import { cn } from "@/lib/utils";
import { useAetherStore } from "@/store/aether-store";

export default function StyleOnboardingPage() {
  const router = useRouter();
  const user = useAetherStore((s) => s.user);
  const hydrated = useAetherStore((s) => s.hydrated);
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const updateUser = useAetherStore((s) => s.updateUser);

  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (!hydrated) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.avatarStatus === "ready") {
      router.replace(postAuthPath(user, wardrobe));
      return;
    }
    if (user.stylePrefs?.length) {
      setSelected(user.stylePrefs);
    }
  }, [hydrated, user, wardrobe, router]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) {
        const next = prev.filter((s) => s !== id);
        return next.length ? next : prev;
      }
      return [...prev, id];
    });
  };

  const continueOnboarding = () => {
    const prefs = selected.length ? selected : ["quiet luxury", "old money"];
    updateUser({ stylePrefs: prefs });
    router.push("/onboarding/photo");
  };

  if (!hydrated || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center text-sm text-mist">
        Preparing…
      </div>
    );
  }

  return (
    <div className="grain relative flex min-h-screen flex-col overflow-x-clip px-5 py-8 sm:px-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      >
        <div className="absolute left-1/2 top-0 h-[28rem] w-[36rem] -translate-x-1/2 rounded-full bg-champagne/[0.07] blur-[100px]" />
      </div>

      <div className="mx-auto flex w-full min-w-0 max-w-md flex-1 flex-col">
        <div className="mb-8 flex items-center justify-between">
          <Logo />
          <div className="flex items-center gap-1.5" aria-label="Step 1 of 3">
            <span className="h-0.5 w-8 rounded-full bg-champagne" />
            <span className="h-0.5 w-8 rounded-full bg-white/15" />
            <span className="h-0.5 w-8 rounded-full bg-white/15" />
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-1 flex-col"
        >
          <h1 className="font-display text-[1.85rem] leading-[1.2] tracking-tight text-ivory sm:text-[2.15rem]">
            Which of these looks do you resonate with?
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            Pick one or more — refine anytime in Settings.
          </p>

          <ul className="mt-10 flex flex-col gap-2.5">
            {STYLE_LOOKS.map((look, i) => {
              const active = selected.includes(look.id);
              return (
                <motion.li
                  key={look.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    delay: 0.08 + i * 0.05,
                    duration: 0.55,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                >
                  <button
                    type="button"
                    onClick={() => toggle(look.id)}
                    className={cn(
                      "flex w-full items-start gap-4 rounded-2xl border px-4 py-4 text-left transition",
                      active
                        ? "border-champagne/45 bg-champagne/[0.09]"
                        : "border-line/80 bg-white/[0.02] hover:border-champagne/25 hover:bg-white/[0.04]"
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition",
                        active
                          ? "border-champagne bg-champagne"
                          : "border-mist/50"
                      )}
                      aria-hidden
                    >
                      {active ? (
                        <span className="h-1.5 w-1.5 rounded-full bg-ink" />
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display text-xl text-ivory">
                        {look.label}
                      </span>
                      <span className="mt-0.5 block text-sm text-mist">
                        {look.blurb}
                      </span>
                    </span>
                  </button>
                </motion.li>
              );
            })}
          </ul>

          <div className="mt-auto space-y-3 pt-12 pb-4">
            <Button
              className="w-full"
              disabled={!selected.length}
              onClick={continueOnboarding}
            >
              Continue
            </Button>
            <button
              type="button"
              onClick={() => router.push("/onboarding/photo")}
              className="w-full text-center text-xs text-mist transition hover:text-ivory-muted"
            >
              Skip for now
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
