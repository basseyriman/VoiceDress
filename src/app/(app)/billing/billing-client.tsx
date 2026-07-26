"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/stripe";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";

export default function BillingPage() {
  const user = useAetherStore((s) => s.user);
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const updateUser = useAetherStore((s) => s.updateUser);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get("success");
    const canceled = searchParams.get("canceled");
    if (canceled) {
      setMessage("Checkout canceled — your membership was not changed.");
      return;
    }
    if (success === "1" && user?.uid) {
      setMessage("Payment received. Refreshing membership…");
      void hydrateFromCloud(user.uid).then(() => {
        setMessage("Membership updated. Welcome to VoiceDress.");
      });
    }
  }, [searchParams, user?.uid, hydrateFromCloud]);

  const checkout = async (planId: string) => {
    setLoading(planId);
    setMessage("");
    try {
      if (typeof window !== "undefined") {
        const { default: posthog } = await import("posthog-js");
        if (posthog.__loaded) {
          posthog.capture("billing_checkout_started", { plan_id: planId });
        }
      }
      const res = await authFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          email: user?.email,
          name: user?.displayName,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(
          data.error ||
            (res.status === 401
              ? "Sign in again, then retry billing."
              : res.status === 503
                ? "Server auth isn’t ready yet — redeploy after Firebase Admin is set."
                : `Billing failed (${res.status}). Try again.`)
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }

      // Stripe not fully configured — ensure a server-side trial instead of faking paid.
      const trialRes = await authFetch("/api/billing/ensure-trial", {
        method: "POST",
      });
      const trial = await trialRes.json().catch(() => ({}));
      if (trialRes.ok && trial.subscriptionStatus) {
        updateUser({
          subscriptionStatus: trial.subscriptionStatus,
          trialEndsAt: trial.trialEndsAt || undefined,
        });
        setMessage(
          data.message ||
            "Your 7-day trial is active. Add Stripe keys for live checkout."
        );
      } else {
        setMessage(
          trial.error ||
            data.error ||
            data.message ||
            "Could not start trial. Sign in and try again."
        );
      }
    } catch (err) {
      setMessage(
        err instanceof Error
          ? `Billing request failed: ${err.message}`
          : "Billing request failed. Check your connection and try again."
      );
    } finally {
      setLoading(null);
    }
  };

  const statusLabel =
    user?.subscriptionStatus === "none" || !user?.subscriptionStatus
      ? "Not started"
      : user.subscriptionStatus;

  return (
    <div className="space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Membership
        </p>
        <h1 className="mt-2 font-display text-4xl text-ivory">
          VoiceDress membership
        </h1>
        <p className="mt-2 max-w-xl text-sm text-mist">
          £19/month or £149/year — every plan includes a 7-day free trial.
          Status:{" "}
          <span className="capitalize text-champagne">{statusLabel}</span>
          {user?.trialEndsAt && user.subscriptionStatus === "trialing" ? (
            <span className="text-mist">
              {" "}
              · ends{" "}
              {new Date(user.trialEndsAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </span>
          ) : null}
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border border-champagne/30 bg-champagne/10 px-4 py-3 text-sm text-ivory">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className="glass shine-border relative rounded-[2rem] p-8"
          >
            {plan.badge && (
              <span className="absolute right-6 top-6 rounded-full border border-champagne/40 bg-champagne/15 px-3 py-1 text-[10px] uppercase tracking-wider text-champagne">
                {plan.badge}
              </span>
            )}
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              {plan.interval}
            </p>
            <h2 className="mt-2 font-display text-3xl text-ivory">{plan.name}</h2>
            <p className="mt-4 font-display text-5xl text-ivory">
              £{plan.price}
              <span className="text-base text-mist">/{plan.interval}</span>
            </p>
            <p className="mt-3 text-sm text-mist">{plan.description}</p>
            <ul className="mt-6 space-y-2">
              {plan.features.map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2 text-sm text-ivory-muted"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-champagne" />
                  {f}
                </li>
              ))}
            </ul>
            <Button
              className="mt-8 w-full"
              disabled={loading === plan.id}
              onClick={() => checkout(plan.id)}
            >
              {loading === plan.id ? "Redirecting…" : "Start 7-day trial"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
