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
  const path = pathname || "";

  /** After dressing, open Today so the look is visible — don’t bounce for no reason. */
  const showLookIfNeeded = () => {
    const hasLook = Boolean(useAetherStore.getState().currentOutfit);
    if (
      hasLook &&
      !path.startsWith("/today") &&
      !path.startsWith("/try-on")
    ) {
      router.push("/today");
    }
  };

  return {
    generateOutfit: (occasion, style, opts) => {
      const outfit = state.generateOutfit(occasion, style, opts);
      showLookIfNeeded();
      return outfit;
    },
    generateOutfitAsync: async (occasion, style, opts) => {
      const fn = state.generateOutfitAsync || state.generateOutfit;
      const outfit = await fn(occasion, style, opts);
      showLookIfNeeded();
      return outfit;
    },
    swapFromVoice: (category, style, occasion, garmentQuery, sourceQuery) => {
      const result = state.swapFromVoice(
        category,
        style,
        occasion,
        garmentQuery,
        sourceQuery
      );
      showLookIfNeeded();
      return result;
    },
    pickGarmentById: (garmentId) => {
      const result = state.pickGarmentById?.(garmentId);
      showLookIfNeeded();
      return result;
    },
    onOpenWardrobe: () => router.push("/wardrobe"),
    onNavigate: (next) => router.push(next),
    onExplainLook: () => {
      const o = useAetherStore.getState().currentOutfit;
      if (!o) return "No look yet — tell me where you’re going.";
      return o.stylingGuide || o.rationale;
    },
    onWeather: () => {
      const w = useAetherStore.getState().weather;
      if (!w) return "Weather isn’t loaded yet.";
      return `${Math.round(w.tempC)} degrees, ${w.condition} in ${w.location}. Rain chance ${w.precipChance} percent.`;
    },
    ensureWeather: () => useAetherStore.getState().ensureWeather(),
    getContext: () => {
      const live = useAetherStore.getState();
      const o = live.currentOutfit;
      return {
        pathname: path || "/today",
        weather: live.weather
          ? `${Math.round(live.weather.tempC)}°C ${live.weather.condition} ${live.weather.location}`
          : null,
        weatherFull: live.weather,
        connectedStores: live.user?.connectedStores || [],
        occasion: o?.occasion || null,
        style: o?.style || live.user?.stylePrefs?.[0] || null,
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
        wardrobe: live.wardrobe.map((g) => ({
          id: g.id,
          name: g.name,
          brand: g.brand,
          category: g.category,
          colors: g.colors,
          fabric: g.fabric,
          formality: g.formality,
        })),
        wardrobeFull: live.wardrobe,
      };
    },
  };
}
