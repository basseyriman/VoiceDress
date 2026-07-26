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
    onExplainLook: () => {
      const o = state.currentOutfit;
      if (!o) return "No look yet — tell me where you’re going.";
      return o.stylingGuide || o.rationale;
    },
    onWeather: () => {
      const w = state.weather;
      if (!w) return "Weather isn’t loaded yet.";
      return `${Math.round(w.tempC)} degrees, ${w.condition} in ${w.location}. Rain chance ${w.precipChance} percent.`;
    },
    getContext: () => {
      const o = state.currentOutfit;
      return {
        pathname: pathname || "/today",
        weather: state.weather
          ? `${Math.round(state.weather.tempC)}°C ${state.weather.condition} ${state.weather.location}`
          : null,
        weatherFull: state.weather,
        connectedStores: state.user?.connectedStores || [],
        occasion: o?.occasion || null,
        style: o?.style || state.user?.stylePrefs?.[0] || null,
        stylingGuide: o?.stylingGuide || null,
        rationale: o?.rationale || null,
        outfit: (o?.garments || []).map((g) => ({
          id: g.id,
          name: g.name,
          category: g.category,
          fabric: g.fabric,
          formality: g.formality,
          colors: g.colors,
        })),
        outfitGarments: o?.garments || [],
        wardrobe: state.wardrobe.map((g) => ({
          id: g.id,
          name: g.name,
          brand: g.brand,
          category: g.category,
          colors: g.colors,
          fabric: g.fabric,
          formality: g.formality,
        })),
        wardrobeFull: state.wardrobe,
      };
    },
  };
}
