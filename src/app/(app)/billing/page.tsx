"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PLANS } from "@/lib/stripe";
import { useAetherStore } from "@/store/aether-store";

export default function BillingPage() {
  const user = useAetherStore((s) => s.user);
  const setSubscription = useAetherStore((s) => s.setSubscription);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const checkout = async (planId: string) => {
    setLoading(planId);
    setMessage("");
    try {
      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          email: user?.email,
          name: user?.displayName,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      // Local / demo success when Stripe price IDs aren't configured yet
      setSubscription("active");
      setMessage(
        data.message ||
          "Subscription activated in trial mode. Add live Stripe Price IDs to enable Checkout."
      );
    } catch {
      setSubscription("active");
      setMessage("Activated locally. Configure STRIPE_SECRET_KEY for live billing.");
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">Membership</p>
        <h1 className="mt-2 font-display text-4xl text-ivory">Aether membership</h1>
        <p className="mt-2 text-sm text-mist">
          Status:{" "}
          <span className="text-champagne">{user?.subscriptionStatus || "none"}</span>
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border border-champagne/30 bg-champagne/10 px-4 py-3 text-sm text-ivory">
          {message}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {PLANS.map((plan) => (
          <div key={plan.id} className="glass shine-border rounded-[2rem] p-8">
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
                <li key={f} className="flex items-start gap-2 text-sm text-ivory-muted">
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
              {loading === plan.id ? "Redirecting…" : "Subscribe"}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
