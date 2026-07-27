"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CommerceConnection,
  CommerceSource,
  Garment,
  Outfit,
  TasteMemory,
  UserProfile,
  WeatherSnapshot,
} from "@/lib/types";
import { seedWardrobe, WARDROBE_SEED_VERSION } from "@/lib/seed-data";
import { defaultConnections, sanitizeGarmentCategory, sanitizeWardrobe, isHosieryOrSocks, isUnderwearOrLounge } from "@/lib/commerce";
import {
  applySpokenWeather,
  occasionMeaningfullyChanged,
  parseSpokenWeather,
  suggestOutfit,
} from "@/lib/outfit-engine";
import {
  inferOccasionProfile,
  type OccasionProfile,
} from "@/lib/occasion-profile";
import {
  blendStyleHints,
  resolvePrimaryStyle,
} from "@/lib/style-options";
import {
  groundSpokenSuggest,
  phraseOccasionFromSpeech,
} from "@/lib/styling-guide";
import { matchGarmentFromSpeech, parseSwapSpeech } from "@/lib/garment-match";
import {
  AVATAR_IDB_REF,
  clearAvatarBlob,
  loadAvatarBlob,
  saveAvatarBlob,
} from "@/lib/avatar-storage";
import {
  bootstrapUserCloud,
  deleteGarmentCloud,
  hydrateUserFromCloud,
  saveCurrentOutfit,
  saveUserProfile,
  uploadUserAvatar,
  upsertGarments,
} from "@/lib/cloud-sync";
import {
  getFirebaseAuth,
  isFirebaseConfigured,
  signOut as firebaseSignOut,
} from "@/lib/firebase";

interface AetherState {
  user: UserProfile | null;
  wardrobe: Garment[];
  currentOutfit: Outfit | null;
  weather: WeatherSnapshot | null;
  connections: CommerceConnection[];
  taste: TasteMemory;
  voiceListening: boolean;
  lastTranscript: string;
  hydrated: boolean;
  cloudReady: boolean;
  setHydrated: (v: boolean) => void;
  hydrateAvatar: () => Promise<void>;
  /** Apply a full cloud session (after Auth). */
  applyCloudSession: (input: {
    profile: UserProfile;
    wardrobe: Garment[];
    outfit?: Outfit | null;
    taste?: TasteMemory;
  }) => void;
  /** Bootstrap new Firebase user: profile + seed wardrobe + optional avatar. */
  bootstrapCloudUser: (input: {
    uid: string;
    email: string;
    displayName: string;
    avatarDataUrl?: string;
  }) => Promise<void>;
  /** Load existing Firebase user from Firestore/Storage. */
  hydrateFromCloud: (uid: string) => Promise<boolean>;
  updateUser: (patch: Partial<UserProfile>) => void;
  /** @deprecated Prefer updateUser / bootstrapCloudUser */
  signInLocal: (
    profile: Partial<UserProfile> & { email: string; displayName: string }
  ) => void;
  signOutLocal: () => Promise<void>;
  setWeather: (w: WeatherSnapshot) => void;
  setAvatar: (url: string, status: UserProfile["avatarStatus"]) => Promise<void>;
  generateOutfit: (
    occasion?: string,
    style?: string,
    opts?: { tempC?: number; freshLook?: boolean; transcript?: string }
  ) => Outfit | null;
  generateOutfitAsync: (
    occasion?: string,
    style?: string,
    opts?: { tempC?: number; freshLook?: boolean; transcript?: string }
  ) => Promise<Outfit | null>;
  swapFromVoice: (
    category: Garment["category"],
    style?: string,
    occasion?: string,
    garmentQuery?: string,
    sourceQuery?: string
  ) => Outfit | null;
  pickGarmentById: (garmentId: string) => Outfit | null;
  rejectPiece: (garmentId: string) => void;
  /** Log a confirmed wear (e.g. after successful try-on) — not every suggestion. */
  confirmWear: (outfit?: Outfit | null) => void;
  setCurrentOutfit: (o: Outfit | null) => void;
  markShopifyConnected: (shop: string, itemCount?: number) => void;
  disconnectStore: (source: CommerceSource) => void;
  addGarments: (items: Garment[]) => void;
  removeGarment: (garmentId: string) => Promise<void>;
  setVoiceListening: (v: boolean) => void;
  setTranscript: (t: string) => void;
  setSubscription: (status: UserProfile["subscriptionStatus"]) => void;
}

function stripHeavyUrls(user: UserProfile | null): UserProfile | null {
  if (!user) return null;
  const next = { ...user };
  if (next.avatarUrl?.startsWith("data:")) next.avatarUrl = AVATAR_IDB_REF;
  if (next.photoURL?.startsWith("data:")) next.photoURL = AVATAR_IDB_REF;
  return next;
}

function isCloudUid(uid?: string) {
  return Boolean(uid && uid !== "voicedress_local_user" && isFirebaseConfigured);
}

function persistOutfitAndTaste(
  uid: string | undefined,
  outfit: Outfit | null,
  taste: TasteMemory
) {
  if (!isCloudUid(uid) || !uid) return;
  void saveUserProfile(uid, { taste }).catch(() => undefined);
  if (outfit) void saveCurrentOutfit(uid, outfit).catch(() => undefined);
}

/** Append this look to the wear log (newest first). */
function withWearLog(taste: TasteMemory, outfit: Outfit): TasteMemory {
  const entry = {
    at: new Date().toISOString(),
    garmentIds: outfit.garmentIds || [],
  };
  const wearLog = [entry, ...(taste.wearLog || [])]
    .filter((e) => e.garmentIds?.length)
    .slice(0, 14);
  return {
    ...taste,
    wearLog,
    recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
  };
}

async function fetchOccasionProfile(
  occasion: string,
  style?: string
): Promise<OccasionProfile> {
  try {
    const { authFetch } = await import("@/lib/auth-fetch");
    const res = await authFetch("/api/outfit/understand-occasion", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ occasion, style }),
    });
    if (!res.ok) return inferOccasionProfile(occasion, style);
    const data = await res.json();
    return data.profile || inferOccasionProfile(occasion, style);
  } catch {
    return inferOccasionProfile(occasion, style);
  }
}

async function fetchStylingGuide(input: {
  garments: NonNullable<Outfit["garments"]>;
  weather: WeatherSnapshot;
  formality: string;
  style: string;
  occasion: string;
  previousGuide?: string;
  transcript?: string;
}) {
  try {
    const { authFetch } = await import("@/lib/auth-fetch");
    const res = await authFetch("/api/outfit/styling", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.guide as {
      steps: string[];
      spoken: string;
      tryOnPrompt: string;
    } | null;
  } catch {
    return null;
  }
}

export const useAetherStore = create<AetherState>()(
  persist(
    (set, get) => ({
      user: null,
      wardrobe: [],
      currentOutfit: null,
      weather: null,
      connections: defaultConnections(),
      taste: { rejectedIds: [], recentOutfitIds: [] },
      voiceListening: false,
      lastTranscript: "",
      hydrated: false,
      cloudReady: false,
      setHydrated: (v) => set({ hydrated: v }),
      hydrateAvatar: async () => {
        const user = get().user;
        if (!user) return;
        if (user.avatarUrl?.startsWith("http")) return;
        const blob = await loadAvatarBlob();
        if (blob) {
          set({
            user: {
              ...user,
              avatarUrl: blob,
              photoURL: user.photoURL === AVATAR_IDB_REF ? blob : user.photoURL,
              avatarStatus:
                user.avatarStatus === "none" ? "ready" : user.avatarStatus,
            },
          });
        }
      },
      applyCloudSession: ({ profile, wardrobe, outfit, taste }) => {
        const prev = get().user;
        // Don't let a stale/empty cloud profile wipe a photo we just saved locally
        const keepLocalPhoto =
          prev &&
          prev.uid === profile.uid &&
          (prev.avatarStatus === "ready" ||
            prev.avatarUrl?.startsWith("data:") ||
            prev.avatarUrl === AVATAR_IDB_REF) &&
          (!profile.avatarUrl ||
            profile.avatarStatus === "none" ||
            !profile.avatarStatus);

        const merged = keepLocalPhoto
          ? {
              ...profile,
              avatarUrl: prev.avatarUrl || profile.avatarUrl,
              photoURL: prev.photoURL || profile.photoURL,
              avatarStatus: "ready" as const,
            }
          : profile;

        const safeWardrobe = sanitizeWardrobe(wardrobe);
        const safeOutfit = outfit
          ? {
              ...outfit,
              garments: sanitizeWardrobe(outfit.garments || []).filter(
                (g) => !isHosieryOrSocks(g) && !isUnderwearOrLounge(g)
              ),
            }
          : null;
        if (safeOutfit) {
          safeOutfit.garmentIds = safeOutfit.garments.map((g) => g.id);
        }

        set({
          user: merged,
          wardrobe: safeWardrobe,
          currentOutfit: safeOutfit,
          taste: taste || { rejectedIds: [], recentOutfitIds: [] },
          cloudReady: true,
        });
        if (merged.avatarUrl?.startsWith("http")) {
          void saveAvatarBlob(merged.avatarUrl).catch(() => undefined);
        }
      },
      bootstrapCloudUser: async ({ uid, email, displayName, avatarDataUrl }) => {
        const result = await bootstrapUserCloud({
          uid,
          email,
          displayName,
          avatarDataUrl,
          seedGarments: seedWardrobe(uid),
        });
        get().applyCloudSession({
          profile: result.profile,
          wardrobe: result.wardrobe,
          outfit: null,
          taste: { rejectedIds: [], recentOutfitIds: [] },
        });
        if (avatarDataUrl) await saveAvatarBlob(avatarDataUrl);
        else if (result.avatarUrl) await saveAvatarBlob(result.avatarUrl);
      },
      hydrateFromCloud: async (uid) => {
        try {
          const data = await hydrateUserFromCloud(uid);
          if (!data?.profile?.email) return false;
          const profile: UserProfile = {
            uid,
            email: data.profile.email || "",
            displayName: data.profile.displayName || "VoiceDress Member",
            photoURL: data.profile.photoURL || data.profile.avatarUrl,
            avatarUrl: data.profile.avatarUrl || data.profile.photoURL,
            avatarStatus: data.profile.avatarStatus || "none",
            city: data.profile.city || "London",
            lat: data.profile.lat ?? 51.5074,
            lon: data.profile.lon ?? -0.1278,
            stylePrefs: data.profile.stylePrefs || ["quiet luxury", "old money"],
            subscriptionStatus:
              data.profile.subscriptionStatus ||
              (data.profile.trialEndsAt ? "trialing" : "none"),
            trialEndsAt: data.profile.trialEndsAt,
            freePhotoTryOnsUsed: data.profile.freePhotoTryOnsUsed ?? 0,
            stripeCustomerId: data.profile.stripeCustomerId,
            stripeSubscriptionId: data.profile.stripeSubscriptionId,
            connectedStores: data.profile.connectedStores || [],
            voiceEnabled: data.profile.voiceEnabled ?? true,
            createdAt: data.profile.createdAt || new Date().toISOString(),
          };
          // If cloud wardrobe empty (edge), seed once
          let wardrobe = data.wardrobe;
          if (!wardrobe.length) {
            wardrobe = await upsertGarments(uid, seedWardrobe(uid));
          } else {
            // Repair localhost / LAN absolute garment URLs so phones can load them
            const { normalizeGarmentPublicUrl } = await import(
              "@/lib/garment-url"
            );
            const repaired = wardrobe.map((g) => {
              const next = normalizeGarmentPublicUrl(g.imageUrl || "");
              return next !== g.imageUrl ? { ...g, imageUrl: next } : g;
            });
            const categorized = sanitizeWardrobe(repaired);
            const dirty = categorized.filter((g, i) => {
              const prev = wardrobe[i];
              return (
                g.imageUrl !== prev?.imageUrl || g.category !== prev?.category
              );
            });
            wardrobe = categorized;
            if (dirty.length) {
              void upsertGarments(uid, dirty).catch(() => undefined);
            }
          }
          // Never restore a saved look on login — wait until the user says
          // where they're going (voice / occasion) before dressing them.
          get().applyCloudSession({
            profile,
            wardrobe,
            outfit: null,
            taste: data.profile.taste,
          });
          return true;
        } catch {
          return false;
        }
      },
      updateUser: (patch) => {
        const user = get().user;
        if (!user) return;
        const next = { ...user, ...patch };
        set({ user: next });
        if (isCloudUid(user.uid)) {
          // Entitlement fields are server-owned (Admin / Stripe webhook).
          const {
            subscriptionStatus: _s,
            trialEndsAt: _t,
            freePhotoTryOnsUsed: _f,
            stripeCustomerId: _c,
            stripeSubscriptionId: _sub,
            ...safePatch
          } = patch;
          if (Object.keys(safePatch).length) {
            void saveUserProfile(user.uid, {
              ...safePatch,
              taste: get().taste,
            }).catch(() => undefined);
          }
        }
      },
      signInLocal: (profile) => {
        const user = get().user;
        if (user) {
          get().updateUser(profile);
          return;
        }
        // Should not create fake sessions when Firebase is configured
        set({
          user: {
            uid: profile.uid || "pending",
            email: profile.email,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
            avatarUrl: profile.avatarUrl,
            avatarStatus: profile.avatarStatus || "none",
            city: profile.city || "London",
            lat: profile.lat ?? 51.5074,
            lon: profile.lon ?? -0.1278,
            stylePrefs: profile.stylePrefs || ["quiet luxury", "old money"],
            subscriptionStatus: profile.subscriptionStatus || "none",
            trialEndsAt: profile.trialEndsAt,
            freePhotoTryOnsUsed: profile.freePhotoTryOnsUsed ?? 0,
            connectedStores: profile.connectedStores || [],
            voiceEnabled: profile.voiceEnabled ?? true,
            createdAt: profile.createdAt || new Date().toISOString(),
          },
        });
      },
      signOutLocal: async () => {
        void clearAvatarBlob();
        const auth = getFirebaseAuth();
        if (auth) {
          try {
            await firebaseSignOut(auth);
          } catch {
            // ignore
          }
        }
        set({
          user: null,
          wardrobe: [],
          currentOutfit: null,
          lastTranscript: "",
          taste: { rejectedIds: [], recentOutfitIds: [] },
          cloudReady: false,
        });
      },
      setWeather: (w) => set({ weather: w }),
      setAvatar: async (url, status) => {
        const user = get().user;
        if (!user) return;

        // Local-first: unlock the app immediately, sync to Storage in the background
        if (url.startsWith("data:")) {
          await saveAvatarBlob(url);
        }

        const next = {
          ...user,
          avatarUrl: url.startsWith("data:") ? url : url,
          photoURL: user.photoURL,
          avatarStatus: status,
        };
        set({ user: next });

        if (url.startsWith("data:") && isCloudUid(user.uid)) {
          void (async () => {
            try {
              const cloudUrl = await uploadUserAvatar(user.uid, url);
              const current = get().user;
              if (!current || current.uid !== user.uid) return;
              set({
                user: {
                  ...current,
                  photoURL: cloudUrl,
                  avatarStatus: status,
                },
              });
              void saveUserProfile(user.uid, {
                avatarUrl: cloudUrl,
                photoURL: cloudUrl,
                avatarStatus: status,
              }).catch(() => undefined);
            } catch {
              void saveUserProfile(user.uid, {
                avatarStatus: status,
              }).catch(() => undefined);
            }
          })();
        } else if (isCloudUid(user.uid)) {
          void saveUserProfile(user.uid, {
            avatarUrl: url,
            photoURL: url,
            avatarStatus: status,
          }).catch(() => undefined);
        }
      },
      generateOutfit: (occasion = "today", style, opts) => {
        const { wardrobe, weather, user, taste, currentOutfit } = get();
        if (!weather || !wardrobe.length) return null;
        const stylePrefs = user?.stylePrefs;
        const primaryStyle = resolvePrimaryStyle(stylePrefs, style);
        const spoken =
          opts?.tempC != null
            ? {
                tempC: opts.tempC,
                label: `${Math.round(opts.tempC)}°C`,
                hypothetical: true,
              }
            : opts?.transcript
              ? parseSpokenWeather(opts.transcript)
              : null;
        const effectiveWeather = applySpokenWeather(weather, spoken);
        const resolvedOccasion =
          (!occasion || occasion === "today") && currentOutfit?.occasion
            ? currentOutfit.occasion
            : occasion;
        const profileBase = inferOccasionProfile(
          resolvedOccasion,
          primaryStyle
        );
        const profile = {
          ...profileBase,
          styleHints: blendStyleHints(stylePrefs, profileBase.styleHints),
        };
        const occasionChanged = occasionMeaningfullyChanged(
          currentOutfit?.occasion,
          profile.label
        );
        const outfit = suggestOutfit({
          wardrobe,
          weather: effectiveWeather,
          occasion: resolvedOccasion,
          style: primaryStyle,
          stylePrefs,
          profile,
          taste,
          // New event → score fresh for that formality (don’t soft-lock on dinner pieces).
          // Same event re-ask → soft rotate away from the last look.
          demoteIds: occasionChanged ? undefined : currentOutfit?.garmentIds,
          demotePenalty: -6,
        });
        const nextTaste: TasteMemory = {
          ...taste,
          preferredStyle: stylePrefs?.[0] || outfit.style,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      generateOutfitAsync: async (occasion = "today", style, opts) => {
        const { wardrobe, weather, user, taste, currentOutfit } = get();
        if (!weather || !wardrobe.length) return null;
        const stylePrefs = user?.stylePrefs;
        const primaryStyle = resolvePrimaryStyle(stylePrefs, style);
        const spoken =
          opts?.tempC != null
            ? {
                tempC: opts.tempC,
                label: `${Math.round(opts.tempC)}°C`,
                hypothetical: true,
              }
            : opts?.transcript
              ? parseSpokenWeather(opts.transcript)
              : null;
        const effectiveWeather = applySpokenWeather(weather, spoken);
        const resolvedOccasion =
          (!occasion || occasion === "today") && currentOutfit?.occasion
            ? currentOutfit.occasion
            : occasion;
        const profileBase = await fetchOccasionProfile(
          resolvedOccasion,
          primaryStyle
        );
        const profile = {
          ...profileBase,
          styleHints: blendStyleHints(stylePrefs, profileBase.styleHints),
        };
        const occasionChanged = occasionMeaningfullyChanged(
          currentOutfit?.occasion,
          profile.label
        );
        let outfit = suggestOutfit({
          wardrobe,
          weather: effectiveWeather,
          occasion: profile.label,
          style: primaryStyle,
          stylePrefs,
          profile,
          taste,
          // New event → pure occasion/weather score. Same event → soft rotate.
          demoteIds: occasionChanged ? undefined : currentOutfit?.garmentIds,
          demotePenalty: -8,
        });

        const aiGuide = await fetchStylingGuide({
          garments: outfit.garments || [],
          weather: effectiveWeather,
          formality: profile.formality,
          style: outfit.style,
          occasion: outfit.occasion,
          previousGuide: currentOutfit?.stylingGuide,
          transcript: opts?.transcript,
        });
        const displayOccasion = phraseOccasionFromSpeech(
          profile.label,
          opts?.transcript
        );
        if (aiGuide?.steps?.length && aiGuide.spoken) {
          const spoken = groundSpokenSuggest({
            spoken: aiGuide.spoken,
            garments: outfit.garments || [],
            occasion: displayOccasion,
            transcript: opts?.transcript,
            steps: aiGuide.steps,
            weather: effectiveWeather,
            formality: profile.formality,
          });
          outfit = {
            ...outfit,
            occasion: displayOccasion,
            stylingSteps: aiGuide.steps,
            stylingGuide: spoken,
            stylingTryOnPrompt: aiGuide.tryOnPrompt || outfit.stylingTryOnPrompt,
            rationale: `${(outfit.garments || []).map((g) => g.name).join(" + ")} — ${profile.formality.replace("_", " ")} for ${displayOccasion}. ${spoken}`,
          };
        } else if (opts?.transcript) {
          outfit = {
            ...outfit,
            occasion: displayOccasion,
            stylingGuide: groundSpokenSuggest({
              spoken: outfit.stylingGuide || "",
              garments: outfit.garments || [],
              occasion: displayOccasion,
              transcript: opts.transcript,
              steps: outfit.stylingSteps,
              weather: effectiveWeather,
              formality: profile.formality,
            }),
          };
        }

        const nextTaste: TasteMemory = {
          ...taste,
          preferredStyle: stylePrefs?.[0] || outfit.style,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      swapFromVoice: (category, style, occasion, garmentQuery, sourceQuery) => {
        const { wardrobe, weather, currentOutfit, user, taste } = get();
        if (!weather || !wardrobe.length) return null;
        const stylePrefs = user?.stylePrefs;
        const primaryStyle = resolvePrimaryStyle(stylePrefs, style);

        // Prefer "change X to Y" parsing so we match the TARGET, not the worn piece
        const swapSpeech = garmentQuery
          ? parseSwapSpeech(garmentQuery)
          : { isSwap: false as const };
        const targetQuery =
          (swapSpeech.isSwap && swapSpeech.targetQuery) ||
          garmentQuery ||
          undefined;
        const sourceQ =
          sourceQuery ||
          (swapSpeech.isSwap ? swapSpeech.sourceQuery : undefined) ||
          undefined;
        const resolvedCategory =
          (swapSpeech.isSwap && swapSpeech.category) || category;

        let forceGarmentId: string | undefined;
        if (targetQuery) {
          const named = matchGarmentFromSpeech(
            targetQuery,
            wardrobe,
            resolvedCategory
          );
          // Never force the piece already on them (source matched as target)
          if (
            named &&
            !currentOutfit?.garments?.some((g) => g.id === named.id)
          ) {
            forceGarmentId = named.id;
          } else if (named && sourceQ) {
            // Target phrase accidentally matched the worn piece — try again
            // excluding current look
            const alt = matchGarmentFromSpeech(
              targetQuery,
              wardrobe.filter(
                (g) => !currentOutfit?.garments?.some((c) => c.id === g.id)
              ),
              resolvedCategory
            );
            if (alt) forceGarmentId = alt.id;
          } else if (!named) {
            const anyCat = matchGarmentFromSpeech(targetQuery, wardrobe);
            if (
              anyCat &&
              !currentOutfit?.garments?.some((g) => g.id === anyCat.id)
            ) {
              forceGarmentId = anyCat.id;
            }
          }
        }

        // Surgical swap: keep every other piece id identical so try-on
        // only re-dresses this one item (esp. when 2 accessories are on).
        if (currentOutfit?.garments?.length) {
          const currentGarments = currentOutfit.garments;

          let replaceId: string | undefined;
          if (sourceQ) {
            replaceId =
              matchGarmentFromSpeech(sourceQ, currentGarments, resolvedCategory)
                ?.id ||
              matchGarmentFromSpeech(sourceQ, currentGarments)?.id;
          }
          if (!replaceId) {
            replaceId = currentGarments.find(
              (g) => g.category === resolvedCategory
            )?.id;
          }
          if (resolvedCategory === "accessory") {
            const accessories = currentGarments.filter(
              (g) => g.category === "accessory"
            );
            const q = `${sourceQ || ""} ${targetQuery || ""}`;
            if (/glass|sunglass|optic|frame/i.test(q)) {
              replaceId =
                accessories.find((g) =>
                  /glass|sunglass|optic|frame/i.test(
                    `${g.name} ${(g.tags || []).join(" ")}`
                  )
                )?.id || replaceId;
            } else if (/watch|wrist|chrono/i.test(q)) {
              replaceId =
                accessories.find((g) =>
                  /watch|wrist|chrono/i.test(
                    `${g.name} ${(g.tags || []).join(" ")}`
                  )
                )?.id || replaceId;
            } else if (accessories.length > 1 && !sourceQ) {
              replaceId = accessories[0]?.id || replaceId;
            }
          }

          let nextPiece =
            (forceGarmentId &&
              wardrobe.find((g) => g.id === forceGarmentId)) ||
            undefined;
          if (!nextPiece) {
            const pool = wardrobe.filter(
              (g) =>
                g.category === resolvedCategory &&
                !currentGarments.some((c) => c.id === g.id)
            );
            // Prefer scored pick via suggestOutfit when available
            const suggested = suggestOutfit({
              wardrobe,
              weather,
              occasion: occasion || currentOutfit.occasion || "today",
              style: primaryStyle,
              stylePrefs,
              swapCategory: forceGarmentId ? undefined : resolvedCategory,
              forceGarmentId,
              currentOutfit: currentGarments,
              taste,
              demoteIds: replaceId ? [replaceId] : undefined,
              demotePenalty: -10,
            });
            const picked = suggested.garments?.find(
              (g) =>
                g.category === resolvedCategory &&
                !currentGarments.some((c) => c.id === g.id)
            );
            nextPiece = picked || pool[0];
          }

          if (nextPiece && replaceId && nextPiece.id !== replaceId) {
            const nextGarments = [
              ...currentGarments.filter((g) => g.id !== replaceId),
              nextPiece,
            ];
            const order = [
              "top",
              "dress",
              "bottom",
              "outerwear",
              "shoes",
              "accessory",
            ] as const;
            nextGarments.sort(
              (a, b) =>
                order.indexOf(a.category as (typeof order)[number]) -
                order.indexOf(b.category as (typeof order)[number])
            );
            const outfit = {
              ...currentOutfit,
              id: `outfit_${Date.now()}`,
              garmentIds: nextGarments.map((g) => g.id),
              garments: nextGarments,
              createdAt: new Date().toISOString(),
            };
            const nextTaste: TasteMemory = {
              ...taste,
              preferredStyle: stylePrefs?.[0] || outfit.style,
              recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(
                0,
                20
              ),
            };
            set({ currentOutfit: outfit, taste: nextTaste });
            persistOutfitAndTaste(user?.uid, outfit, nextTaste);
            return outfit;
          }
        }

        // Soft demote only — don't permanently blacklist on a casual swap.
        const rejectedFromCurrent =
          currentOutfit?.garments?.find((g) => g.category === resolvedCategory)
            ?.id;
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: occasion || currentOutfit?.occasion || "today",
          style: primaryStyle,
          stylePrefs,
          swapCategory: forceGarmentId ? undefined : resolvedCategory,
          forceGarmentId,
          currentOutfit: currentOutfit?.garments,
          taste,
          demoteIds: rejectedFromCurrent ? [rejectedFromCurrent] : undefined,
          demotePenalty: -10,
        });
        const nextTaste: TasteMemory = {
          ...taste,
          preferredStyle: stylePrefs?.[0] || outfit.style,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      pickGarmentById: (garmentId) => {
        const { wardrobe, weather, currentOutfit, taste, user } = get();
        if (!weather || !currentOutfit?.garments || !wardrobe.length) return null;
        const piece = wardrobe.find((g) => g.id === garmentId);
        if (!piece) return null;

        // Surgical: replace only the matching category/id, keep every other piece
        const replaceId =
          currentOutfit.garments.find((g) => g.id === garmentId)?.id ||
          currentOutfit.garments.find((g) => g.category === piece.category)?.id;
        if (replaceId === piece.id) {
          // Already wearing it — no-op (avoid full re-dress)
          return currentOutfit;
        }
        if (replaceId) {
          const nextGarments = [
            ...currentOutfit.garments.filter((g) => g.id !== replaceId),
            piece,
          ];
          const order = [
            "top",
            "dress",
            "bottom",
            "outerwear",
            "shoes",
            "accessory",
          ] as const;
          nextGarments.sort(
            (a, b) =>
              order.indexOf(a.category as (typeof order)[number]) -
              order.indexOf(b.category as (typeof order)[number])
          );
          const outfit = {
            ...currentOutfit,
            id: `outfit_${Date.now()}`,
            garmentIds: nextGarments.map((g) => g.id),
            garments: nextGarments,
            createdAt: new Date().toISOString(),
          };
          const nextTaste: TasteMemory = {
            ...taste,
            preferredStyle: user?.stylePrefs?.[0] || outfit.style,
            recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
          };
          set({ currentOutfit: outfit, taste: nextTaste });
          persistOutfitAndTaste(user?.uid, outfit, nextTaste);
          return outfit;
        }

        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: currentOutfit.occasion,
          style: resolvePrimaryStyle(user?.stylePrefs, currentOutfit.style),
          stylePrefs: user?.stylePrefs,
          forceGarmentId: garmentId,
          currentOutfit: currentOutfit.garments,
          taste,
          demoteIds: replaceId ? [replaceId] : undefined,
          demotePenalty: -8,
        });
        const nextTaste: TasteMemory = {
          ...taste,
          preferredStyle: user?.stylePrefs?.[0] || outfit.style,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      rejectPiece: (garmentId) => {
        const { taste, user } = get();
        const nextTaste: TasteMemory = {
          ...taste,
          rejectedIds: Array.from(
            new Set([garmentId, ...taste.rejectedIds])
          ).slice(0, 40),
        };
        set({ taste: nextTaste });
        if (isCloudUid(user?.uid) && user) {
          void saveUserProfile(user.uid, { taste: nextTaste }).catch(
            () => undefined
          );
        }
      },
      confirmWear: (outfitArg) => {
        const { taste, user, currentOutfit } = get();
        const outfit = outfitArg || currentOutfit;
        if (!outfit?.garmentIds?.length) return;
        const nextTaste = withWearLog(taste, outfit);
        set({ taste: nextTaste });
        if (isCloudUid(user?.uid) && user) {
          void saveUserProfile(user.uid, { taste: nextTaste }).catch(
            () => undefined
          );
        }
      },
      setCurrentOutfit: (o) => {
        set({ currentOutfit: o });
        const user = get().user;
        if (o) persistOutfitAndTaste(user?.uid, o, get().taste);
      },
      markShopifyConnected: (shop, itemCount = 0) => {
        const user = get().user;
        if (!user) return;
        const connectedStores = Array.from(
          new Set([...user.connectedStores, "shopify" as CommerceSource])
        );
        set((state) => ({
          connections: state.connections.map((c) =>
            c.source === "shopify"
              ? {
                  ...c,
                  connected: true,
                  lastSyncAt: new Date().toISOString(),
                  itemCount: itemCount || c.itemCount,
                  status: "idle" as const,
                }
              : c
          ),
          user: { ...user, connectedStores },
        }));
        if (isCloudUid(user.uid)) {
          void saveUserProfile(user.uid, { connectedStores }).catch(
            () => undefined
          );
        }
        void shop;
      },
      disconnectStore: (source) => {
        const user = get().user;
        if (!user) return;
        const connectedStores = user.connectedStores.filter((s) => s !== source);
        set({
          connections: get().connections.map((c) =>
            c.source === source
              ? { ...c, connected: false, status: "idle" as const }
              : c
          ),
          user: { ...user, connectedStores },
        });
        if (isCloudUid(user.uid)) {
          void saveUserProfile(user.uid, { connectedStores }).catch(
            () => undefined
          );
        }
      },
      addGarments: (items) => {
        const user = get().user;
        const normalized = items.map(sanitizeGarmentCategory);
        set((state) => {
          const existingKeys = new Set(
            state.wardrobe.map(
              (g) => `${g.orderId || ""}|${g.name}|${g.brand}`.toLowerCase()
            )
          );
          const fresh = normalized.filter((g) => {
            const key = `${g.orderId || ""}|${g.name}|${g.brand}`.toLowerCase();
            if (existingKeys.has(key) && g.orderId) return false;
            existingKeys.add(key);
            return true;
          });
          return { wardrobe: [...fresh, ...state.wardrobe] };
        });
        if (isCloudUid(user?.uid) && user && normalized.length) {
          void upsertGarments(
            user.uid,
            normalized.map((g) => ({ ...g, userId: user.uid }))
          )
            .then((saved) => {
              // Replace any data-URL versions with Storage URLs
              set((state) => {
                const byId = new Map(saved.map((g) => [g.id, g]));
                return {
                  wardrobe: state.wardrobe.map((g) => byId.get(g.id) || g),
                };
              });
            })
            .catch(() => undefined);
        }
      },
      removeGarment: async (garmentId) => {
        const { wardrobe, user, currentOutfit, taste } = get();
        const piece = wardrobe.find((g) => g.id === garmentId);
        if (!piece) return;

        set((state) => {
          const nextWardrobe = state.wardrobe.filter((g) => g.id !== garmentId);
          const stillInLook = state.currentOutfit?.garmentIds?.includes(garmentId);
          return {
            wardrobe: nextWardrobe,
            currentOutfit: stillInLook ? null : state.currentOutfit,
            taste: {
              ...state.taste,
              rejectedIds: state.taste.rejectedIds.filter((id) => id !== garmentId),
            },
          };
        });

        if (isCloudUid(user?.uid) && user) {
          try {
            await deleteGarmentCloud(user.uid, piece);
          } catch {
            // Keep local removal even if cloud delete fails
          }
          if (currentOutfit?.garmentIds?.includes(garmentId)) {
            persistOutfitAndTaste(user.uid, null, {
              ...taste,
              rejectedIds: taste.rejectedIds.filter((id) => id !== garmentId),
            });
          }
        }
      },
      setVoiceListening: (v) => set({ voiceListening: v }),
      setTranscript: (t) => set({ lastTranscript: t }),
      setSubscription: (status) => {
        // Local UI only — Stripe webhook / ensure-trial API own Firestore entitlement.
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, subscriptionStatus: status } });
      },
    }),
    {
      name: "voicedress-wardrobe-v4",
      partialize: (state) => ({
        user: stripHeavyUrls(state.user),
        // Cache only cloud-safe URLs — data URLs live in IndexedDB / Storage
        wardrobe: state.wardrobe.filter(
          (g) =>
            g.imageUrl &&
            !g.imageUrl.startsWith("data:") &&
            g.imageUrl.length < 2000
        ),
        connections: state.connections,
        taste: state.taste,
        currentOutfit: null,
      }),
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
        void state?.hydrateAvatar();
        try {
          localStorage.removeItem("voicedress-wardrobe-v3");
          localStorage.removeItem("voicedress-wardrobe-v2");
          localStorage.removeItem("voicedress-wardrobe-v1");
        } catch {
          // ignore
        }
        void WARDROBE_SEED_VERSION;
      },
    }
  )
);
