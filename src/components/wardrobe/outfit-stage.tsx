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
import { letterboxForTryOn, lockFaceIdentity, layerOuterwearPreserveBase, verifyApparelLook, hasTryOnArtifacts, polishTryOnResult, stabilizeTryOnColors } from "@/lib/image";
import { resolveDisplayAvatar } from "@/lib/resolve-avatar";
import { ChangePhotoButton } from "@/components/wardrobe/change-photo-button";
import { TrialOfferModal } from "@/components/billing/trial-offer-modal";
import {
  canStartPhotoTryOn,
  shouldOfferTrial,
} from "@/lib/entitlement";
import Link from "next/link";

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
  const garments = outfit?.garments || [];
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
  const [swapTargetId, setSwapTargetId] = useState<string | null>(null);
  const [keyConfigured, setKeyConfigured] = useState<boolean | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const [missingIds, setMissingIds] = useState<string[]>([]);
  const [donePieceIds, setDonePieceIds] = useState<string[]>([]);
  /** Quick pick = outfit tiles instantly, no photo wait. Full = dress onto photo. */
  const [photoTryOn, setPhotoTryOn] = useState(true);
  const requestId = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  /** Last fully/partially dressed photo — used to swap one piece without restarting. */
  const wornUrlRef = useRef<string | null>(null);
  /** Piece ids from the last completed (or in-flight) look on wornUrlRef. */
  const lookIdsRef = useRef<string[]>([]);
  const lastRetryNonceRef = useRef(0);

  useEffect(() => {
    wornUrlRef.current = wornUrl;
  }, [wornUrl]);

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
      lookIdsRef.current = [];
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

      const isWatchPiece = (p: (typeof lookPieces)[number]) =>
        /watch|wrist|chrono|time/i.test(
          `${p.name || ""} ${(p.tags || []).join(" ")}`
        );
      const isEyewearPiece = (p: (typeof lookPieces)[number]) =>
        /glass|frame|optic|sunglass|spec/i.test(
          `${p.name || ""} ${(p.tags || []).join(" ")}`
        );

      const failOrBilling = (data: {
        needsKey?: boolean;
        needsBilling?: boolean;
        error?: string;
        code?: string;
        detail?: string;
        imageUrl?: string;
        message?: string;
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
        if (data.needsBilling || data.code === "tryon_busy") {
          setError(
            data.message ||
              "Dressing is busy right now. Tap retry — your wardrobe is fine."
          );
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
        return false;
      };

      const nextIds = lookPieces.map((g) => g.id);
      const prevIds = lookIdsRef.current;
      const addedIds = nextIds.filter((id) => !prevIds.includes(id));
      const removedIds = prevIds.filter((id) => !nextIds.includes(id));
      const forceFull =
        retryNonce !== lastRetryNonceRef.current ||
        !wornUrlRef.current ||
        prevIds.length === 0;
      lastRetryNonceRef.current = retryNonce;

      const replacePieceOnly =
        !forceFull &&
        addedIds.length === 1 &&
        removedIds.length <= 1 &&
        Math.abs(nextIds.length - prevIds.length) <= 1
          ? lookPieces.find((g) => g.id === addedIds[0]) || null
          : null;

      // —— Single-piece swap on the already-dressed photo (saves credits) ——
      if (replacePieceOnly && wornUrlRef.current) {
        const piece = replacePieceOnly;
        const baseWorn = wornUrlRef.current;
        lookIdsRef.current = nextIds;

        setDressing(true);
        setError("");
        setNotice("");
        setNeedsKey(false);
        setNeedsBilling(false);
        setMissingIds([]);
        setWornUrl(baseWorn);
        setDonePieceIds(nextIds.filter((id) => id !== piece.id));
        setActivePieceId(piece.id);
        setStepLabel(`Swapping ${piece.name}…`);
        setProgress(28);

        let identityPhoto = displayAvatar;
        try {
          identityPhoto = await letterboxForTryOn(displayAvatar);
        } catch {
          // keep original
        }

        let current = baseWorn;
        const isApparel = ["top", "bottom", "dress", "outerwear"].includes(
          piece.category
        );

        try {
          if (isApparel) {
            const apparelRes = await authFetch("/api/tryon/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ac.signal,
              body: JSON.stringify({
                personImage: current,
                stage: "apparel",
                maxPieces: 1,
                // Keep everything already on the photo — only swap this piece
                stripOuterwear: false,
                garments: [toPayload(piece)],
              }),
            });
            const apparelData = await apparelRes.json();
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            if (failOrBilling(apparelData, apparelRes.status)) return;

            if (!apparelData.ok || !apparelData.imageUrl) {
              setError(
                apparelData.error ||
                  `Couldn’t swap ${piece.name || "that piece"}`
              );
              setMissingIds([piece.id]);
              setDressing(false);
              setActivePieceId(null);
              return;
            }

            let dressedUrl = apparelData.imageUrl as string;
            if (piece.category === "outerwear") {
              const stepProvider =
                Array.isArray(apparelData.steps) && apparelData.steps[0]
                  ? String(apparelData.steps[0].provider || "")
                  : "";
              if (!stepProvider.includes("fashn")) {
                try {
                  dressedUrl = await layerOuterwearPreserveBase(
                    baseWorn,
                    apparelData.imageUrl,
                    {
                      hexColors: piece.hexColors,
                      colors: piece.colors,
                    }
                  );
                } catch {
                  dressedUrl = apparelData.imageUrl;
                }
              }
            }

            try {
              current = await lockFaceIdentity(
                identityPhoto,
                dressedUrl,
                "strong"
              );
            } catch {
              current = dressedUrl;
            }
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            try {
              // Polish then re-lock face so clarity doesn't cartoonize you
              current = await polishTryOnResult(current);
              current = await lockFaceIdentity(
                identityPhoto,
                current,
                "strong"
              );
            } catch {
              // keep locked
            }
            setWornUrl(current);
            setKeyConfigured(true);
            if (apparelData.consumedFreeTryOn) {
              updateUser({
                freePhotoTryOnsUsed: Math.max(
                  1,
                  (user?.freePhotoTryOnsUsed || 0) + 1
                ),
              });
            }
          } else {
            // Shoes / glasses / watch / bag — finish stage only
            if (isEyewearPiece(piece)) {
              setStepLabel("Keeping your real face…");
              try {
                current = await lockFaceIdentity(
                  identityPhoto,
                  current,
                  "strong"
                );
                setWornUrl(current);
              } catch {
                // continue
              }
            }

            setProgress(55);
            const finishRes = await authFetch("/api/tryon/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ac.signal,
              body: JSON.stringify({
                personImage: current,
                stage: "finish",
                includeFaceAccessories: true,
                garments: [toPayload(piece)],
              }),
            });
            const finishData = await finishRes.json();
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            if (failOrBilling(finishData, finishRes.status)) return;

            if (
              !finishData.ok ||
              !finishData.imageUrl ||
              !Array.isArray(finishData.steps) ||
              finishData.steps.length === 0
            ) {
              setError(
                finishData.error ||
                  `Couldn’t swap ${piece.name || "that piece"}`
              );
              setMissingIds([piece.id]);
              setDressing(false);
              setActivePieceId(null);
              return;
            }

            try {
              const before = current;
              current = await stabilizeTryOnColors(before, finishData.imageUrl);
              current = await lockFaceIdentity(
                identityPhoto,
                current,
                isEyewearPiece(piece) ? "soft" : "strong"
              );
            } catch {
              current = finishData.imageUrl;
            }
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            try {
              current = await polishTryOnResult(current);
              current = await lockFaceIdentity(
                identityPhoto,
                current,
                isEyewearPiece(piece) ? "soft" : "strong"
              );
            } catch {
              // keep
            }
            setWornUrl(current);
            setKeyConfigured(true);
          }

          if (myId === requestId.current) {
            setDonePieceIds(nextIds);
            setMissingIds([]);
            setActivePieceId(null);
            setStepLabel("Updated on you");
            setProgress(100);
            setDressing(false);
            setNotice("");
            confirmWear(outfit);
          }
        } catch (err) {
          if (cancelled || myId !== requestId.current || ac.signal.aborted)
            return;
          setError(
            err instanceof Error
              ? err.message
              : "Swap interrupted — please retry"
          );
          setDressing(false);
          setActivePieceId(null);
        }
        return;
      }

      // —— Full look from your photo ——
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

      try {
        const appliedIds = new Set<string>();
        const appliedNames = new Set<string>();

        const finishQueue = [
          ...styledExtras.filter((p) => p.category === "shoes"),
          ...styledExtras.filter(
            (p) => p.category === "accessory" && isWatchPiece(p)
          ),
          ...styledExtras.filter(
            (p) =>
              p.category === "accessory" &&
              !isEyewearPiece(p) &&
              !isWatchPiece(p)
          ),
          // Glasses last — they rewrite the face; restore identity before them
          ...styledExtras.filter(
            (p) => p.category === "accessory" && isEyewearPiece(p)
          ),
        ];

        const markApplied = (step: { id?: string; name?: string }) => {
          if (step.id) appliedIds.add(step.id);
          if (step.name) appliedNames.add(step.name);
        };

        // 1) Base clothes in one call (top+bottom collage = 1 credit). Outerwear second.
        if (apparelPieces.length) {
          setDonePieceIds([]);
          setProgress(8);

          const baseApparel = apparelPieces.filter(
            (p) => p.category !== "outerwear"
          );
          const outerPiece = apparelPieces.find(
            (p) => p.category === "outerwear"
          );

          let apparelBaseBeforeOuter = current;

          if (baseApparel.length) {
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            setActivePieceId(baseApparel[0].id);
            setStepLabel(
              baseApparel.length > 1
                ? `Dressing ${baseApparel.map((p) => p.name).join(" + ")}…`
                : `Dressing ${baseApparel[0].name}…`
            );
            setProgress(12);

            const apparelRes = await authFetch("/api/tryon/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ac.signal,
              body: JSON.stringify({
                personImage: current,
                stage: "apparel",
                maxPieces: baseApparel.length,
                stripOuterwear: !outerPiece,
                garments: baseApparel.map(toPayload),
              }),
            });

            const apparelData = await apparelRes.json();
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            if (failOrBilling(apparelData, apparelRes.status)) return;

            if (!apparelData.ok || !apparelData.imageUrl) {
              const failedName = baseApparel[0]?.name || "clothes";
              const detail =
                typeof apparelData.detail === "string"
                  ? apparelData.detail.slice(0, 180)
                  : "";
              setError(
                [apparelData.error || `Couldn’t dress ${failedName}`, detail]
                  .filter(Boolean)
                  .join(" — ")
              );
              setMissingIds(baseApparel.map((p) => p.id));
              setDressing(false);
              setActivePieceId(null);
              return;
            }

            let dressedUrl = apparelData.imageUrl as string;
            try {
              current = await lockFaceIdentity(
                identityPhoto,
                dressedUrl,
                "strong"
              );
            } catch {
              current = dressedUrl;
            }
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            setWornUrl(current);
            setKeyConfigured(true);
            apparelBaseBeforeOuter = current;

            if (apparelData.consumedFreeTryOn) {
              consumedFreeThisRun = true;
              updateUser({
                freePhotoTryOnsUsed: Math.max(
                  1,
                  (user?.freePhotoTryOnsUsed || 0) + 1
                ),
              });
            }

            const stepIds = new Set(
              Array.isArray(apparelData.steps)
                ? apparelData.steps
                    .map((s: { id?: string }) => s.id)
                    .filter(Boolean)
                : []
            );
            for (const piece of baseApparel) {
              if (stepIds.size === 0 || stepIds.has(piece.id)) {
                markApplied({ id: piece.id, name: piece.name });
                setDonePieceIds((ids) =>
                  ids.includes(piece.id) ? ids : [...ids, piece.id]
                );
              } else {
                setMissingIds((ids) =>
                  ids.includes(piece.id) ? ids : [...ids, piece.id]
                );
              }
            }
            setProgress(outerPiece ? 42 : 55);
          }

          if (outerPiece) {
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            setActivePieceId(outerPiece.id);
            setStepLabel(`Dressing ${outerPiece.name}…`);
            setProgress(48);

            const apparelRes = await authFetch("/api/tryon/render", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              signal: ac.signal,
              body: JSON.stringify({
                personImage: current,
                stage: "apparel",
                maxPieces: 1,
                garments: [toPayload(outerPiece)],
              }),
            });

            const apparelData = await apparelRes.json();
            if (cancelled || myId !== requestId.current || ac.signal.aborted)
              return;
            if (failOrBilling(apparelData, apparelRes.status)) return;

            if (!apparelData.ok || !apparelData.imageUrl) {
              setNotice(
                `${outerPiece.name || "Outerwear"} didn’t land — continuing…`
              );
              setMissingIds((ids) =>
                ids.includes(outerPiece.id) ? ids : [...ids, outerPiece.id]
              );
            } else {
              let dressedUrl = apparelData.imageUrl as string;
              const stepProvider =
                Array.isArray(apparelData.steps) && apparelData.steps[0]
                  ? String(apparelData.steps[0].provider || "")
                  : "";
              const usedFashnMax = stepProvider.includes("fashn");

              if (!usedFashnMax) {
                setStepLabel("Keeping your base layers…");
                try {
                  dressedUrl = await layerOuterwearPreserveBase(
                    apparelBaseBeforeOuter,
                    apparelData.imageUrl,
                    {
                      hexColors: outerPiece.hexColors,
                      colors: outerPiece.colors,
                    }
                  );
                } catch {
                  dressedUrl = apparelData.imageUrl;
                }
              }

              if (await hasTryOnArtifacts(dressedUrl)) {
                setNotice(
                  `${outerPiece.name || "Coat"} came out glitched — left it off. Tap to retry.`
                );
                setMissingIds((ids) =>
                  ids.includes(outerPiece.id) ? ids : [...ids, outerPiece.id]
                );
                setWornUrl(apparelBaseBeforeOuter);
                current = apparelBaseBeforeOuter;
              } else {
                try {
                  current = await lockFaceIdentity(
                    identityPhoto,
                    dressedUrl,
                    "strong"
                  );
                } catch {
                  current = dressedUrl;
                }
                if (
                  cancelled ||
                  myId !== requestId.current ||
                  ac.signal.aborted
                )
                  return;
                setWornUrl(current);
                setKeyConfigured(true);
                markApplied({ id: outerPiece.id, name: outerPiece.name });
                setDonePieceIds((ids) =>
                  ids.includes(outerPiece.id) ? ids : [...ids, outerPiece.id]
                );
              }
            }
            setProgress(55);
          }

          setActivePieceId(null);
          setSwapFor(null);
          setSwapTargetId(null);

          // Trust gate — skip top checks when a blazer covers the torso.
          const hasOuterwear = apparelPieces.some(
            (p) => p.category === "outerwear"
          );
          const basePieces = apparelPieces.filter(
            (p) => p.category !== "outerwear"
          );
          const trust = await verifyApparelLook(current, basePieces, {
            skipTops: hasOuterwear,
          });
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          if (!trust.ok) {
            for (const id of trust.failedIds) {
              appliedIds.delete(id);
              const failed = basePieces.find((p) => p.id === id);
              if (failed?.name) appliedNames.delete(failed.name);
            }
            setMissingIds(trust.failedIds);
            setDonePieceIds((ids) => ids.filter((id) => !trust.failedIds.includes(id)));
            setNotice(
              trust.reason
                ? `${trust.reason}. Continuing with shoes & accessories…`
                : "Some clothes didn’t match — continuing with accessories…"
            );
          }

          const expectedOuter = lookPieces.find((p) => p.category === "outerwear");
          const outerLanded =
            !expectedOuter ||
            appliedIds.has(expectedOuter.id) ||
            appliedNames.has(expectedOuter.name);

          if (
            outfit?.stylingTryOnPrompt &&
            outerLanded &&
            process.env.NEXT_PUBLIC_TRYON_STYLE_POLISH === "1"
          ) {
            setStepLabel("Layering the look…");
            setProgress(55);
            try {
              const styleRes = await authFetch("/api/tryon/render", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                signal: ac.signal,
                body: JSON.stringify({
                  personImage: current,
                  stage: "style",
                  stylingPrompt: outfit.stylingTryOnPrompt,
                }),
              });
              const styleData = await styleRes.json();
              if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
              if (
                !failOrBilling(styleData, styleRes.status) &&
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
                if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
                setWornUrl(current);
              }
            } catch (err) {
              if (ac.signal.aborted) return;
            }
            setProgress(58);
          }
        }

        // 2) Shoes / watch first, then glasses last (face lock between)
        for (let i = 0; i < finishQueue.length; i++) {
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          const piece = finishQueue[i];
          const isEye = isEyewearPiece(piece);

          // Restore your real face before glasses touch the photo
          if (isEye) {
            setStepLabel("Keeping your real face…");
            try {
              current = await lockFaceIdentity(
                identityPhoto,
                current,
                "strong"
              );
              setWornUrl(current);
            } catch {
              // continue with current
            }
          }

          setActivePieceId(piece.id);
          setStepLabel(`Adding ${piece.name}…`);
          setProgress(
            50 + Math.round(((i + 1) / (finishQueue.length + 1)) * 40)
          );

          const beforeFinish = current;
          const finishRes = await authFetch("/api/tryon/render", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            signal: ac.signal,
            body: JSON.stringify({
              personImage: current,
              stage: "finish",
              includeFaceAccessories: true,
              garments: [toPayload(piece)],
            }),
          });
          const finishData = await finishRes.json();
          if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
          if (failOrBilling(finishData, finishRes.status)) return;

          if (
            finishData.ok &&
            finishData.imageUrl &&
            Array.isArray(finishData.steps) &&
            finishData.steps.length > 0
          ) {
            try {
              // Pull color grade back toward pre-accessory clothes
              current = await stabilizeTryOnColors(
                beforeFinish,
                finishData.imageUrl
              );
            } catch {
              current = finishData.imageUrl;
            }
            try {
              // Always restore your face — watch/glasses Kontext morphs identity
              current = await lockFaceIdentity(
                identityPhoto,
                current,
                isEye ? "soft" : "strong"
              );
            } catch {
              // keep color-stabilized frame
            }
            if (cancelled || myId !== requestId.current || ac.signal.aborted) return;
            setWornUrl(current);
            appliedIds.add(piece.id);
            appliedNames.add(piece.name);
            setDonePieceIds((ids) =>
              ids.includes(piece.id) ? ids : [...ids, piece.id]
            );
            setKeyConfigured(true);
          }
        }

        // Polish clothes/body first, then restore YOUR face last (never polish the face)
        setStepLabel("Finishing your look…");
        try {
          current = await polishTryOnResult(current);
        } catch {
          // keep current
        }
        try {
          // Always strong at the end — soft eye bands leave AI skin that reads as cartoon
          current = await lockFaceIdentity(identityPhoto, current, "strong");
        } catch {
          // keep current
        }
        setWornUrl(current);

        const missed = lookPieces.filter(
          (p) => !appliedIds.has(p.id) && !appliedNames.has(p.name)
        );
        setMissingIds(missed.map((p) => p.id));
        setNotice(
          missed.length
            ? `${missed.map((p) => p.name).join(" · ")} didn’t land — tap to change.`
            : ""
        );

        if (myId === requestId.current) {
          lookIdsRef.current = nextIds;
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
    // Replace only the tapped piece (important when 2+ accessories share a category)
    const nextGarments = [
      ...garments.filter((g) =>
        swapTargetId
          ? g.id !== swapTargetId
          : g.category !== next.category
      ),
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
    setSwapTargetId(null);
  };

  const showKeyPrompt = runTryOn && (needsKey || keyConfigured === false);
  const showBillingPrompt = runTryOn && needsBilling;

  return (
    <motion.div
      className="glass shine-border relative w-full min-w-0 overflow-x-clip rounded-[1.5rem] p-3 sm:rounded-[2rem] sm:p-8"
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(900px_400px_at_15%_0%,rgba(201,168,124,0.12),transparent_55%)]" />

      <div className="relative z-10 grid w-full min-w-0 gap-6 sm:gap-8 lg:grid-cols-[1fr_1.05fr]">
        <div className="relative mx-auto w-full min-w-0 max-w-md overflow-x-clip">
          <div className="mb-3 space-y-2.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.28em] text-champagne">
                  Your look
                </p>
                <p className="mt-0.5 text-xs text-mist">
                  {photoTryOn
                    ? "Dressed onto your photo"
                    : "Quick pick — photo optional"}
                </p>
              </div>
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

          {/* Progress sits ABOVE the photo — never covers legs/shoes */}
          <AnimatePresence>
            {hasAvatar && dressing && !showKeyPrompt && !showBillingPrompt && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mb-3 overflow-hidden"
              >
                <div className="rounded-2xl border border-line/80 bg-ink/80 px-3 py-2.5 backdrop-blur-md">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-sm leading-snug text-ivory sm:text-base">
                        {stepLabel}
                      </p>
                      <p className="mt-0.5 text-[10px] uppercase tracking-wider text-mist">
                        {piecesDone}/{piecesTotal}
                        {activePieceId ? " · applying" : ""}
                        {" · "}~
                        {etaSec < 60
                          ? `${etaSec}s`
                          : `${Math.ceil(etaSec / 60)}m`}{" "}
                        left
                      </p>
                    </div>
                    <p className="shrink-0 font-display text-2xl tabular-nums leading-none text-champagne sm:text-3xl">
                      {progressPct}
                      <span className="text-sm sm:text-base">%</span>
                    </p>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/15">
                    <motion.div
                      className="h-full rounded-full bg-champagne shadow-[0_0_10px_rgba(201,168,124,0.4)]"
                      animate={{ width: `${Math.max(progressPct, 4)}%` }}
                      transition={{ duration: 0.4 }}
                    />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                    filter: dressing ? "brightness(0.96)" : "brightness(1)",
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
                  Dressing is busy
                </p>
                <p className="max-w-sm text-xs text-mist">
                  We couldn’t finish putting this look on your photo. Your
                  wardrobe is fine — try again in a moment.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsBilling(false);
                    setError("");
                    setRetryNonce((n) => n + 1);
                  }}
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Retry dressing
                </button>
              </div>
            )}

            {showKeyPrompt && hasAvatar && !showBillingPrompt && (
              <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-3 bg-ink/75 p-6 text-center backdrop-blur-sm">
                <p className="font-display text-2xl text-ivory">
                  Dressing isn’t ready yet
                </p>
                <p className="max-w-sm text-xs text-mist">
                  Try again shortly — or switch to Quick to see the outfit tiles
                  while we catch up.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setNeedsKey(false);
                    setPhotoTryOnPref(false);
                  }}
                  className="rounded-full bg-champagne px-4 py-2 text-xs font-medium text-ink"
                >
                  Use Quick view
                </button>
              </div>
            )}

            {error && (
              <div className="absolute inset-x-4 top-[4.75rem] z-30 rounded-2xl border border-danger/30 bg-ink/85 px-4 py-3 text-xs text-danger sm:top-[5.25rem]">
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
              <div className="absolute inset-x-4 top-[4.75rem] z-30 rounded-2xl border border-line bg-ink/80 px-4 py-3 text-xs text-mist backdrop-blur-md sm:top-[5.25rem]">
                {notice}
              </div>
            )}

            <AnimatePresence>
              {!dressing && wornUrl && outfit && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="pointer-events-none absolute left-4 top-4 z-20 max-w-[75%] rounded-2xl border border-line bg-ink/70 px-3 py-2 backdrop-blur-md"
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
          </div>

          {/* Mobile: piece status under the photo — contained so it never blows page width */}
          {dressing && lookPieces.length > 0 && (
            <div className="mt-3 max-w-full overflow-x-auto overscroll-x-contain pb-1 [-webkit-overflow-scrolling:touch] lg:hidden">
              <div className="flex w-max max-w-none gap-2">
                {lookPieces.map((g) => (
                  <div
                    key={g.id}
                    className={cn(
                      "max-w-[8.5rem] shrink-0 truncate rounded-full border px-2.5 py-1 text-[10px]",
                      activePieceId === g.id
                        ? "border-champagne bg-champagne/15 text-champagne"
                        : donePieceIds.includes(g.id)
                          ? "border-champagne/40 text-champagne"
                          : "border-white/10 text-mist"
                    )}
                  >
                    {g.name}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 max-w-full overflow-x-clip">
          <p className="text-xs uppercase tracking-[0.28em] text-champagne">
            Today’s look
          </p>
          <h2 className="mt-2 line-clamp-2 font-display text-2xl text-ivory sm:text-4xl">
            {outfit?.name || "Ready when you are"}
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-mist">
            {outfit
              ? "Tap a piece to swap it. Ask by voice how to wear it."
              : "Tell VoiceDress where you’re going — one look from your wardrobe."}
          </p>

          <div className="mt-6 min-w-0">
            <div className="mb-2 flex min-w-0 items-end justify-between gap-2">
              <p className="min-w-0 truncate text-[10px] uppercase tracking-[0.22em] text-champagne">
                Your look
              </p>
              {dressing && (
                <p className="shrink-0 font-display text-base tabular-nums text-champagne sm:text-lg">
                  {progressPct}%
                  <span className="ml-1.5 text-[10px] uppercase tracking-wider text-mist">
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
            <div className="grid min-w-0 gap-3 sm:grid-cols-2">
              {lookPieces.map((g) => (
                <GarmentTile
                  key={g.id}
                  garment={g}
                  active={swapTargetId === g.id || activePieceId === g.id}
                  dressing={dressing && activePieceId === g.id}
                  done={donePieceIds.includes(g.id)}
                  missing={missingIds.includes(g.id)}
                  progressPct={
                    dressing && activePieceId === g.id ? progressPct : undefined
                  }
                  onClick={() => {
                    if (swapTargetId === g.id) {
                      setSwapFor(null);
                      setSwapTargetId(null);
                    } else {
                      setSwapFor(g.category);
                      setSwapTargetId(g.id);
                    }
                  }}
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
                      Replace {swapFor} — only this piece is re-dressed
                    </p>
                    <button
                      type="button"
                      className="text-[11px] text-mist"
                      onClick={() => {
                        setSwapFor(null);
                        setSwapTargetId(null);
                      }}
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
                      setSwapTargetId(null);
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
        "group relative flex w-full min-w-0 max-w-full text-left transition duration-300",
        large
          ? "flex-col gap-2.5 rounded-[1.25rem] border p-2.5"
          : "gap-2.5 rounded-2xl border p-2.5 sm:gap-3 sm:p-3",
        // Ring (not thicker border) so active state never widens the card on mobile.
        dressing
          ? "border-champagne bg-champagne/10 ring-2 ring-champagne/70 ring-inset"
          : missing
            ? "border-champagne/35 bg-champagne/[0.04]"
            : done
              ? "border-line bg-champagne/[0.04]"
              : active
                ? "border-champagne/55 bg-champagne/10"
                : "border-line bg-white/[0.02] hover:border-champagne/40"
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
                  : "…"
                : missing
                  ? "Soon"
                  : done
                    ? "On"
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
