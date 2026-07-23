"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  CommerceConnection,
  Garment,
  Outfit,
  UserProfile,
  WeatherSnapshot,
} from "@/lib/types";
import { seedWardrobe } from "@/lib/seed-data";
import { defaultConnections, simulatePurchaseIngest } from "@/lib/commerce";
import { suggestOutfit } from "@/lib/outfit-engine";

interface AetherState {
  user: UserProfile | null;
  wardrobe: Garment[];
  currentOutfit: Outfit | null;
  weather: WeatherSnapshot | null;
  connections: CommerceConnection[];
  voiceListening: boolean;
  lastTranscript: string;
  hydrated: boolean;
  setHydrated: (v: boolean) => void;
  signInLocal: (profile: Partial<UserProfile> & { email: string; displayName: string }) => void;
  signOutLocal: () => void;
  setWeather: (w: WeatherSnapshot) => void;
  setAvatar: (url: string, status: UserProfile["avatarStatus"]) => void;
  generateOutfit: (occasion?: string, style?: string) => Outfit | null;
  swapFromVoice: (category: Garment["category"], style?: string, occasion?: string) => Outfit | null;
  setCurrentOutfit: (o: Outfit | null) => void;
  connectStore: (source: CommerceConnection["source"]) => Garment[];
  disconnectStore: (source: CommerceConnection["source"]) => void;
  addGarments: (items: Garment[]) => void;
  setVoiceListening: (v: boolean) => void;
  setTranscript: (t: string) => void;
  setSubscription: (status: UserProfile["subscriptionStatus"]) => void;
}

const DEMO_UID = "aether_local_user";

export const useAetherStore = create<AetherState>()(
  persist(
    (set, get) => ({
      user: null,
      wardrobe: [],
      currentOutfit: null,
      weather: null,
      connections: defaultConnections(),
      voiceListening: false,
      lastTranscript: "",
      hydrated: false,
      setHydrated: (v) => set({ hydrated: v }),
      signInLocal: (profile) => {
        const existing = get().wardrobe;
        const wardrobe = existing.length ? existing : seedWardrobe(DEMO_UID);
        set({
          user: {
            uid: DEMO_UID,
            email: profile.email,
            displayName: profile.displayName,
            photoURL: profile.photoURL,
            avatarUrl: profile.avatarUrl,
            avatarStatus: profile.avatarStatus || "none",
            city: profile.city || "London",
            lat: 51.5074,
            lon: -0.1278,
            stylePrefs: profile.stylePrefs || ["quiet luxury", "old money"],
            subscriptionStatus: profile.subscriptionStatus || "trialing",
            connectedStores: [],
            voiceEnabled: true,
            createdAt: new Date().toISOString(),
          },
          wardrobe,
        });
      },
      signOutLocal: () =>
        set({
          user: null,
          currentOutfit: null,
          lastTranscript: "",
        }),
      setWeather: (w) => set({ weather: w }),
      setAvatar: (url, status) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, avatarUrl: url, avatarStatus: status } });
      },
      generateOutfit: (occasion = "today", style = "quiet luxury") => {
        const { wardrobe, weather, user } = get();
        if (!weather) return null;
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion,
          style: style || user?.stylePrefs[0] || "quiet luxury",
        });
        set({ currentOutfit: outfit });
        return outfit;
      },
      swapFromVoice: (category, style, occasion) => {
        const { wardrobe, weather, currentOutfit, user } = get();
        if (!weather) return null;
        const outfit = suggestOutfit({
          wardrobe,
          weather,
          occasion: occasion || currentOutfit?.occasion || "today",
          style: style || currentOutfit?.style || user?.stylePrefs[0] || "old money",
          swapCategory: category,
          currentOutfit: currentOutfit?.garments,
        });
        set({ currentOutfit: outfit });
        return outfit;
      },
      setCurrentOutfit: (o) => set({ currentOutfit: o }),
      connectStore: (source) => {
        const user = get().user;
        if (!user) return [];
        const items = simulatePurchaseIngest(user.uid, source);
        set((state) => ({
          wardrobe: [...items, ...state.wardrobe],
          connections: state.connections.map((c) =>
            c.source === source
              ? {
                  ...c,
                  connected: true,
                  lastSyncAt: new Date().toISOString(),
                  itemCount: c.itemCount + items.length,
                  status: "idle",
                }
              : c
          ),
          user: {
            ...user,
            connectedStores: Array.from(new Set([...user.connectedStores, source])),
          },
        }));
        return items;
      },
      disconnectStore: (source) => {
        const user = get().user;
        if (!user) return;
        set({
          connections: get().connections.map((c) =>
            c.source === source
              ? { ...c, connected: false, status: "idle" }
              : c
          ),
          user: {
            ...user,
            connectedStores: user.connectedStores.filter((s) => s !== source),
          },
        });
      },
      addGarments: (items) =>
        set((state) => ({ wardrobe: [...items, ...state.wardrobe] })),
      setVoiceListening: (v) => set({ voiceListening: v }),
      setTranscript: (t) => set({ lastTranscript: t }),
      setSubscription: (status) => {
        const user = get().user;
        if (!user) return;
        set({ user: { ...user, subscriptionStatus: status } });
      },
    }),
    {
      name: "aether-wardrobe-v1",
      onRehydrateStorage: () => (state) => {
        state?.setHydrated(true);
      },
    }
  )
);
