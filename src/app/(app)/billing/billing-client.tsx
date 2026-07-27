"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LOOK_TOPUP_PACKS, PLANS } from "@/lib/stripe";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import {
  PAID_PHOTO_TRYONS_PER_MONTH,
  isMembershipActive,
  photoTryOnCredits,
  photoTryOnsUsedThisMonth,
} from "@/lib/entitlement";

export default function BillingPage() {
  const user = useAetherStore((s) => s.user);
  const hydrateFromCloud = useAetherStore((s) => s.hydrateFromCloud);
  const updateUser = useAetherStore((s) => s.updateUser);
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    const success = searchParams.get("success");
    const topup = searchParams.get("topup");
    const canceled = searchParams.get("canceled");
    if (canceled) {
      setMessage("Checkout canceled — nothing was charged.");
      return;
    }
    if ((success === "1" || topup === "1") && user?.uid) {
      setMessage(
        topup === "1"
          ? "Top-up received. Refreshing your look balance…"
          : "Payment received. Refreshing membership…"
      );
      void hydrateFromCloud(user.uid).then(() => {
        setMessage(
          topup === "1"
            ? "Extra looks are banked — dress whenever you’re ready."
            : "Membership updated. Welcome to VoiceDress."
        );
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
      // Top-ups need live Stripe; don't fake credits.
      if (planId.startsWith("looks_")) {
        setMessage(
          data.message ||
            "Add Stripe keys to sell look top-ups. Subscription trial can still start below."
        );
        return;
      }

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
  const member = isMembershipActive(user);
  const credits = photoTryOnCredits(user);

  return (
    <div className="space-y-8 pb-20">
      <div>
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Membership
        </p>
        <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
          Membership
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-mist">
          One on-photo look is free. Then £19/month or £149/year — both include a
          7-day trial and 30 full on-photo looks per month. Status:{" "}
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
          {typeof user?.freePhotoTryOnsUsed === "number" &&
          user.subscriptionStatus === "none" ? (
            <span className="text-mist">
              {" "}
              · free looks used {user.freePhotoTryOnsUsed}/1
            </span>
          ) : null}
          {member ? (
            <span className="text-mist">
              {" "}
              · looks this month {photoTryOnsUsedThisMonth(user)}/
              {PAID_PHOTO_TRYONS_PER_MONTH}
              {credits > 0 ? ` · ${credits} top-up banked` : ""}
            </span>
          ) : null}
        </p>
      </div>

      {message && (
        <div className="rounded-2xl border border-champagne/30 bg-champagne/10 px-4 py-3 text-sm text-ivory">
          {message}
        </div>
      )}

      {/* Members see top-ups first — that’s the action they need after the monthly 30 */}
      {member && (
        <div id="topup" className="scroll-mt-24 space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              Top up
            </p>
            <h2 className="mt-2 font-display text-3xl text-ivory">
              Need more on-photo looks?
            </h2>
            <p className="mt-2 max-w-xl text-sm text-mist">
              Your plan includes {PAID_PHOTO_TRYONS_PER_MONTH} full on-photo looks
              each month. When those are used, buy a pack below — banked until you
              use them. Voice swaps stay unlimited.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {LOOK_TOPUP_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="relative rounded-[1.75rem] border border-champagne/25 bg-champagne/[0.06] p-6"
              >
                {"badge" in pack && pack.badge ? (
                  <span className="absolute right-5 top-5 rounded-full border border-champagne/40 bg-champagne/15 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-champagne">
                    {pack.badge}
                  </span>
                ) : null}
                <h3 className="font-display text-2xl text-ivory">{pack.label}</h3>
                <p className="mt-2 font-display text-4xl text-ivory">
                  £{pack.priceGbp}
                </p>
                <p className="mt-2 text-sm text-mist">{pack.description}</p>
                <Button
                  className="mt-6 w-full"
                  disabled={loading === pack.id}
                  onClick={() => checkout(pack.id)}
                >
                  {loading === pack.id
                    ? "Redirecting…"
                    : `Buy ${pack.looks} looks`}
                </Button>
              </div>
            ))}
          </div>
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
              disabled={member || loading === plan.id}
              onClick={() => checkout(plan.id)}
            >
              {member
                ? "Included in your membership"
                : loading === plan.id
                  ? "Redirecting…"
                  : "Start 7-day trial"}
            </Button>
          </div>
        ))}
      </div>

      {!member && (
        <div id="topup" className="scroll-mt-24 space-y-4 opacity-90">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              Top up
            </p>
            <h2 className="mt-2 font-display text-3xl text-ivory">
              Extra looks after your monthly 30
            </h2>
            <p className="mt-2 max-w-xl text-sm text-mist">
              Available once you’re on a trial or paid plan. Top-ups are banked
              and used after your included looks.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {LOOK_TOPUP_PACKS.map((pack) => (
              <div
                key={pack.id}
                className="relative rounded-[1.75rem] border border-line bg-white/[0.02] p-6"
              >
                {"badge" in pack && pack.badge ? (
                  <span className="absolute right-5 top-5 rounded-full border border-champagne/40 bg-champagne/15 px-2.5 py-0.5 text-[10px] uppercase tracking-wider text-champagne">
                    {pack.badge}
                  </span>
                ) : null}
                <h3 className="font-display text-2xl text-ivory">{pack.label}</h3>
                <p className="mt-2 font-display text-4xl text-ivory">
                  £{pack.priceGbp}
                </p>
                <p className="mt-2 text-sm text-mist">{pack.description}</p>
                <Button className="mt-6 w-full" disabled>
                  Members only
                </Button>
                <p className="mt-2 text-[11px] text-mist">
                  Start a trial or plan first, then top up anytime.
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
