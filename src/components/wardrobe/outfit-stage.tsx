"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Garment, Outfit } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AVATAR_IDB_REF } from "@/lib/avatar-storage";
import { useAetherStore } from "@/store/aether-store";
import { lookPiecesForTryOn, apparelForTryOn } from "@/lib/tryon-architecture";
import { normalizeGarmentPublicUrl } from "@/lib/garment-url";
import { letterboxForTryOn, lockFaceIdentity } from "@/lib/image";
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
      let identityPhoto = displayAvatar;
      try {
        current = await letterboxForTryOn(displayAvatar);
        identityPhoto = current;
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

        const isWatchPiece = (p: (typeof lookPieces)[number]) =>
          /watch|wrist|chrono|time/i.test(
            `${p.name || ""} ${(p.tags || []).join(" ")}`
          );
        const isEyewearPiece = (p: (typeof lookPieces)[number]) =>
          /glass|frame|optic|sunglass|spec/i.test(
            `${p.name || ""} ${(p.tags || []).join(" ")}`
          );

        const finishQueue = [
          ...styledExtras.filter((p) => p.category === "shoes"),
          ...styledExtras.filter(
            (p) => p.category === "accessory" && isEyewearPiece(p)
          ),
          ...styledExtras.filter(
            (p) => p.category === "accessory" && isWatchPiece(p)
          ),
          ...styledExtras.filter(
            (p) =>
              p.category === "accessory" &&
              !isEyewearPiece(p) &&
              !isWatchPiece(p)
          ),
        ];

        // 1) Clothes via fal FASHN + lock your real face
        if (apparelPieces.length) {
          setActivePieceId(apparelPieces[0]?.id ?? null);
          setStepLabel("Dressing you…");
          setProgress(10);

          const tick = window.setInterval(() => {
            setProgress((p) => (p < 48 ? p + 2.5 : p));
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

          setStepLabel("Keeping your face…");
          try {
            current = await lockFaceIdentity(
              identityPhoto,
              apparelData.imageUrl,
              "strong"
            );
          } catch {
            current = apparelData.imageUrl;
          }
          if (cancelled || myId !== requestId.current) return;
          setWornUrl(current);
          setKeyConfigured(true);
          setProgress(50);
          for (const s of Array.isArray(apparelData.steps)
            ? apparelData.steps
            : []) {
            if (s?.name) appliedNames.add(s.name);
          }

          // Layering polish (tuck / open coat / etc.) — face-lock again after
          if (outfit?.stylingTryOnPrompt) {
            setStepLabel("Layering the look…");
            setProgress(55);
            try {
              const styleRes = await fetch("/api/tryon/render", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  personImage: current,
                  stage: "style",
                  stylingPrompt: outfit.stylingTryOnPrompt,
                }),
              });
              const styleData = await styleRes.json();
              if (cancelled || myId !== requestId.current) return;
              if (
                !failOrBilling(styleData) &&
                styleData.ok &&
                styleData.imageUrl &&
                !styleData.skipped
              ) {
                try {
                  current = await lockFaceIdentity(
                    identityPhoto,
                    styleData.imageUrl,
                    "strong"
                  );
                } catch {
                  current = styleData.imageUrl;
                }
                if (cancelled || myId !== requestId.current) return;
                setWornUrl(current);
              }
            } catch {
              // Keep FASHN result if polish fails
            }
            setProgress(58);
          }
        }

        // 2) Shoes / glasses / watch via fal Kontext
        for (let i = 0; i < finishQueue.length; i++) {
          const piece = finishQueue[i];
          setActivePieceId(piece.id);
          setStepLabel(`Adding ${piece.name}…`);
          setProgress(
            50 + Math.round(((i + 1) / (finishQueue.length + 1)) * 40)
          );

          const finishRes = await fetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              personImage: current,
              stage: "finish",
              includeFaceAccessories: true,
              garments: [toPayload(piece)],
            }),
          });
          const finishData = await finishRes.json();
          if (cancelled || myId !== requestId.current) return;
          if (failOrBilling(finishData)) return;

          if (
            finishData.ok &&
            finishData.imageUrl &&
            Array.isArray(finishData.steps) &&
            finishData.steps.length > 0
          ) {
            // Soft face lock after glasses so frames can stay; strong after shoes
            try {
              if (piece.category === "shoes") {
                current = await lockFaceIdentity(
                  identityPhoto,
                  finishData.imageUrl,
                  "strong"
                );
              } else if (isEyewearPiece(piece)) {
                current = await lockFaceIdentity(
                  identityPhoto,
                  finishData.imageUrl,
                  "soft"
                );
              } else {
                current = finishData.imageUrl;
              }
            } catch {
              current = finishData.imageUrl;
            }
            if (cancelled || myId !== requestId.current) return;
            setWornUrl(current);
            appliedNames.add(piece.name);
            setKeyConfigured(true);
          }
        }

        const missed = lookPieces.filter((p) => !appliedNames.has(p.name));
        setMissingIds(missed.map((p) => p.id));
        setNotice(
          missed.length
            ? `${missed.map((p) => p.name).join(" · ")} didn’t land — tap to change.`
            : ""
        );

        if (myId === requestId.current) {
          setActivePieceId(null);
          setStepLabel(missed.length ? "Almost ready" : "Full look on you");
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
  }, [hasAvatar, displayAvatar, lookKey, retryNonce, apparelPieces, styledExtras]);

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
                Your photo — clothes + fal Kontext extras
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
                    {lookPieces.map((g) => (
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
              ? "We’ll dress you, then finish the layering — tuck, open coat, clean break — so it matches how you should wear it. Tap any piece to change it."
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
                  missing={missingIds.includes(g.id)}
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
              Dressing the full look — clothes first, then fal Kontext extras…
            </p>
          )}
          {!generating && !dressing && wornUrl && outfit && missingIds.length === 0 && (
            <p className="mt-4 text-xs text-champagne/80">
              Full look on you. You’re ready to go.
            </p>
          )}
          {!generating && !dressing && wornUrl && outfit && missingIds.length > 0 && (
            <p className="mt-4 text-xs text-mist">
              Clothes on you — some extras didn’t land. Tap a piece to change it.
            </p>
          )}
        </div>
      </div>

      {outfit?.stylingSteps && outfit.stylingSteps.length > 0 && (
        <div className="relative z-10 mt-8 border-t border-line/60 pt-6">
          <p className="text-[10px] uppercase tracking-[0.22em] text-champagne">
            How to wear it
          </p>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {outfit.stylingSteps.map((step) => (
              <li
                key={step}
                className="flex gap-2.5 text-sm leading-relaxed text-ivory-muted"
              >
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-champagne" />
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
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
  large,
}: {
  garment: Garment;
  active?: boolean;
  dressing?: boolean;
  badge?: string;
  missing?: boolean;
  onClick?: () => void;
  /** Bigger thumb — wardrobe grid on phones */
  large?: boolean;
}) {
  const [broken, setBroken] = useState(false);
  const [src, setSrc] = useState(() =>
    normalizeGarmentPublicUrl(garment.imageUrl)
  );
  const triedAlt = useRef(false);
  const fallback = garment.hexColors[0] || "#36454F";

  useEffect(() => {
    setBroken(false);
    triedAlt.current = false;
    setSrc(normalizeGarmentPublicUrl(garment.imageUrl));
  }, [garment.imageUrl]);

  const onImgError = () => {
    // Prefer sibling extension before falling back to a blank color block
    if (!triedAlt.current) {
      triedAlt.current = true;
      if (/\.jpe?g$/i.test(src)) {
        setSrc(src.replace(/\.(jpe?g)$/i, ".png"));
        return;
      }
      if (/\.png$/i.test(src)) {
        setSrc(src.replace(/\.png$/i, ".jpg"));
        return;
      }
    }
    setBroken(true);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group flex w-full text-left transition duration-300",
        large
          ? "flex-col gap-2.5 rounded-[1.25rem] border p-2.5"
          : "gap-3 rounded-2xl border p-3",
        missing
          ? "border-champagne/35 bg-champagne/[0.04]"
          : active
            ? "border-champagne/60 bg-champagne/10"
            : "border-line bg-white/[0.02] hover:border-champagne/40",
        dressing && "ring-1 ring-champagne/40"
      )}
    >
      <div
        className={cn(
          "relative overflow-hidden rounded-xl bg-stone",
          large
            ? "aspect-[3/4] w-full rounded-[1rem]"
            : "h-16 w-16 shrink-0"
        )}
      >
        {broken ? (
          <div className="h-full w-full" style={{ background: fallback }} />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={garment.name}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
            onError={onImgError}
          />
        )}
      </div>
      <div className={cn("min-w-0 flex-1", large && "px-1 pb-1")}>
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
        {!large && (
          <p className="mt-2 text-[10px] uppercase tracking-wider text-mist">
            Tap to change
          </p>
        )}
      </div>
    </button>
  );
}
