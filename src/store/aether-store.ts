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
import { defaultConnections } from "@/lib/commerce";
import { suggestOutfit, type OccasionProfile } from "@/lib/outfit-engine";
import { inferOccasionProfile } from "@/lib/occasion-profile";
import { matchGarmentFromSpeech } from "@/lib/garment-match";
import {
  AVATAR_IDB_REF,
  clearAvatarBlob,
  loadAvatarBlob,
  saveAvatarBlob,
} from "@/lib/avatar-storage";
import {
  bootstrapUserCloud,
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
  generateOutfit: (occasion?: string, style?: string) => Outfit | null;
  generateOutfitAsync: (
    occasion?: string,
    style?: string
  ) => Promise<Outfit | null>;
  swapFromVoice: (
    category: Garment["category"],
    style?: string,
    occasion?: string,
    garmentQuery?: string
  ) => Outfit | null;
  pickGarmentById: (garmentId: string) => Outfit | null;
  rejectPiece: (garmentId: string) => void;
  setCurrentOutfit: (o: Outfit | null) => void;
  markShopifyConnected: (shop: string, itemCount?: number) => void;
  disconnectStore: (source: CommerceSource) => void;
  addGarments: (items: Garment[]) => void;
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

async function fetchOccasionProfile(
  occasion: string,
  style?: string
): Promise<OccasionProfile> {
  try {
    const res = await fetch("/api/outfit/understand-occasion", {
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
        set({
          user: profile,
          wardrobe,
          currentOutfit: outfit || null,
          taste: taste || { rejectedIds: [], recentOutfitIds: [] },
          cloudReady: true,
        });
        if (profile.avatarUrl?.startsWith("http")) {
          void saveAvatarBlob(profile.avatarUrl).catch(() => undefined);
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
            subscriptionStatus: data.profile.subscriptionStatus || "trialing",
            stripeCustomerId: data.profile.stripeCustomerId,
            connectedStores: data.profile.connectedStores || [],
            voiceEnabled: data.profile.voiceEnabled ?? true,
            createdAt: data.profile.createdAt || new Date().toISOString(),
          };
          // If cloud wardrobe empty (edge), seed once
          let wardrobe = data.wardrobe;
          if (!wardrobe.length) {
            wardrobe = await upsertGarments(uid, seedWardrobe(uid));
          }
          get().applyCloudSession({
            profile,
            wardrobe,
            outfit: data.outfit,
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
          void saveUserProfile(user.uid, {
            ...patch,
            taste: get().taste,
          }).catch(() => undefined);
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
            subscriptionStatus: profile.subscriptionStatus || "trialing",
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

        let cloudUrl = url;
        if (url.startsWith("data:")) {
          await saveAvatarBlob(url);
          if (isCloudUid(user.uid)) {
            try {
              cloudUrl = await uploadUserAvatar(user.uid, url);
            } catch {
              cloudUrl = url;
            }
          }
        }

        // Keep a local displayable URL in memory (data:) so Today never shows a broken Storage img
        const displayUrl = url.startsWith("data:") ? url : cloudUrl;

        const next = {
          ...user,
          avatarUrl: displayUrl,
          photoURL: cloudUrl,
          avatarStatus: status,
        };
        set({ user: next });
        if (isCloudUid(user.uid)) {
          void saveUserProfile(user.uid, {
            avatarUrl: cloudUrl,
            photoURL: cloudUrl,
            avatarStatus: status,
          }).catch(() => undefined);
        }
      },
      generateOutfit: (occasion = "today", style = "quiet luxury") => {
        const { wardrobe, weather, user, taste } = get();
        if (!weather) return null;
        const profile = inferOccasionProfile(
          occasion,
          style || user?.stylePrefs[0]
        );
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion,
          style: style || user?.stylePrefs[0] || "quiet luxury",
          profile,
          taste,
        });
        const nextTaste: TasteMemory = {
          ...taste,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
          preferredStyle: outfit.style,
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      generateOutfitAsync: async (
        occasion = "today",
        style = "quiet luxury"
      ) => {
        const { wardrobe, weather, user, taste } = get();
        if (!weather) return null;
        const profile = await fetchOccasionProfile(
          occasion,
          style || user?.stylePrefs[0]
        );
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: profile.label,
          style: style || profile.styleHints[0] || user?.stylePrefs[0],
          profile,
          taste,
        });
        const nextTaste: TasteMemory = {
          ...taste,
          recentOutfitIds: [outfit.id, ...taste.recentOutfitIds].slice(0, 20),
          preferredStyle: outfit.style,
        };
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      swapFromVoice: (category, style, occasion, garmentQuery) => {
        const { wardrobe, weather, currentOutfit, user, taste } = get();
        if (!weather) return null;

        const rejectedFromCurrent =
          currentOutfit?.garments?.find((g) => g.category === category)?.id;

        let forceGarmentId: string | undefined;
        if (garmentQuery) {
          const named = matchGarmentFromSpeech(
            garmentQuery,
            wardrobe,
            category
          );
          if (named) forceGarmentId = named.id;
        }

        const nextTaste: TasteMemory = {
          ...taste,
          rejectedIds: rejectedFromCurrent
            ? Array.from(
                new Set([rejectedFromCurrent, ...taste.rejectedIds])
              ).slice(0, 40)
            : taste.rejectedIds,
        };

        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: occasion || currentOutfit?.occasion || "today",
          style:
            style ||
            currentOutfit?.style ||
            user?.stylePrefs[0] ||
            "quiet luxury",
          swapCategory: forceGarmentId ? undefined : category,
          forceGarmentId,
          currentOutfit: currentOutfit?.garments,
          taste: nextTaste,
        });
        set({ currentOutfit: outfit, taste: nextTaste });
        persistOutfitAndTaste(user?.uid, outfit, nextTaste);
        return outfit;
      },
      pickGarmentById: (garmentId) => {
        const { wardrobe, weather, currentOutfit, taste, user } = get();
        if (!weather || !currentOutfit?.garments) return null;
        const piece = wardrobe.find((g) => g.id === garmentId);
        if (!piece) return null;
        const rejected = currentOutfit.garments.find(
          (g) => g.category === piece.category
        )?.id;
        const nextTaste: TasteMemory = {
          ...taste,
          rejectedIds: rejected
            ? Array.from(new Set([rejected, ...taste.rejectedIds])).slice(0, 40)
            : taste.rejectedIds,
        };
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: currentOutfit.occasion,
          style: currentOutfit.style,
          forceGarmentId: garmentId,
          currentOutfit: currentOutfit.garments,
          taste: nextTaste,
        });
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
        set((state) => {
          const existingKeys = new Set(
            state.wardrobe.map(
              (g) => `${g.orderId || ""}|${g.name}|${g.brand}`.toLowerCase()
            )
          );
          const fresh = items.filter((g) => {
            const key = `${g.orderId || ""}|${g.name}|${g.brand}`.toLowerCase();
            if (existingKeys.has(key) && g.orderId) return false;
            existingKeys.add(key);
            return true;
          });
          return { wardrobe: [...fresh, ...state.wardrobe] };
        });
        if (isCloudUid(user?.uid) && user && items.length) {
          void upsertGarments(
            user.uid,
            items.map((g) => ({ ...g, userId: user.uid }))
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
      setVoiceListening: (v) => set({ voiceListening: v }),
      setTranscript: (t) => set({ lastTranscript: t }),
      setSubscription: (status) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, subscriptionStatus: status } });
        if (isCloudUid(user.uid)) {
          void saveUserProfile(user.uid, { subscriptionStatus: status }).catch(
            () => undefined
          );
        }
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
