"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Garment, Outfit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AVATAR_IDB_REF } from "@/lib/avatar-storage";
import { useAetherStore } from "@/store/aether-store";
import { lookPiecesForTryOn, apparelForTryOn } from "@/lib/tryon-architecture";
import { normalizeGarmentPublicUrl } from "@/lib/garment-url";
import { letterboxForTryOn } from "@/lib/image";
import { resolveDisplayAvatar } from "@/lib/resolve-avatar";
import { ChangePhotoButton } from "@/components/wardrobe/change-photo-button";
import Link from "next/link";

export function OutfitStage({
  outfit,
  avatarUrl,
  generating = false,
}: {
  outfit: Outfit | null;
  avatarUrl?: string;
  generating?: boolean;
}) {
  const garments = outfit?.garments || [];
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const swapFromVoice = useAetherStore((s) => s.swapFromVoice);
  const setCurrentOutfit = useAetherStore((s) => s.setCurrentOutfit);

  const lookPieces = useMemo(() => {
    const pieces = lookPiecesForTryOn(garments);
    return pieces.map((g) => ({
      ...g,
      imageUrl: normalizeGarmentPublicUrl(g.imageUrl),
    }));
  }, [garments]);
  const apparelPieces = useMemo(() => apparelForTryOn(lookPieces), [lookPieces]);
  const styledExtras = useMemo(
    () =>
      lookPieces.filter(
        (g) => !apparelPieces.some((a) => a.id === g.id)
      ),
    [lookPieces, apparelPieces]
  );

  const [resolvedAvatar, setResolvedAvatar] = useState<string | undefined>();
  useEffect(() => {
    let cancelled = false;
    void resolveDisplayAvatar(avatarUrl).then((url) => {
      if (!cancelled) setResolvedAvatar(url);
    });
    return () => {
      cancelled = true;
    };
  }, [avatarUrl]);

  const displayAvatar =
    resolvedAvatar ||
    (avatarUrl && avatarUrl !== AVATAR_IDB_REF ? avatarUrl : undefined);
  const hasAvatar = Boolean(displayAvatar);
  const [wornUrl, setWornUrl] = useState<string | null>(null);
  const [dressing, setDressing] = useState(false);
  const [needsKey, setNeedsKey] = useState(false);
  const [needsBilling, setNeedsBilling] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepLabel, setStepLabel] = useState("");
  const [progress, setProgress] = useState(0);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<Garment["category"] | null>(null);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const requestId = useRef(0);

  const lookKey = lookPieces.map((g) => g.id).join("|");

  useEffect(() => {
    fetch("/api/tryon/render")
      .then((r) => r.json())
      .then((d) => setKeyConfigured(Boolean(d.configured)))
      .catch(() => setKeyConfigured(false));
  }, []);

  // Full suggested look on body: apparel (FASHN) then shoes/glasses/watch (Kontext)
  useEffect(() => {
    const myId = ++requestId.current;

    if (!hasAvatar || !displayAvatar) {
      setWornUrl(null);
      setDressing(false);
      setMissingIds([]);
      return;
    }

    if (!lookPieces.length) {
      setWornUrl(displayAvatar);
      setDressing(false);
      setMissingIds([]);
      return;
    }

    let cancelled = false;

    (async () => {
      setDressing(true);
      setError("");
      setNotice("");
      setMissingIds([]);
      setNeedsKey(false);
      setNeedsBilling(false);
      setProgress(4);
      setWornUrl(displayAvatar);

      let current = displayAvatar;
      try {
        current = await letterboxForTryOn(displayAvatar);
        if (cancelled || myId !== requestId.current) return;
        setWornUrl(current);
      } catch {
        // Keep original if letterbox fails
      }

      const failOrBilling = (data: {
        needsKey?: boolean;
        needsBilling?: boolean;
        error?: string;
        detail?: string;
        imageUrl?: string;
      }) => {
        if (data.needsKey) {
          setNeedsKey(true);
          setKeyConfigured(false);
          setDressing(false);
          return true;
        }
        if (data.needsBilling) {
          setNeedsBilling(true);
          setDressing(false);
          return true;
        }
        return false;
      };

      try {
        const toPayload = (piece: (typeof lookPieces)[number]) => ({
          imageUrl: piece.imageUrl,
          category: piece.category,
          name: piece.name,
          colors: piece.colors,
          hexColors: piece.hexColors,
          fabric: piece.fabric,
          texture: piece.texture,
          tags: piece.tags,
        });

        const appliedNames = new Set<string>();

        // Clothes only via FASHN. Do not run shoe/accessory AI on top —
        // those passes spoil the clean head-to-toe clothes result.
        if (apparelPieces.length) {
          setActivePieceId(apparelPieces[0]?.id ?? null);
          setStepLabel("Dressing you…");
          setProgress(12);

          const tick = window.setInterval(() => {
            setProgress((p) => (p < 88 ? p + 2.5 : p));
          }, 800);

          const apparelRes = await fetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              personImage: current,
              stage: "apparel",
              maxPieces: 2,
              garments: apparelPieces.map(toPayload),
            }),
          });
          window.clearInterval(tick);

          const apparelData = await apparelRes.json();
          if (cancelled || myId !== requestId.current) return;
          if (failOrBilling(apparelData)) return;

          if (!apparelData.ok || !apparelData.imageUrl) {
            const detail =
              typeof apparelData.detail === "string"
                ? apparelData.detail.slice(0, 180)
                : "";
            setError(
              [apparelData.error || "Couldn’t dress this look", detail]
                .filter(Boolean)
                .join(" — ")
            );
            setDressing(false);
            return;
          }

          current = apparelData.imageUrl;
          setWornUrl(current);
          setKeyConfigured(true);
          for (const s of Array.isArray(apparelData.steps)
            ? apparelData.steps
            : []) {
            if (s?.name) appliedNames.add(s.name);
          }
        }

        setMissingIds([]);
        setNotice("");

        if (myId === requestId.current) {
          setActivePieceId(null);
          setStepLabel(appliedNames.size ? "You’re dressed" : "Ready");
          setProgress(100);
          setDressing(false);
        }
      } catch (err) {
        if (cancelled || myId !== requestId.current) return;
        setError(
          err instanceof Error ? err.message : "Try-on interrupted — please retry"
        );
        setDressing(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasAvatar, displayAvatar, lookKey, retryNonce, apparelPieces]);

  const alternatives = swapFor
    ? wardrobe.filter(
        (g) =>
          g.category === swapFor && !garments.some((s) => s.id === g.id)
      )
    : [];

  const replacePiece = (next: Garment) => {
    if (!outfit) return;
    const nextGarments = [
      ...garments.filter((g) => g.category !== next.category),
      next,
    ];
    const order = ["top", "dress", "bottom", "outerwear", "shoes", "accessory"];
    nextGarments.sort(
      (a, b) => order.indexOf(a.category) - order.indexOf(b.category)
    );
    setCurrentOutfit({
      ...outfit,
      id: `outfit_${Date.now()}`,
      garmentIds: nextGarments.map((g) => g.id),
      garments: nextGarments,
      createdAt: new Date().toISOString(),
    });
    setSwapFor(null);
  };

  const showKeyPrompt = needsKey || keyConfigured === false;
  const showBillingPrompt = needsBilling;

  return (
    <motion.div
      layout
      className="glass shine-border relative overflow-hidden rounded-[2rem] p-5 sm:p-8"
    >
      <div className="absolute inset-0 bg-[radial-gradient(900px_400px_at_15%_0%,rgba(201,168,124,0.12),transparent_55%)]" />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.28em] text-champagne">
                Your look
              </p>
              <p className="text-xs text-mist">
                Your photo — clothes on you
              </p>
            </div>
            <div className="flex items-center gap-2">
              <ChangePhotoButton
                compact
                onChanged={(url) => {
                  setWornUrl(url);
                  setRetryNonce((n) => n + 1);
                }}
              />
              {dressing && (
                <span className="rounded-full border border-champagne/30 bg-champagne/10 px-3 py-1 text-[10px] uppercase tracking-wider text-champagne">
                  Dressing you
                </span>
              )}
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[1.75rem] border border-line bg-[#0e0e0d] shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(201,168,124,0.08),transparent_60%)]" />

            <AnimatePresence mode="sync">
              {(wornUrl || displayAvatar) && (
                <motion.img
                  key={wornUrl || displayAvatar || "empty"}
                  src={wornUrl || displayAvatar || undefined}
                  alt="You in this outfit"
                  initial={{ opacity: 0.55 }}
                  animate={{
                    opacity: 1,
                    filter: dressing ? "brightness(0.92)" : "brightness(1)",
                  }}
                  transition={{ duration: 0.45, ease: "easeOut" }}
                  className="relative z-[1] mx-auto block h-auto max-h-[min(72vh,42rem)] w-full object-contain object-center"
                  onError={() => {
                    void resolveDisplayAvatar(avatarUrl).then((url) => {
                      if (url) {
                        setResolvedAvatar(url);
                        setWornUrl(url);
                      }
                    });
                  }}
                />
              )}
            </AnimatePresence>

            {!hasAvatar && (
              <div className="absolute inset-0 z-20 flex min-h-[22rem] flex-col items-center justify-center gap-3 p-8 text-center">
                <p className="font-display text-xl text-ivory">Add your photo</p>
                <p className="text-xs text-mist">
                  Upload a clear full-body photo (head to shoes).
                </p>
                <ChangePhotoButton
                  className="mt-2"
                  onChanged={(url) => {
                    setWornUrl(url);
                    setRetryNonce((n) => n + 1);
                  }}
                />
                <Link
                  href="/try-on"
                  className="mt-2 text-[10px] uppercase tracking-wider text-champagne hover:underline"
                >
                  Or open Try-On →
                </Link>
              </div>
            )}

            <AnimatePresence>
              {hasAvatar && dressing && !showKeyPrompt && !showBillingPrompt && (
                <motion.div
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-x-0 bottom-0 z-30 bg-gradient-to-t from-ink via-ink/85 to-transparent p-6 pt-20"
                >
                  <p className="font-display text-xl text-ivory">{stepLabel}</p>
                  <div className="mt-3 h-1 overflow-hidden rounded-full bg-white/10">
                    <motion.div
                      className="h-full bg-champagne"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {apparelPieces.map((g) => (
                      <div
                        key={g.id}
                        className={cn(
                          "rounded-full border px-2 py-1 text-[10px]",
                          activePieceId === g.id
                            ? "border-champagne/50 bg-champagne/15 text-champagne"
                            : "border-white/10 text-mist"
                        )}
                      >
                        <span className="truncate">{g.name}</span>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {showBillingPrompt && hasAvatar && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 p-6 text-center backdrop-blur-sm">
                <p className="font-display text-2xl text-ivory">
                  fal.ai credits used up
                </p>
                <p className="max-w-sm text-xs text-mist">
                  Try-on is locked until you top up your fal balance. Your photo
                  and wardrobe are fine — this is only billing.
                </p>
                <a
                  href="https://fal.ai/dashboard/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Top up fal billing →
                </a>
              </div>
            )}

            {showKeyPrompt && hasAvatar && !showBillingPrompt && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 p-6 text-center backdrop-blur-sm">
                <p className="font-display text-2xl text-ivory">Try-on needs fal credits</p>
                <a
                  href="https://fal.ai/dashboard/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Check fal billing →
                </a>
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-4 z-30 rounded-2xl border border-danger/30 bg-ink/85 px-4 py-3 text-xs text-danger">
                <p>{error}</p>
                <button
                  type="button"
                  className="mt-2 text-[11px] uppercase tracking-wider text-champagne hover:underline"
                  onClick={() => {
                    setError("");
                    setRetryNonce((n) => n + 1);
                  }}
                >
                  Retry full look
                </button>
              </div>
            )}

            {!error && notice && (
              <div className="absolute inset-x-4 top-4 z-30 rounded-2xl border border-line bg-ink/80 px-4 py-3 text-xs text-mist backdrop-blur-md">
                {notice}
              </div>
            )}

            {!dressing && wornUrl && outfit && !notice && !error && (
              <div className="pointer-events-none absolute left-4 top-4 z-10 max-w-[75%] rounded-2xl border border-line bg-ink/70 px-3 py-2 backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-[0.25em] text-champagne">
                  Ready · dressed for
                </p>
                <p className="font-display text-sm text-ivory">
                  {outfit.occasion}
                </p>
              </div>
            )}

            {!dressing && wornUrl && outfit && (notice || error) && (
              <div className="pointer-events-none absolute left-4 bottom-4 z-10 max-w-[75%] rounded-2xl border border-line bg-ink/70 px-3 py-2 backdrop-blur-md">
                <p className="text-[10px] uppercase tracking-[0.25em] text-champagne">
                  Dressed for
                </p>
                <p className="font-display text-sm text-ivory">
                  {outfit.occasion}
                </p>
              </div>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Today’s look
          </p>
          <h2 className="mt-2 font-display text-3xl text-ivory sm:text-4xl">
            {outfit?.name || "Ready when you are"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {outfit
              ? "You’re dressed in the clothes from this look. Tap any piece to change it."
              : "Tell VoiceDress where you’re going and we’ll choose one look from your wardrobe."}
          </p>

          <div className="mt-6">
            <p className="mb-2 text-[10px] uppercase tracking-[0.22em] text-champagne">
              Your look
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              {lookPieces.map((g) => (
                <GarmentTile
                  key={g.id}
                  garment={g}
                  active={swapFor === g.category || activePieceId === g.id}
                  dressing={dressing && activePieceId === g.id}
                  badge={
                    styledExtras.some((e) => e.id === g.id)
                      ? "Look piece"
                      : undefined
                  }
                  onClick={() =>
                    setSwapFor((c) => (c === g.category ? null : g.category))
                  }
                />
              ))}
            </div>
          </div>

          <AnimatePresence>
            {swapFor && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-5 overflow-hidden"
              >
                <div className="rounded-[1.5rem] border border-champagne/25 bg-champagne/5 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <p className="text-xs text-champagne">
                      Replace {swapFor} — we’ll dress it into the look
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-mist"
                      onClick={() => setSwapFor(null)}
                    >
                      Close
                    </button>
                  </div>
                  {alternatives.length === 0 ? (
                    <p className="text-xs text-mist">
                      No {swapFor} in your wardrobe — add one via Connect (upload
                      a photo or sync Shopify).
                    </p>
                  ) : (
                    <div className="grid gap-2 sm:grid-cols-2">
                      {alternatives.map((g) => (
                        <GarmentTile
                          key={g.id}
                          garment={g}
                          onClick={() => replacePiece(g)}
                        />
                      ))}
                    </div>
                  )}
                  <button
                    type="button"
                    className="mt-3 text-xs text-champagne hover:underline"
                    onClick={() => {
                      swapFromVoice(swapFor, outfit?.style, outfit?.occasion);
                      setSwapFor(null);
                    }}
                  >
                    Auto-pick best {swapFor}
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {(generating || dressing) && (
            <p className="mt-4 text-xs text-mist">
              Dressing the clothes onto your photo…
            </p>
          )}
          {!generating && !dressing && wornUrl && outfit && (
            <p className="mt-4 text-xs text-champagne/80">
              Clothes on you. You’re ready to go.
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export function GarmentTile({
  garment,
  active,
  dressing,
  badge,
  missing,
  onClick,
}: {
  garment: Garment;
  active?: boolean;
  dressing?: boolean;
  badge?: string;
  missing?: boolean;
  onClick?: () => void;
}) {
  const [broken, setBroken] = useState(false);
  const fallback = garment.hexColors[0] || "#36454F";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full gap-3 rounded-2xl border p-3 text-left transition duration-300",
        missing
          ? "border-champagne/35 bg-champagne/[0.04]"
          : active
            ? "border-champagne/60 bg-champagne/10"
            : "border-line bg-white/[0.02] hover:border-champagne/40",
        dressing && "ring-1 ring-champagne/40"
      )}
    >
      <div className="relative h-16 w-16 overflow-hidden rounded-xl bg-stone">
        {broken ? (
          <div className="h-full w-full" style={{ background: fallback }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={garment.imageUrl}
            alt={garment.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={() => setBroken(true)}
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="truncate text-sm text-ivory">{garment.name}</p>
          {(badge || missing) && (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                missing
                  ? "border-champagne/40 text-champagne"
                  : "border-line text-mist"
              )}
            >
              {missing ? "Pending" : badge}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-mist">
          {garment.brand} · {garment.category}
        </p>
        <p className="mt-2 text-[10px] uppercase tracking-wider text-mist">
          Tap to change
        </p>
      </div>
    </button>
  );
}
