"use client";

import { useState } from "react";
import Link from "next/link";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import { Button } from "@/components/ui/button";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Hard gate (2nd try-on) vs soft offer after first free dress */
  mode?: "soft" | "hard";
};

/**
 * Shown after the free on-photo aha moment, or when they try to dress again.
 */
export function TrialOfferModal({ open, onClose, mode = "soft" }: Props) {
  const user = useAetherStore((s) => s.user);
  const updateUser = useAetherStore((s) => s.updateUser);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  if (!open) return null;

  const startTrial = async () => {
    setLoading(true);
    setMessage("");
    try {
      if (typeof window !== "undefined") {
        const { default: posthog } = await import("posthog-js");
        if (posthog.__loaded) {
          posthog.capture("trial_offer_clicked", { mode });
        }
      }
      const res = await authFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId: "monthly",
          email: user?.email,
          name: user?.displayName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Stripe not live — start server trial
      const trialRes = await authFetch("/api/billing/ensure-trial", {
        method: "POST",
      });
      const trial = await trialRes.json().catch(() => ({}));
      if (trialRes.ok && trial.subscriptionStatus) {
        updateUser({
          subscriptionStatus: trial.subscriptionStatus,
          trialEndsAt: trial.trialEndsAt || undefined,
        });
        setMessage("Your 7-day trial is on. Keep dressing.");
        onClose();
        return;
      }
      setMessage(
        trial.error ||
          data.message ||
          "Couldn’t start trial — open Billing to continue."
      );
    } catch {
      setMessage("Something went wrong. Try Billing from Settings.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trial-offer-title"
        className="w-full max-w-md rounded-[1.75rem] border border-line bg-stone p-6 shadow-2xl"
      >
        <p className="text-[10px] uppercase tracking-[0.2em] text-champagne">
          {mode === "hard" ? "Continue dressing" : "You’re dressed"}
        </p>
        <h2
          id="trial-offer-title"
          className="mt-2 font-display text-3xl text-ivory"
        >
          {mode === "hard"
            ? "Start your 7-day free trial"
            : "Love it? Try free for 7 days"}
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-mist">
          {mode === "hard"
            ? "You’ve used your free on-photo look. Unlock 30 full looks a month plus unlimited voice swaps with a 7-day trial — cancel anytime."
            : "That was your free on-photo look. Keep swapping pieces and dressing for every occasion with a 7-day free trial."}
        </p>
        <ul className="mt-4 space-y-1.5 text-xs text-mist">
          <li>· 30 full on-photo looks / month</li>
          <li>· Unlimited voice styling & piece swaps</li>
          <li>· Card required for trial · cancel before day 8</li>
        </ul>
        {message && (
          <p className="mt-3 text-xs text-champagne">{message}</p>
        )}
        <div className="mt-6 flex flex-col gap-2">
          <Button
            type="button"
            disabled={loading}
            onClick={() => void startTrial()}
            className="w-full rounded-full bg-champagne text-ink hover:bg-champagne/90"
          >
            {loading ? "Starting…" : "Start 7-day free trial"}
          </Button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-full border border-line px-4 py-2.5 text-xs text-mist transition hover:border-champagne/40 hover:text-ivory"
          >
            {mode === "hard" ? "Not now" : "Maybe later"}
          </button>
          <Link
            href="/billing"
            className="text-center text-[11px] text-mist/80 underline-offset-2 hover:text-champagne hover:underline"
          >
            See plans
          </Link>
        </div>
      </div>
    </div>
  );
}
