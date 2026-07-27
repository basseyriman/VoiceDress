"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  LIST_PRICE_MONTHLY_GBP,
  LIST_PRICE_YEARLY_GBP,
  LOOK_TOPUP_PACKS,
  PLANS,
} from "@/lib/stripe";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import {
  PAID_PHOTO_TRYONS_PER_MONTH,
  isMembershipActive,
  photoTryOnCredits,
  photoTryOnsUsedThisMonth,
} from "@/lib/entitlement";
import type { UserProfile } from "@/lib/types";

function statusCopy(user: UserProfile | null | undefined) {
  const status = user?.subscriptionStatus || "none";
  if (status === "none") return "Not started";
  if (status === "trialing") {
    const ends = user?.trialEndsAt
      ? new Date(user.trialEndsAt).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })
      : null;
    return ends ? `Trial · ends ${ends}` : "Trial";
  }
  if (status === "active") return "Active";
  if (status === "canceled") return "Canceled";
  return status;
}

function TopUpGrid({
  loading,
  onBuy,
  emphasized,
}: {
  loading: string | null;
  onBuy: (id: string) => void;
  emphasized: boolean;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {LOOK_TOPUP_PACKS.map((pack) => (
        <div
          key={pack.id}
          className={
            emphasized
              ? "relative rounded-[1.75rem] border border-champagne/30 bg-champagne/[0.07] p-6"
              : "relative rounded-[1.75rem] border border-line bg-white/[0.02] p-6"
          }
        >
          {"badge" in pack && pack.badge ? (
            <span className="absolute right-5 top-5 text-[10px] uppercase tracking-[0.2em] text-champagne">
              {pack.badge}
            </span>
          ) : null}
          <h3 className="font-display text-2xl text-ivory">{pack.label}</h3>
          <p className="mt-3 font-display text-4xl text-ivory">
            £{pack.priceGbp}
          </p>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {pack.description}
          </p>
          <Button
            className="mt-6 w-full"
            variant={emphasized ? "primary" : "outline"}
            disabled={loading === pack.id}
            onClick={() => onBuy(pack.id)}
          >
            {loading === pack.id ? "Redirecting…" : `Buy ${pack.looks} looks`}
          </Button>
        </div>
      ))}
    </div>
  );
}

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

  const openPortal = async () => {
    setLoading("portal");
    setMessage("");
    try {
      const res = await authFetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(
          data.error || "Couldn’t open billing management. Try again."
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setMessage("Billing portal isn’t available yet.");
    } catch (err) {
      setMessage(
        err instanceof Error
          ? err.message
          : "Couldn’t open billing management."
      );
    } finally {
      setLoading(null);
    }
  };

  const changePlan = async (planId: "monthly" | "yearly") => {
    setLoading(`change_${planId}`);
    setMessage("");
    try {
      if (typeof window !== "undefined") {
        const { default: posthog } = await import("posthog-js");
        if (posthog.__loaded) {
          posthog.capture("billing_plan_change_started", { plan_id: planId });
        }
      }
      const res = await authFetch("/api/stripe/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || "Couldn’t change plan. Try Manage membership.");
        return;
      }
      if (data.planId === "monthly" || data.planId === "yearly") {
        updateUser({ subscriptionPlan: data.planId });
      }
      setMessage(data.message || "Plan updated.");
      if (user?.uid) {
        void hydrateFromCloud(user.uid);
      }
    } catch (err) {
      setMessage(
        err instanceof Error ? err.message : "Couldn’t change plan."
      );
    } finally {
      setLoading(null);
    }
  };

  const member = isMembershipActive(user);
  const credits = photoTryOnCredits(user);
  const used = photoTryOnsUsedThisMonth(user);
  const remaining = Math.max(0, PAID_PHOTO_TRYONS_PER_MONTH - used);
  const usagePct = Math.min(
    100,
    Math.round((used / PAID_PHOTO_TRYONS_PER_MONTH) * 100)
  );
  const topupUrgent = member && remaining <= 6;
  const freeUsed =
    typeof user?.freePhotoTryOnsUsed === "number"
      ? user.freePhotoTryOnsUsed
      : 0;
  const onYearly = user?.subscriptionPlan === "yearly";
  const canOfferAnnual = member && user?.subscriptionPlan !== "yearly";
  const annualSavings = LIST_PRICE_MONTHLY_GBP * 12 - LIST_PRICE_YEARLY_GBP;

  return (
    <div className="space-y-14 pb-20">
      {member ? (
        <header className="max-w-2xl">
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            VoiceDress
          </p>
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            Your membership
          </h1>
          <p className="mt-3 text-sm text-mist">
            Status{" "}
            <span className="text-champagne">{statusCopy(user)}</span>
            {user?.subscriptionPlan ? (
              <span>
                {" "}
                · {user.subscriptionPlan === "yearly" ? "Annual" : "Monthly"}
              </span>
            ) : null}
          </p>

          <div className="mt-10">
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              On-photo looks
            </p>
            <p className="mt-3 font-display text-6xl leading-none tracking-tight text-ivory sm:text-7xl">
              {used}
              <span className="text-mist">/{PAID_PHOTO_TRYONS_PER_MONTH}</span>
            </p>
            <div
              className="mt-6 h-[2px] w-full max-w-sm overflow-hidden bg-white/10"
              role="progressbar"
              aria-valuenow={used}
              aria-valuemin={0}
              aria-valuemax={PAID_PHOTO_TRYONS_PER_MONTH}
              aria-label="Looks used this month"
            >
              <div
                className="h-full bg-champagne transition-[width] duration-700 ease-out"
                style={{ width: `${usagePct}%` }}
              />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-mist">
              {remaining === 0
                ? "Included looks are used for this month."
                : `${remaining} included look${remaining === 1 ? "" : "s"} left this month.`}
              {credits > 0
                ? ` · ${credits} top-up banked`
                : " · Voice swaps stay unlimited."}
            </p>
          </div>
        </header>
      ) : (
        <header className="max-w-xl">
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            VoiceDress
          </p>
          <h1 className="mt-3 font-display text-4xl text-ivory sm:text-5xl">
            Membership
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-mist">
            One on-photo look is free. Then £{LIST_PRICE_MONTHLY_GBP}/month or £
            {LIST_PRICE_YEARLY_GBP}/year — 7-day trial,{" "}
            {PAID_PHOTO_TRYONS_PER_MONTH} full looks each month, unlimited voice
            styling.
          </p>
          <p className="mt-2 text-sm text-mist">
            Status{" "}
            <span className="capitalize text-champagne">{statusCopy(user)}</span>
            {user?.subscriptionStatus === "none" ? (
              <span>
                {" "}
                · free looks used {freeUsed}/1
              </span>
            ) : null}
          </p>
        </header>
      )}

      {message ? (
        <div className="max-w-xl border-l border-champagne/50 pl-4 text-sm text-ivory">
          {message}
        </div>
      ) : null}

      {member ? (
        <>
          <section id="topup" className="scroll-mt-24 space-y-5">
            <div className="max-w-xl">
              <p className="text-xs uppercase tracking-[0.28em] text-champagne">
                Top up
              </p>
              <h2 className="mt-2 font-display text-3xl text-ivory">
                {topupUrgent
                  ? "Need more on-photo looks?"
                  : "Extra looks when you need them"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                {topupUrgent
                  ? `Packs bank until you use them. Your plan’s ${PAID_PHOTO_TRYONS_PER_MONTH} reset each month.`
                  : `Your plan includes ${PAID_PHOTO_TRYONS_PER_MONTH} full looks each month. Buy a pack anytime — banked after included looks run out.`}
              </p>
            </div>
            <TopUpGrid
              loading={loading}
              onBuy={checkout}
              emphasized={topupUrgent}
            />
          </section>

          <section className="max-w-xl space-y-5 border-t border-line pt-12">
            <div>
              <p className="text-xs uppercase tracking-[0.28em] text-champagne">
                Plan
              </p>
              <h2 className="mt-2 font-display text-2xl text-ivory">
                {onYearly
                  ? "You’re on annual"
                  : canOfferAnnual
                    ? "Save with annual"
                    : "Manage your membership"}
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-mist">
                {onYearly
                  ? `£${LIST_PRICE_YEARLY_GBP}/year · update your card or cancel anytime in Stripe.`
                  : canOfferAnnual
                    ? `Switch to £${LIST_PRICE_YEARLY_GBP}/year and save £${annualSavings} vs monthly. Stripe prorates the change — no second trial.`
                    : `Update your card, cancel, or change plan in Stripe. Annual is £${LIST_PRICE_YEARLY_GBP}/year (saves £${annualSavings}).`}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
              {canOfferAnnual ? (
                <Button
                  disabled={loading === "change_yearly"}
                  onClick={() => changePlan("yearly")}
                >
                  {loading === "change_yearly"
                    ? "Switching…"
                    : `Switch to annual · £${LIST_PRICE_YEARLY_GBP}`}
                </Button>
              ) : null}
              <Button
                variant={canOfferAnnual ? "outline" : "primary"}
                disabled={loading === "portal"}
                onClick={() => openPortal()}
              >
                {loading === "portal" ? "Opening…" : "Manage membership"}
              </Button>
            </div>
          </section>

          <section className="max-w-xl space-y-4 border-t border-line pt-12">
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              Included
            </p>
            <h2 className="font-display text-2xl text-ivory">
              What’s in your membership
            </h2>
            <ul className="space-y-2.5">
              {[
                `${PAID_PHOTO_TRYONS_PER_MONTH} full on-photo looks / month`,
                "Unlimited voice styling & piece swaps",
                "Weather-aware suggestions",
                "Shopify sync + add from order photo",
              ].map((f) => (
                <li
                  key={f}
                  className="flex items-start gap-2.5 text-sm text-ivory-muted"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-champagne" />
                  {f}
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : (
        <>
          <section className="grid gap-6 lg:grid-cols-2">
            {PLANS.map((plan) => (
              <div
                key={plan.id}
                className="glass shine-border relative rounded-[2rem] p-8"
              >
                {plan.badge ? (
                  <span className="absolute right-6 top-6 text-[10px] uppercase tracking-[0.2em] text-champagne">
                    {plan.badge}
                  </span>
                ) : null}
                <p className="text-xs uppercase tracking-[0.28em] text-champagne">
                  {plan.interval}
                </p>
                <h2 className="mt-2 font-display text-3xl text-ivory">
                  {plan.name}
                </h2>
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
          </section>

          <section
            id="topup"
            className="scroll-mt-24 max-w-xl space-y-2 border-t border-line pt-12"
          >
            <p className="text-xs uppercase tracking-[0.28em] text-champagne">
              After membership
            </p>
            <h2 className="font-display text-2xl text-ivory">
              Extra looks when you need them
            </h2>
            <p className="text-sm leading-relaxed text-mist">
              Top-up packs (£{LOOK_TOPUP_PACKS[0].priceGbp} for{" "}
              {LOOK_TOPUP_PACKS[0].looks}, £{LOOK_TOPUP_PACKS[1].priceGbp} for{" "}
              {LOOK_TOPUP_PACKS[1].looks}) are available once you’re on a trial
              or paid plan — banked until used.
            </p>
          </section>
        </>
      )}
    </div>
  );
}
