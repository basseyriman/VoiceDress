/**
 * Virtual try-on architecture (VoiceDress)
 * ------------------------------------
 * 1. Apparel (top/dress/bottom/outerwear) → FASHN Try-On Max (FASHN_API_KEY).
 *    Falls back to fal-hosted FASHN v1.6 if Max is unavailable.
 * 2. Outerwear soft-fallback → fal Kontext layer + client color composite.
 * 3. Shoes / glasses / watch → fal Kontext (or OpenAI if configured).
 */

export const TRYON_APPAREL_CATEGORIES = [
  "top",
  "dress",
  "bottom",
  "outerwear",
] as const;

export const TRYON_FINISH_CATEGORIES = ["shoes", "accessory"] as const;

/** Max pieces sent in the apparel stage (base + outerwear). */
export const TRYON_APPAREL_MAX_PIECES = 3;

export function isApparelTryOnCategory(category: string) {
  return (TRYON_APPAREL_CATEGORIES as readonly string[]).includes(category);
}

export function isFinishTryOnCategory(category: string) {
  return (TRYON_FINISH_CATEGORIES as readonly string[]).includes(category);
}

/** Full suggested look for the UI (includes shoes + accessories). */
export function lookPiecesForTryOn<
  T extends { category: string; name?: string; tags?: string[] },
>(garments: T[]) {
  const apparelOrder = ["top", "dress", "bottom", "outerwear"] as const;
  const apparel = apparelOrder
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as T[];
  const shoes = garments.find((g) => g.category === "shoes");
  const accessories = garments.filter((g) => g.category === "accessory");
  const isWatch = (g: T) =>
    /watch|wrist|chrono|time/i.test(`${g.name || ""} ${(g.tags || []).join(" ")}`);
  const isEye = (g: T) =>
    /glass|frame|optic|sunglass|spec/i.test(
      `${g.name || ""} ${(g.tags || []).join(" ")}`
    );
  const eyewear = accessories.filter(isEye);
  const watches = accessories.filter(isWatch);
  const other = accessories.filter((g) => !isEye(g) && !isWatch(g));
  return [
    ...apparel,
    ...(shoes ? [shoes] : []),
    ...eyewear,
    ...watches,
    ...other,
  ];
}

/**
 * Pieces for the apparel stage. Always keeps outerwear when present —
 * previously `.slice(0, 2)` dropped blazers/coats and left them "pending".
 */
export function apparelForTryOn<T extends { category: string }>(garments: T[]) {
  const order = ["top", "dress", "bottom", "outerwear"] as const;
  const all = order
    .map((cat) => garments.find((g) => g.category === cat))
    .filter(Boolean) as T[];

  if (all.length <= TRYON_APPAREL_MAX_PIECES) return all;

  const outer = all.find((g) => g.category === "outerwear");
  const base = all
    .filter((g) => g.category !== "outerwear")
    .slice(0, TRYON_APPAREL_MAX_PIECES - (outer ? 1 : 0));
  return outer ? [...base, outer] : base;
}

export function finishingPieces<T extends { category: string }>(garments: T[]) {
  return garments.filter((g) =>
    (TRYON_FINISH_CATEGORIES as readonly string[]).includes(g.category)
  );
}

export function isBodyTryOnCategory(category: string) {
  return (
    isApparelTryOnCategory(category) || isFinishTryOnCategory(category)
  );
}
