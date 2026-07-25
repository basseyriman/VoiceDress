"use client";

import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import type { VoiceActionHandlers } from "@/lib/voice";
import { useAetherStore } from "@/store/aether-store";

/** Build app-aware voice handlers from the live store + router. */
export function buildVoiceHandlers(
  router: AppRouterInstance,
  pathname?: string
): VoiceActionHandlers {
  const state = useAetherStore.getState();
  return {
    generateOutfit: state.generateOutfit,
    generateOutfitAsync: state.generateOutfitAsync,
    swapFromVoice: state.swapFromVoice,
    pickGarmentById: state.pickGarmentById,
    onOpenWardrobe: () => router.push("/wardrobe"),
    onNavigate: (path) => router.push(path),
    onExplainLook: () => state.currentOutfit?.rationale,
    onWeather: () => {
      const w = state.weather;
      if (!w) return "Weather isn’t loaded yet.";
      return `${Math.round(w.tempC)} degrees, ${w.condition} in ${w.location}. Rain chance ${w.precipChance} percent.`;
    },
    getContext: () => ({
      pathname: pathname || "/today",
      weather: state.weather
        ? `${Math.round(state.weather.tempC)}°C ${state.weather.condition} ${state.weather.location}`
        : null,
      connectedStores: state.user?.connectedStores || [],
      outfit: (state.currentOutfit?.garments || []).map((g) => ({
        id: g.id,
        name: g.name,
        category: g.category,
      })),
      wardrobe: state.wardrobe.map((g) => ({
        id: g.id,
        name: g.name,
        brand: g.brand,
        category: g.category,
        colors: g.colors,
      })),
    }),
  };
}
