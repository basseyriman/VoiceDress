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
import { isSeedWardrobe } from "@/lib/seed-data";
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
import { surgicalPickGarment, surgicalSwapLook } from "@/lib/surgical-swap";
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
  /** Fetch forecast into the store if missing — used by voice on any page. */
  ensureWeather: () => Promise<WeatherSnapshot | null>;
  setAvatar: (
    url: string,
    status: UserProfile["avatarStatus"],
    faceBox?: { x: number; y: number; w: number; h: number }
  ) => Promise<void>;
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
          seedGarments: [],
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
            avatarStatus:
              data.profile.avatarStatus ||
              ((data.profile.avatarUrl || data.profile.photoURL || "").startsWith(
                "http"
              )
                ? "ready"
                : "none"),
            city: data.profile.city || "London",
            lat: data.profile.lat ?? 51.5074,
            lon: data.profile.lon ?? -0.1278,
            stylePrefs: data.profile.stylePrefs || ["quiet luxury", "old money"],
            subscriptionStatus:
              data.profile.subscriptionStatus ||
              (data.profile.trialEndsAt ? "trialing" : "none"),
            subscriptionPlan: data.profile.subscriptionPlan,
            comped: data.profile.comped === true,
            trialEndsAt: data.profile.trialEndsAt,
            freePhotoTryOnsUsed: data.profile.freePhotoTryOnsUsed ?? 0,
            photoTryOnsMonthKey: data.profile.photoTryOnsMonthKey,
            photoTryOnsThisMonth: data.profile.photoTryOnsThisMonth ?? 0,
            photoTryOnCredits: data.profile.photoTryOnCredits ?? 0,
            stripeCustomerId: data.profile.stripeCustomerId,
            stripeSubscriptionId: data.profile.stripeSubscriptionId,
            connectedStores: data.profile.connectedStores || [],
            voiceEnabled: data.profile.voiceEnabled ?? true,
            createdAt: data.profile.createdAt || new Date().toISOString(),
          };
          // Never auto-seed placeholders — new users build a real wardrobe first.
          let wardrobe = data.wardrobe || [];
          if (wardrobe.length && isSeedWardrobe(wardrobe)) {
            for (const g of wardrobe) {
              void deleteGarmentCloud(uid, g).catch(() => undefined);
            }
            wardrobe = [];
          } else if (wardrobe.length) {
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
            subscriptionPlan: _sp,
            comped: _comp,
            trialEndsAt: _t,
            freePhotoTryOnsUsed: _f,
            photoTryOnsMonthKey: _mk,
            photoTryOnsThisMonth: _mt,
            photoTryOnCredits: _cr,
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
            subscriptionPlan: profile.subscriptionPlan,
            comped: profile.comped === true,
            trialEndsAt: profile.trialEndsAt,
            freePhotoTryOnsUsed: profile.freePhotoTryOnsUsed ?? 0,
            photoTryOnsMonthKey: profile.photoTryOnsMonthKey,
            photoTryOnsThisMonth: profile.photoTryOnsThisMonth ?? 0,
            photoTryOnCredits: profile.photoTryOnCredits ?? 0,
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
      ensureWeather: async () => {
        const existing = get().weather;
        if (existing) return existing;
        const user = get().user;
        const lat = user?.lat ?? 51.5074;
        const lon = user?.lon ?? -0.1278;
        const location = user?.city || "London";
        try {
          const res = await fetch(
            `/api/weather?lat=${lat}&lon=${lon}&location=${encodeURIComponent(location)}`
          );
          if (!res.ok) return null;
          const data = (await res.json()) as WeatherSnapshot;
          set({ weather: data });
          return data;
        } catch {
          return null;
        }
      },
      setAvatar: async (url, status, faceBox) => {
        const user = get().user;
        if (!user) return;

        // Local-first: unlock the app immediately, then persist to Storage
        if (url.startsWith("data:")) {
          await saveAvatarBlob(url);
        }

        set({
          user: {
            ...user,
            avatarUrl: url,
            photoURL: user.photoURL,
            avatarStatus: status,
            ...(faceBox !== undefined && { avatarFaceBox: faceBox }),
          },
        });

        if (!isCloudUid(user.uid)) return;

        if (url.startsWith("data:")) {
          try {
            const cloudUrl = await uploadUserAvatar(user.uid, url);
            const current = get().user;
            if (!current || current.uid !== user.uid) return;
            set({
              user: {
                ...current,
                avatarUrl: cloudUrl,
                photoURL: cloudUrl,
                avatarStatus: status,
                ...(faceBox !== undefined && { avatarFaceBox: faceBox }),
              },
            });
            await saveAvatarBlob(cloudUrl);
            await saveUserProfile(user.uid, {
              avatarUrl: cloudUrl,
              photoURL: cloudUrl,
              avatarStatus: status,
              ...(faceBox !== undefined && { avatarFaceBox: faceBox }),
            });
          } catch {
            // Still mark ready in Firestore so login doesn’t restart photo setup
            await saveUserProfile(user.uid, {
              avatarStatus: status,
              ...(faceBox !== undefined && { avatarFaceBox: faceBox }),
            }).catch(() => undefined);
          }
        } else {
          await saveUserProfile(user.uid, {
            avatarUrl: url,
            photoURL: url,
            avatarStatus: status,
            ...(faceBox !== undefined && { avatarFaceBox: faceBox }),
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
        let { wardrobe, weather, user, taste, currentOutfit } = get();
        if (!weather) {
          weather = await get().ensureWeather();
        }
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

        // No current look → build a fresh one
        if (!currentOutfit?.garments?.length) {
          const primaryStyle = resolvePrimaryStyle(stylePrefs, style);
          const outfit = suggestOutfit({
            wardrobe,
            weather,
            occasion: occasion || "today",
            style: primaryStyle,
            stylePrefs,
            taste,
          });
          const nextTaste: TasteMemory = {
            ...taste,
            preferredStyle: stylePrefs?.[0] || outfit.style,
            recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
          };
          set({ currentOutfit: outfit, taste: nextTaste });
          persistOutfitAndTaste(user?.uid, outfit, nextTaste);
          return outfit;
        }

        // ALWAYS surgical when a look is on — never rebuild the whole outfit
        const outfit = surgicalSwapLook({
          wardrobe,
          weather,
          currentOutfit,
          category,
          style,
          stylePrefs,
          occasion,
          garmentQuery,
          sourceQuery,
          taste,
        });
        if (!outfit || outfit === currentOutfit) return currentOutfit;

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
        const { wardrobe, currentOutfit, taste, user } = get();
        if (!currentOutfit?.garments || !wardrobe.length) return null;
        const piece = wardrobe.find((g) => g.id === garmentId);
        if (!piece) return null;

        const outfit = surgicalPickGarment(currentOutfit, piece);
        if (outfit === currentOutfit) return currentOutfit;

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
        const normalized = sanitizeWardrobe(items);
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
      },
    }
  )
);
