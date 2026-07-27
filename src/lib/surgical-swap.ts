import type { Garment, Outfit, TasteMemory, WeatherSnapshot } from "@/lib/types";
import {
  inferCategoryFromSpeech,
  matchGarmentFromSpeech,
  parseSwapSpeech,
} from "@/lib/garment-match";
import { isHosieryOrSocks } from "@/lib/commerce";
import { suggestOutfit } from "@/lib/outfit-engine";
import { resolvePrimaryStyle } from "@/lib/style-options";

const ORDER = [
  "top",
  "dress",
  "bottom",
  "outerwear",
  "shoes",
  "accessory",
  "bag",
] as const;

function sortGarments(garments: Garment[]): Garment[] {
  return [...garments].sort(
    (a, b) =>
      ORDER.indexOf(a.category as (typeof ORDER)[number]) -
      ORDER.indexOf(b.category as (typeof ORDER)[number])
  );
}

/**
 * Replace exactly one piece on the current look.
 * Never rebuilds a full outfit — that was causing “starts all over”.
 */
export function surgicalSwapLook(input: {
  wardrobe: Garment[];
  weather: WeatherSnapshot;
  currentOutfit: Outfit;
  category: Garment["category"];
  style?: string;
  stylePrefs?: string[];
  occasion?: string;
  garmentQuery?: string;
  sourceQuery?: string;
  taste: TasteMemory;
}): Outfit | null {
  const {
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
  } = input;

  const currentGarments = currentOutfit.garments || [];
  if (!currentGarments.length || !wardrobe.length) return null;

  const primaryStyle = resolvePrimaryStyle(stylePrefs, style);
  const swapSpeech = garmentQuery
    ? parseSwapSpeech(garmentQuery)
    : { isSwap: false as const };
  const targetQuery =
    (swapSpeech.isSwap && swapSpeech.targetQuery) || garmentQuery || undefined;
  const sourceQ =
    sourceQuery ||
    (swapSpeech.isSwap ? swapSpeech.sourceQuery : undefined) ||
    undefined;
  let resolvedCategory: Garment["category"] =
    (swapSpeech.isSwap && swapSpeech.category) || category;

  // —— Which worn piece to remove ——
  let replaceId: string | undefined;
  if (sourceQ) {
    replaceId =
      matchGarmentFromSpeech(sourceQ, currentGarments, resolvedCategory)?.id ||
      matchGarmentFromSpeech(sourceQ, currentGarments)?.id;
  }
  if (!replaceId && targetQuery) {
    resolvedCategory =
      inferCategoryFromSpeech(targetQuery) || resolvedCategory;
  }
  if (!replaceId) {
    if (resolvedCategory === "accessory") {
      const accessories = currentGarments.filter(
        (g) => g.category === "accessory"
      );
      const q = `${sourceQ || ""} ${targetQuery || ""} ${garmentQuery || ""}`;
      if (/glass|sunglass|optic|frame/i.test(q)) {
        replaceId = accessories.find((g) =>
          /glass|sunglass|optic|frame/i.test(
            `${g.name} ${(g.tags || []).join(" ")}`
          )
        )?.id;
      } else if (/watch|wrist|chrono/i.test(q)) {
        replaceId = accessories.find((g) =>
          /watch|wrist|chrono/i.test(`${g.name} ${(g.tags || []).join(" ")}`)
        )?.id;
      }
      replaceId = replaceId || accessories[0]?.id;
    } else {
      replaceId = currentGarments.find(
        (g) => g.category === resolvedCategory
      )?.id;
    }
  }
  if (!replaceId && garmentQuery) {
    replaceId = matchGarmentFromSpeech(garmentQuery, currentGarments)?.id;
  }
  if (!replaceId) return currentOutfit;

  const replaced = currentGarments.find((g) => g.id === replaceId);
  if (replaced) resolvedCategory = replaced.category;

  // —— Replacement from wardrobe (never something already on) ——
  const notWorn = wardrobe.filter(
    (g) => !currentGarments.some((c) => c.id === g.id)
  );
  let nextPiece: Garment | undefined;

  if (targetQuery) {
    nextPiece =
      matchGarmentFromSpeech(targetQuery, notWorn, resolvedCategory) ||
      matchGarmentFromSpeech(targetQuery, notWorn) ||
      undefined;
    if (nextPiece && nextPiece.category !== resolvedCategory) {
      const inCat = matchGarmentFromSpeech(
        targetQuery,
        notWorn.filter((g) => g.category === resolvedCategory)
      );
      if (inCat) nextPiece = inCat;
    }
  }

  if (!nextPiece) {
    const pool =
      resolvedCategory === "shoes"
        ? notWorn.filter(
            (g) => g.category === "shoes" && !isHosieryOrSocks(g)
          )
        : notWorn.filter((g) => g.category === resolvedCategory);

    if (pool.length === 1) {
      nextPiece = pool[0];
    } else if (pool.length > 1) {
      // Score within the current look — but only keep the replacement id
      const suggested = suggestOutfit({
        wardrobe,
        weather,
        occasion: occasion || currentOutfit.occasion || "today",
        style: primaryStyle,
        stylePrefs,
        swapCategory: resolvedCategory,
        replaceGarmentId: replaceId,
        currentOutfit: currentGarments,
        taste,
        demoteIds: [replaceId],
        demotePenalty: -14,
      });
      nextPiece =
        suggested.garments?.find(
          (g) =>
            g.id !== replaceId &&
            pool.some((p) => p.id === g.id)
        ) || pool[0];
    }
  }

  if (!nextPiece || nextPiece.id === replaceId) {
    return currentOutfit;
  }

  const nextGarments = sortGarments([
    ...currentGarments.filter((g) => g.id !== replaceId),
    nextPiece,
  ]);

  return {
    ...currentOutfit,
    id: `outfit_${Date.now()}`,
    garmentIds: nextGarments.map((g) => g.id),
    garments: nextGarments,
    // Keep name/occasion — this is a tweak, not a new suggestion
    createdAt: new Date().toISOString(),
  };
}

/** Put a specific wardrobe piece onto the current look (one id only). */
export function surgicalPickGarment(
  currentOutfit: Outfit,
  piece: Garment
): Outfit {
  const currentGarments = currentOutfit.garments || [];
  const replaceId =
    currentGarments.find(
      (g) => g.category === piece.category && g.id !== piece.id
    )?.id ||
    currentGarments.find((g) => g.category === piece.category)?.id;

  if (replaceId === piece.id) return currentOutfit;

  let nextGarments: Garment[];
  if (!replaceId) {
    nextGarments = [...currentGarments, piece];
  } else {
    nextGarments = [
      ...currentGarments.filter((g) => g.id !== replaceId),
      piece,
    ];
  }

  nextGarments = sortGarments(nextGarments);
  return {
    ...currentOutfit,
    id: `outfit_${Date.now()}`,
    garmentIds: nextGarments.map((g) => g.id),
    garments: nextGarments,
    createdAt: new Date().toISOString(),
  };
}
