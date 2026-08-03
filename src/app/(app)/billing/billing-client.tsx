"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CUSTOM_LOOK_TOPUP_ID,
  CUSTOM_LOOK_TOPUP_MAX,
  CUSTOM_LOOK_TOPUP_MIN,
  LOOK_TOPUP_PACKS,
  formatGbp,
  quoteLookTopup,
} from "@/lib/stripe";
import { authFetch } from "@/lib/auth-fetch";
import { useAetherStore } from "@/store/aether-store";
import {
  photoTryOnCredits,
} from "@/lib/photo-tryon-quota";

function TopUpGrid({
  loading,
  onBuy,
  onBuyCustom,
}: {
  loading: string | null;
  onBuy: (packId: string) => void;
  onBuyCustom: (looks: number) => void;
}) {
  const [customLooks, setCustomLooks] = useState("");
  const parsed = Math.floor(Number(customLooks));
  const quote =
    Number.isFinite(parsed) && customLooks.trim() !== ""
      ? quoteLookTopup(parsed)
      : null;
  const customInvalid =
    customLooks.trim() !== "" &&
    (!Number.isFinite(parsed) ||
      parsed < CUSTOM_LOOK_TOPUP_MIN ||
      parsed > CUSTOM_LOOK_TOPUP_MAX);

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {LOOK_TOPUP_PACKS.map((pack) => (
          <div
            key={pack.id}
            className={
              "glass shine-border relative flex flex-col rounded-3xl p-6 transition " +
              ((pack as any).badge ? "border-champagne/40" : "")
            }
          >
            {(pack as any).badge && (
              <span className="absolute -top-3 left-6 rounded-full bg-champagne px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-black">
                {(pack as any).badge}
              </span>
            )}
            <h3 className="font-display text-2xl text-ivory">
              {pack.looks} Credits
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-mist">
              {pack.description}
            </p>
            <div className="mt-auto pt-6">
              <Button
                variant={(pack as any).badge ? "primary" : "outline"}
                className="w-full"
                disabled={loading === pack.id}
                onClick={() => onBuy(pack.id)}
              >
                {loading === pack.id
                  ? "Redirecting…"
                  : `Buy for ${formatGbp(pack.priceGbp)}`}
              </Button>
            </div>
          </div>
        ))}
      </div>

      <div className="glass shine-border rounded-3xl p-6 sm:p-8">
        <h3 className="font-display text-2xl text-ivory">Custom amount</h3>
        <p className="mt-2 text-sm leading-relaxed text-mist">
          Choose how many Credits you want — banked until you use them.
          From {CUSTOM_LOOK_TOPUP_MIN} to {CUSTOM_LOOK_TOPUP_MAX}.
        </p>
        <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:items-end">
          <label className="block flex-1">
            <input
              type="number"
              inputMode="numeric"
              min={CUSTOM_LOOK_TOPUP_MIN}
              max={CUSTOM_LOOK_TOPUP_MAX}
              value={customLooks}
              onChange={(e) => setCustomLooks(e.target.value)}
              className="mt-2 w-full rounded-2xl border border-line bg-black/40 px-4 py-3 font-display text-2xl text-ivory outline-none transition focus:border-champagne/50"
              placeholder="e.g. 15"
            />
          </label>
        </div>
        {customInvalid ? (
          <p className="mt-3 text-sm text-mist">
            Enter a number between {CUSTOM_LOOK_TOPUP_MIN} and{" "}
            {CUSTOM_LOOK_TOPUP_MAX}.
          </p>
        ) : quote && quote.looks >= 25 ? (
          <p className="mt-3 text-sm text-mist">
            {formatGbp(0.5)} per Credit · 25+ drops to {formatGbp(0.4)}.
          </p>
        ) : null}
        <Button
          className="mt-6 w-full sm:w-auto"
          variant={quote ? "primary" : "outline"}
          disabled={!quote || loading === CUSTOM_LOOK_TOPUP_ID}
          onClick={() => quote && onBuyCustom(quote.looks)}
        >
          {loading === CUSTOM_LOOK_TOPUP_ID
            ? "Redirecting…"
            : quote
              ? `Buy ${quote.looks} Credits · ${formatGbp(quote.priceGbp)}`
              : "Enter a Credit count"}
        </Button>
      </div>
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
      setMessage("Top-up received. Refreshing your Credit balance…");
      void hydrateFromCloud(user.uid).then(() => {
        setMessage("Credits banked — dress whenever you’re ready.");
      });
    }
  }, [searchParams, user?.uid, hydrateFromCloud]);

  const checkout = async (planId: string, looks?: number) => {
    setLoading(planId);
    setMessage("");
    try {
      const res = await authFetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          planId,
          ...(typeof looks === "number" ? { looks } : {}),
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
              : `Billing failed (${res.status}). Try again.`)
        );
        return;
      }
      if (data.url) {
        window.location.href = data.url;
        return;
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

  const credits = photoTryOnCredits(user);
  const freeUsed =
    typeof user?.freePhotoTryOnsUsed === "number"
      ? user.freePhotoTryOnsUsed
      : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 sm:py-20">
      <div className="mb-12">
        <p className="text-xs uppercase tracking-[0.28em] text-champagne">
          Credits
        </p>
        <h1 className="mt-4 font-display text-4xl text-ivory sm:text-5xl">
          Purchase Credits
        </h1>
        <p className="mt-4 max-w-xl text-mist">
          Each outfit generation or piece swap costs 1 Credit. Bank your Credits and use them whenever you need to see a new look.
        </p>

        {user && (
          <div className="mt-6 inline-flex items-center gap-3 rounded-full border border-champagne/30 bg-champagne/10 px-5 py-2">
            <span className="text-sm text-mist">Your Balance:</span>
            <span className="font-display text-lg text-champagne">
              {credits} {credits === 1 ? "Credit" : "Credits"}
            </span>
          </div>
        )}
      </div>

      {message && (
        <div className="mb-8 rounded-2xl border border-line bg-ink-soft p-4 text-sm text-ivory">
          {message}
        </div>
      )}

      <div className="mt-12">
        <TopUpGrid
          loading={loading}
          onBuy={(packId) => checkout(packId)}
          onBuyCustom={(looks) => checkout(CUSTOM_LOOK_TOPUP_ID, looks)}
        />
      </div>
    </div>
  );
}
