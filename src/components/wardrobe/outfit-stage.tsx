"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { Garment, Outfit } from "@/lib/types";
import { authFetch } from "@/lib/auth-fetch";
import { cn } from "@/lib/utils";
import { AVATAR_IDB_REF } from "@/lib/avatar-storage";
import { useAetherStore } from "@/store/aether-store";
import {
  lookPiecesForTryOn,
  apparelForTryOn,
} from "@/lib/tryon-architecture";
import { normalizeGarmentPublicUrl } from "@/lib/garment-url";
import { letterboxForTryOn, lockFaceIdentity, layerOuterwearPreserveBase, verifyApparelLook, hasTryOnArtifacts } from "@/lib/image";
import { resolveDisplayAvatar } from "@/lib/resolve-avatar";
import { ChangePhotoButton } from "@/components/wardrobe/change-photo-button";
import { TrialOfferModal } from "@/components/billing/trial-offer-modal";
import {
  canStartPhotoTryOn,
  shouldOfferTrial,
} from "@/lib/entitlement";
import Link from "next/link";

type TryOnJson = {
  ok?: boolean;
  imageUrl?: string;
  error?: string;
  code?: string;
  detail?: string;
  needsKey?: boolean;
  needsBilling?: boolean;
  skipped?: boolean;
  consumedFreeTryOn?: boolean;
  steps?: { id?: string; provider?: string }[];
  [key: string]: unknown;
};

async function readJsonResponse(res: Response): Promise<TryOnJson> {
  const text = await res.text();
  try {
    return JSON.parse(text) as TryOnJson;
  } catch {
    throw new Error(
      res.ok
        ? "Dressing returned an unexpected response. Please retry."
        : `Dressing failed (${res.status}). Please retry.`
    );
  }
}

const EMPTY_GARMENTS: Garment[] = [];

export function OutfitStage({
  outfit,
  avatarUrl,
  generating = false,
  /** When false, show photo/look without kicking off fal try-on (Photo page). */
  autoTryOn = true,
}: {
  outfit: Outfit | null;
  avatarUrl?: string;
  generating?: boolean;
  autoTryOn?: boolean;
}) {
  const garments = outfit?.garments || EMPTY_GARMENTS;
  const wardrobe = useAetherStore((s) => s.wardrobe);
  const user = useAetherStore((s) => s.user);
  const updateUser = useAetherStore((s) => s.updateUser);
  const swapFromVoice = useAetherStore((s) => s.swapFromVoice);
  const setCurrentOutfit = useAetherStore((s) => s.setCurrentOutfit);
  const confirmWear = useAetherStore((s) => s.confirmWear);

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
  const [trialOffer, setTrialOffer] = useState<"soft" | "hard" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [stepLabel, setStepLabel] = useState("");
  const [progress, setProgress] = useState(0);
  const [activePieceId, setActivePieceId] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<Garment["category"] | null>(null);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [donePieceIds, setDonePieceIds] = useState<string[]>([]);
  /** Quick pick = outfit tiles instantly, no photo wait. Full = dress onto photo. */
  const [photoTryOn, setPhotoTryOn] = useState(true);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Simulate progress so the user doesn't think it hung
  useEffect(() => {
    if (!dressing || progress >= 95) return;
    const timer = setInterval(() => {
      setProgress((p) => {
        // Slow down as it gets closer to 95
        const increment = p < 50 ? 2 : p < 80 ? 1 : 0.5;
        return Math.min(95, p + increment);
      });
    }, 400);
    return () => clearInterval(timer);
  }, [dressing, progress]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("voicedress_photo_tryon");
      if (saved === "0") setPhotoTryOn(false);
      if (saved === "1") setPhotoTryOn(true);
    } catch {
      // ignore
    }
  }, []);

  const setPhotoTryOnPref = (on: boolean) => {
    setPhotoTryOn(on);
    try {
      localStorage.setItem("voicedress_photo_tryon", on ? "1" : "0");
    } catch {
      // ignore
    }
    if (on) setRetryNonce((n) => n + 1);
  };

  const runTryOn = autoTryOn && photoTryOn;

  const progressPct = Math.max(0, Math.min(100, Math.round(progress)));
  const piecesTotal = Math.max(1, lookPieces.length);
  const piecesDone = donePieceIds.length;
  const piecesLeft = Math.max(0, piecesTotal - piecesDone);
  // Quality/2k ≈ 15–25s per piece; show a calm estimate
  const etaSec = dressing
    ? Math.max(8, piecesLeft * 18 + (activePieceId ? 12 : 0))
    : 0;

  const lookKey = lookPieces.map((g) => g.id).join("|");

  useEffect(() => {
    authFetch("/api/tryon/render")
      .then((r) => r.json())
      .then((d) => setKeyConfigured(Boolean(d.configured)))
      .catch(() => setKeyConfigured(false));
  }, []);

  // Full suggested look on body: apparel (FASHN) then shoes/glasses/watch (Kontext)
  useEffect(() => {
    const myId = ++requestId.current;
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    if (!hasAvatar || !displayAvatar) {
      setWornUrl(null);
      setDressing(false);
      setMissingIds([]);
      setDonePieceIds([]);
      setActivePieceId(null);
      return () => {
        ac.abort();
      };
    }

    if (!runTryOn || !lookPieces.length) {
      setWornUrl(displayAvatar);
      setDressing(false);
      setMissingIds([]);
      setDonePieceIds([]);
      setNeedsKey(false);
      setNeedsBilling(false);
      setError("");
      setNotice("");
      setProgress(0);
      setActivePieceId(null);
      return () => {
        ac.abort();
      };
    }

    let cancelled = false;

    (async () => {
      // Hard gate before spending try-on credits — free gift already used
      if (!canStartPhotoTryOn(user)) {
        setWornUrl(displayAvatar);
        setDressing(false);
        setTrialOffer("hard");
        return;
      }

      setDressing(true);
      setError("");
      setNotice("");
      setMissingIds([]);
      setDonePieceIds([]);
      setActivePieceId(null);
      setNeedsKey(false);
      setNeedsBilling(false);
      setProgress(4);
      setWornUrl(displayAvatar);

      let consumedFreeThisRun = false;
      let current = displayAvatar;
      let identityPhoto = displayAvatar;
      try {
        current = await letterboxForTryOn(displayAvatar);
        identityPhoto = current;
        if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
        setWornUrl(current);
      } catch {
        // Keep original if letterbox fails
      }

      const failOrBilling = (data: {
        needsKey?: boolean;
        needsBilling?: boolean;
        error?: string;
        code?: string;
        detail?: string;
        imageUrl?: string;
      }, status?: number) => {
        if (data.needsKey) {
          setNeedsKey(true);
          setKeyConfigured(false);
          setDressing(false);
          return true;
        }
        if (
          data.code === "trial_required" ||
          data.code === "entitlement_required"
        ) {
          setTrialOffer("hard");
          setDressing(false);
          return true;
        }
        if (data.needsBilling) {
          setNeedsBilling(true);
          setDressing(false);
          return true;
        }
        if (status === 402) {
          setTrialOffer("hard");
          setDressing(false);
          return true;
        }
        if (status === 401 || data.code === "auth_required") {
          setError("Sign in to run virtual try-on.");
          setDressing(false);
          return true;
        }
        if (
          status === 503 ||
          data.code === "auth_unavailable" ||
          data.code === "admin_not_configured"
        ) {
          setError(
            "Couldn’t reach dressing right now. Sign out and back in, then retry."
          );
          setDressing(false);
          return true;
        }
        return false;
      };

      try {
        const toPayload = (piece: (typeof lookPieces)[number]) => ({
          id: piece.id,
          imageUrl: piece.imageUrl,
          category: piece.category,
          name: piece.name,
          colors: piece.colors,
          hexColors: piece.hexColors,
          fabric: piece.fabric,
          texture: piece.texture,
          tags: piece.tags,
        });

        const appliedIds = new Set<string>();
        const appliedNames = new Set<string>();

        const isWatchPiece = (p: (typeof lookPieces)[number]) =>
          /watch|wrist|chrono|time/i.test(
            `${p.name || ""} ${(p.tags || []).join(" ")}`
          );
        const isEyewearPiece = (p: (typeof lookPieces)[number]) =>
          /glass|frame|optic|sunglass|spec/i.test(
            `${p.name || ""} ${(p.tags || []).join(" ")}`
          );

        // Shoes + watch first. Skip sunglasses on full auto looks — they hang
        // for 30s+ and often warp the face without changing clothes.
        const finishQueue = [
          ...styledExtras.filter((p) => p.category === "shoes"),
          ...styledExtras.filter(
            (p) => p.category === "accessory" && isWatchPiece(p)
          ),
          ...styledExtras.filter(
            (p) => p.category === "accessory" && !isWatchPiece(p)
          ),
        ];
        const skippedEyewear: any[] = [];

        const markApplied = (step: { id?: string; name?: string }) => {
          if (step.id) appliedIds.add(step.id);
          if (step.name) appliedNames.add(step.name);
        };

        // EXTREME SPEED SINGLE PASS: Apply ALL pieces in one FASHN call
        if (lookPieces.length > 0) {
          setDonePieceIds([]);
          setProgress(10);
          setStepLabel(`Dressing you completely...`);
          setActivePieceId(null);

          const allRes = await authFetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              personImage: current,
              stage: "all",
              garments: lookPieces.map(toPayload),
            }),
          });

          const allData = await readJsonResponse(allRes);
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          if (failOrBilling(allData, allRes.status)) return;

          if (!allData.ok || !allData.imageUrl) {
            setError(
              typeof allData.error === "string" 
                ? allData.error 
                : "Couldn't complete extreme-speed dressing."
            );
            setDressing(false);
            return;
          }

          current = allData.imageUrl as string;
          
          try {
            // If the user is wearing glasses, use 'soft' face locking to leave the eyes visible.
            // Otherwise use 'strong' to perfectly paste the whole face.
            const hasEyewear = lookPieces.some(p => 
              /glass|frame|optic|sunglass|spec/i.test(p.name + p.category)
            );
            const lockStrength = hasEyewear ? "soft" : "strong";
            
            // Restore exact original face perfectly, using dynamic face scanner box if available
            current = await lockFaceIdentity(
              identityPhoto, 
              current, 
              lockStrength, 
              user?.avatarFaceBox
            );
          } catch (e) {
            console.warn("Face locking failed, using base try-on image", e);
          }
          
          setWornUrl(current);
          setKeyConfigured(true);

          if (allData.consumedFreeTryOn) {
            consumedFreeThisRun = true;
            updateUser({
              freePhotoTryOnsUsed: Math.max(1, (user?.freePhotoTryOnsUsed || 0) + 1),
            });
          }

          // Mark all requested items as applied if they were processed
          const stepIds = new Set(
            Array.isArray(allData.steps)
              ? allData.steps.map((s: { id?: string }) => s.id).filter(Boolean)
              : []
          );

          for (const piece of lookPieces) {
            if (stepIds.has(piece.id) || stepIds.size === 0) {
              markApplied({ id: piece.id, name: piece.name });
              setDonePieceIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            } else {
              setMissingIds((ids) => ids.includes(piece.id) ? ids : [...ids, piece.id]);
            }
          }
        }

        const missed = lookPieces.filter(
          (p) => !appliedIds.has(p.id) && !appliedNames.has(p.name)
        );
        setMissingIds(missed.map((p) => p.id));
        setNotice(
          missed.length
            ? `${missed.map((p) => p.name).join(" · ")} skipped by AI — tap to add individually.`
            : ""
        );

        if (myId === requestId.current) {
          setActivePieceId(null);
          setStepLabel(missed.length ? "Almost ready" : "Full look on you");
          setProgress(100);
          setDressing(false);
          if (appliedIds.size > 0 || appliedNames.size > 0) {
            confirmWear(outfit);
          }
          // Soft paywall after the free aha dress
          const after = {
            subscriptionStatus: user?.subscriptionStatus || "none",
            trialEndsAt: user?.trialEndsAt,
            freePhotoTryOnsUsed: consumedFreeThisRun
              ? Math.max(1, user?.freePhotoTryOnsUsed || 0)
              : user?.freePhotoTryOnsUsed,
          };
          if (shouldOfferTrial(after)) {
            setTrialOffer("soft");
            try {
              const { default: posthog } = await import("posthog-js");
              if (posthog.__loaded) {
                posthog.capture("trial_offer_shown", { mode: "soft" });
              }
            } catch {
              // ignore
            }
          }
        }
      } catch (err) {
        if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
        setError(
          err instanceof Error ? err.message : "Try-on interrupted — please retry"
        );
        setDressing(false);
      }
    })();

    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [
    hasAvatar,
    displayAvatar,
    lookKey,
    retryNonce,
    apparelPieces,
    styledExtras,
    outfit,
    confirmWear,
    runTryOn,
    user?.uid,
    user?.subscriptionStatus,
    user?.freePhotoTryOnsUsed,
    user?.trialEndsAt,
    updateUser,
  ]);

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

  const showKeyPrompt = runTryOn && (needsKey || keyConfigured === false);
  const showBillingPrompt = runTryOn && needsBilling;

  return (
    <motion.div
      className="glass shine-border relative overflow-hidden rounded-[2rem] p-5 sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_400px_at_15%_0%,rgba(201,168,124,0.12),transparent_55%)]" />

      <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="relative mx-auto w-full max-w-md">
          <div className="mb-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] uppercase tracking-[0.28em] text-champagne">
                  Your look
                </p>
                <p className="mt-0.5 text-xs text-mist">
                  {photoTryOn
                    ? "Dressed onto your photo"
                    : "Quick pick — photo optional"}
                </p>
              </div>
              {dressing && (
                <span className="shrink-0 rounded-full border border-champagne/40 bg-champagne/15 px-3 py-1 text-[11px] font-medium tabular-nums tracking-wide text-champagne">
                  {progressPct}%
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {autoTryOn && (
                <div className="flex rounded-full border border-line p-0.5 text-[10px] tracking-wide">
                  <button
                    type="button"
                    onClick={() => setPhotoTryOnPref(false)}
                    disabled={dressing}
                    className={cn(
                      "rounded-full px-2.5 py-1 transition",
                      !photoTryOn
                        ? "bg-champagne/20 text-champagne"
                        : "text-mist hover:text-ivory"
                    )}
                  >
                    Quick
                  </button>
                  <button
                    type="button"
                    onClick={() => setPhotoTryOnPref(true)}
                    disabled={dressing}
                    className={cn(
                      "rounded-full px-2.5 py-1 transition",
                      photoTryOn
                        ? "bg-champagne/20 text-champagne"
                        : "text-mist hover:text-ivory"
                    )}
                  >
                    On photo
                  </button>
                </div>
              )}
              <ChangePhotoButton
                compact
                onChanged={(url) => {
                  setWornUrl(url);
                  setRetryNonce((n) => n + 1);
                }}
              />
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
                  initial={{ opacity: 0.55, filter: "brightness(0.96)" }}
                  animate={{
                    opacity: 1,
                    filter: dressing ? "brightness(0.92)" : "brightness(1)",
                  }}
                  transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
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
                  Upload a clear full-body shot — head to shoes.
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



            {showBillingPrompt && hasAvatar && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 p-6 text-center backdrop-blur-sm">
                <p className="font-display text-2xl text-ivory">
                  Try-on credits used up
                </p>
                <p className="max-w-sm text-xs text-mist">
                  Top up billing to keep dressing onto your photo. Your wardrobe
                  is fine.
                </p>
                <a
                  href="https://fal.ai/dashboard/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Top up billing →
                </a>
              </div>
            )}

            {showKeyPrompt && hasAvatar && !showBillingPrompt && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 p-6 text-center backdrop-blur-sm">
                <p className="font-display text-2xl text-ivory">
                  Try-on needs credits
                </p>
                <a
                  href="https://fal.ai/dashboard/billing"
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Check billing →
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

            <AnimatePresence>
              {!dressing && wornUrl && outfit && !notice && !error && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute left-4 top-4 z-10 max-w-[75%] rounded-2xl border border-line bg-ink/70 px-3 py-2 backdrop-blur-md"
                >
                  <p className="text-[10px] uppercase tracking-[0.25em] text-champagne">
                    Ready · dressed for
                  </p>
                  <p className="font-display text-sm text-ivory">
                    {outfit.occasion}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

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
              ? "Tap a piece to swap it. Ask by voice how to wear it."
              : "Tell VoiceDress where you’re going — one look from your wardrobe."}
          </p>

          <div className="mt-6">
            <div className="mb-2 flex items-end justify-between gap-3">
              <p className="text-[10px] uppercase tracking-[0.22em] text-champagne">
                Your look
              </p>
              {dressing && (
                <p className="font-display text-lg tabular-nums text-champagne">
                  {progressPct}%
                  <span className="ml-2 text-[10px] uppercase tracking-wider text-mist">
                    {piecesDone}/{piecesTotal}
                  </span>
                </p>
              )}
            </div>
            {dressing && (
              <div className="mb-4 h-2.5 overflow-hidden rounded-full bg-white/10">
                <motion.div
                  className="h-full rounded-full bg-champagne"
                  animate={{ width: `${Math.max(progressPct, 4)}%` }}
                  transition={{ duration: 0.4 }}
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              {lookPieces.map((g) => (
                <GarmentTile
                  key={g.id}
                  garment={g}
                  active={swapFor === g.category || activePieceId === g.id}
                  dressing={dressing && activePieceId === g.id}
                  done={donePieceIds.includes(g.id)}
                  missing={missingIds.includes(g.id)}
                  progressPct={
                    dressing && activePieceId === g.id ? progressPct : undefined
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
                      a photo).
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
              {progressPct}%
              {etaSec
                ? ` · ~${etaSec < 60 ? `${etaSec}s` : `${Math.ceil(etaSec / 60)} min`} left`
                : ""}
              {" · "}
              Switch to Quick if you’re in a hurry.
            </p>
          )}
          {!generating && !dressing && autoTryOn && !photoTryOn && outfit && (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-mist">
                Fast path — outfit picked. Dress onto your photo when you want.
              </p>
              <button
                type="button"
                onClick={() => setPhotoTryOnPref(true)}
                className="shrink-0 rounded-full border border-champagne/40 bg-champagne/15 px-4 py-2 text-xs text-champagne transition hover:bg-champagne/25"
              >
                See on my photo
              </button>
            </div>
          )}
          {!generating && !dressing && wornUrl && outfit && photoTryOn && missingIds.length === 0 && (
            <p className="mt-4 text-xs text-champagne/80">
              You’re ready to go.
            </p>
          )}
          {!generating && !dressing && wornUrl && outfit && photoTryOn && missingIds.length > 0 && (
            <p className="mt-4 text-xs text-mist">
              Some pieces didn’t match — tap to swap.
            </p>
          )}
        </div>
      </div>

      <TrialOfferModal
        open={trialOffer !== null}
        mode={trialOffer || "soft"}
        onClose={() => setTrialOffer(null)}
      />
    </motion.div>
  );
}

export function GarmentTile({
  garment,
  active,
  dressing,
  done,
  badge,
  missing,
  progressPct,
  onClick,
  large,
}: {
  garment: Garment;
  active?: boolean;
  dressing?: boolean;
  /** Piece already applied in the current dress run */
  done?: boolean;
  badge?: string;
  missing?: boolean;
  /** Overall try-on % while this piece is applying */
  progressPct?: number;
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
      aria-busy={dressing || undefined}
      className={cn(
        "group relative flex w-full text-left transition duration-300",
        large
          ? "flex-col gap-2.5 rounded-[1.25rem] border p-2.5"
          : "gap-3 rounded-2xl border p-3",
        // Only the piece being applied gets a strong gold border; others stay dim.
        dressing
          ? "border-2 border-champagne bg-champagne/10"
          : missing
            ? "border border-champagne/35 bg-champagne/[0.04]"
            : done
              ? "border border-line bg-champagne/[0.04]"
              : active
                ? "border border-champagne/55 bg-champagne/10"
                : "border border-line bg-white/[0.02] hover:border-champagne/40"
      )}
    >
      <div
        className={cn(
          "relative shrink-0 overflow-hidden rounded-xl bg-stone",
          large
            ? "aspect-[3/4] w-full rounded-[1rem]"
            : "h-16 w-16"
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
          {(badge || missing || dressing || done) && (
            <span
              className={cn(
                "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider",
                dressing
                  ? "border-champagne text-champagne"
                  : missing
                    ? "border-champagne/40 text-champagne"
                    : done
                      ? "border-champagne/35 text-champagne/90"
                      : "border-line text-mist"
              )}
            >
              {dressing
                ? progressPct != null
                  ? `${progressPct}%`
                  : "Dressing"
                : missing
                  ? "Pending"
                  : done
                    ? "On you"
                    : badge}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-mist">
          {garment.brand} · {garment.category}
        </p>
        {!large && (
          <p className="mt-2 text-xs text-mist">
            {dressing
              ? progressPct != null
                ? `Applying · ${progressPct}%`
                : "Applying…"
              : "Tap to swap"}
          </p>
        )}
        {dressing && progressPct != null && (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-champagne transition-[width] duration-400"
              style={{ width: `${Math.max(progressPct, 4)}%` }}
            />
          </div>
        )}
      </div>
    </button>
  );
}
